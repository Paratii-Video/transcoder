'use strict'

const { EventEmitter } = require('events')
const path = require('path')
const fs = require('fs')
const os = require('os')
const uuid = require('uuid')
const ffmpeg = require('fluent-ffmpeg')
const { mapLimit } = require('async')
const { forEach } = require('lodash')
const once = require('once')
const request = require('request')
const HLS = require('hls-parser')

const tutils = require('../ffmpeg/utils')
const db = require('../db')

const noop = function () {}

const config = {
  FFMPEG_PATH: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH || '/usr/bin/ffprobe',
  IPFS_API: '/ip4/127.0.0.1/tcp/5002'
}

// var ipfs = ipfsAPI(config.IPFS_API)
ffmpeg.setFfprobePath(config.FFPROBE_PATH)

const LP_RTMP_SERVER = 'rtmp://localhost:1935'

/**
 * Job is core transcoder part. it handles FFMPEG for a single job.
 * @class Job
 * @extends EventEmitter
 */
class Job extends EventEmitter {
  /**
   * Job's constructor
   * @param  {Object} opts initializing params.
   * @return {Job}      returns job instance
   */
  constructor (opts) {
    super()
    this.id = this._generateId()
    // TODO have a choice of a different folder instead of tmp
    this.rootPath = path.join(process.env.TMP_DIR, 'paratii-' + this.id)
    this.peerId = opts.peerId
    this.hash = opts.hash
    this.pipfs = opts.pipfs
    this.size = opts.size
    this.meta = {}

    this.retries = 0
    this._maxRetries = 60

    // livepeer stitching.
    // -----------------------
    this._stitch = {}
    this._stitch.masterPlaylist = {
      lastUpdate: null,
      uri: null,
      hls: null
    }

    // holds [playlist_uri] = playlist object.
    this._stitch.playlists = {}
    this._stitch.done = {}

    // add the Id to the db
    db.addId(this.id, this.hash)
  }

  /**
   * generates a UUID Random Id
   * @return {String} UUID
   */
  _generateId () {
    // only generate the id once.
    if (this.id) { return this.id }
    return uuid.v4()
  }

  /**
   * get the Manifest ID from livepeer
   * @param  {Function} cb callback
   * @return {string}      manifestID
   */
  _getManifestID (cb) {
    request({
      uri: 'http://localhost:8935/manifestID',
      method: 'GET'
    }, (err, res, body) => {
      if (err) {
        return cb(err)
      }
      if (body.toString() === 'ErrNotFound' || body.toString() === 'ErrNotFound\n') {
        setTimeout(() => {
          this._getManifestID(cb)
        }, 1000)
      } else {
        cb(null, body)
      }
    })
  }

  _concatHLSPlaylist (uri, playlist, cb) {
    if (this._stitch.playlists[uri]) {
      let oldPlaylist = this._stitch.playlists[uri]
      // TODO
      if (playlist.isMasterPlaylist) {
        let oldVariantsKeys = oldPlaylist.variants.map((variant) => {
          return variant.uri
        })
        playlist.variants.forEach((variant) => {
          if (oldVariantsKeys.indexOf(variant.uri) === -1) {
            oldPlaylist.variants.push(variant)
          } else {
            // variant is already there. move on.
          }
        })
      } else {
        let oldSegmentsKeys = oldPlaylist.segments.map((segment) => {
          return segment.uri
        })
        playlist.segments.forEach((segment) => {
          if (oldSegmentsKeys.indexOf(segment.uri) === -1) {
            oldPlaylist.segments.push(segment)
          } else {
            // segment is already there. move on.
          }
        })
      }

      this._stitch.playlists[uri] = oldPlaylist
    } else {
      this._stitch.playlists[uri] = playlist
    }

    // fs.writeFile(this.rootPath + `/${uri}`, HLS.stringify(this._stitch.playlists[uri]), (err) => {
    //   if (err) return cb(err)
    //   return cb(null, this._stitch.playlists[uri])
    // })

    // for paratii compatiblity, make sure master playlist is named master.m3u8
    if (playlist.isMasterPlaylist) {
      fs.writeFile(this.rootPath + `/master.m3u8`, HLS.stringify(this._stitch.playlists[uri]), (err) => {
        if (err) return cb(err)
        return cb(null, this._stitch.playlists[uri])
      })
    } else {
      fs.writeFile(this.rootPath + `/${uri}`, HLS.stringify(this._stitch.playlists[uri]), (err) => {
        if (err) return cb(err)
        return cb(null, this._stitch.playlists[uri])
      })
    }
  }

  /**
   * get m3u8 playlist from livepeer
   * @param  {string}   manifestID livepeerManifestId
   * @param  {Function} cb         callback (err, playlist)
   * @return {Object}              HLS m3u8 object.
   */
  _getHLSPlaylist (manifestID, cb) {
    request({
      uri: `http://localhost:8935/stream/${manifestID}.m3u8`,
      method: 'GET'
    }, (err, res, body) => {
      if (err) {
        return cb(err)
      }
      if (res && res.statusCode === 200) {
        try {
          let playlist = HLS.parse(body)
          // TODO concat these new? segments.
          console.log('saving HLS Playlist to ', this.rootPath)
          this._concatHLSPlaylist(`${manifestID}.m3u8`, playlist, cb)
          // fs.writeFile(this.rootPath + `/${manifestID}.m3u8`, body, (err) => {
          //   if (err) return cb(err)
          //   return cb(null, playlist)
          // })
        } catch (e) {
          return cb(e)
        }
      } else {
        if (body.toString() === 'ErrNotFound' || body.toString() === 'ErrNotFound\n') {
          console.log('ERRNOTFOUND!  manifestID: ', manifestID)
          this.stopPlaylistPolling()
          cb(null, '')
        } else {
          // console.log('_getHLSPlaylist ', manifestID, ' :', res)
          cb(new Error('wrong statusCode ' + body))
        }
      }
    })
  }

  /**
   * grabs a ts segment from livepeer node. store it in /tmp & ipfs.
   * @param  {string} uri the ts url.
   */
  _grabAnsStoreSegment (uri, cb) {
    cb = cb || noop
    if (this._stitch.done[uri]) {
      console.log('uri: ', uri, ' already grabbed')
      return cb(null, '')
    }
    request(`http://localhost:8935/stream/${uri}`)
    .pipe(fs.createWriteStream(this.rootPath + `/${uri}`))
    .on('response', (res) => {
      if (res && res.statusCode === 200) {
        console.log('saving segment ', uri, ' to ', this.rootPath)
        this._stitch.done[uri] = true
        setImmediate(() => {
          this._grabPreviousSegment(uri)
        })
        return cb(null, res.body)
      } else {
        if (res.body.toString() === 'ErrNotFound' || res.body.toString() === 'ErrNotFound\n') {
          console.log('ERRNOTFOUND! ', uri)
          this._grabNextSegment(uri)
          setTimeout(() => {
            this.stopPlaylistPolling()
          }, 1000)

          cb(null, '')
        } else {
          // console.log('_grabAnsStoreSegment ERR: ', res)
          cb(new Error('_grabAnsStoreSegment, wrong statusCode ' + res.body + ' ' + uri))
        }
      }
    })
    .on('error', (err) => {
      cb(err)
    })

    // request({
    //   uri: `http://localhost:8935/stream/${uri}`,
    //   method: 'GET'
    // }, (err, res, body) => {
    //   if (err) {
    //     return cb(err)
    //   }
    //   if (res && res.statusCode === 200) {
    //     console.log('saving segment ', uri, ' to ', this.rootPath)
    //     this._stitch.done[uri] = true
    //     fs.writeFile(this.rootPath + `/${uri}`, body, (err) => {
    //       if (err) return cb(err)
    //       setImmediate(() => {
    //         this._grabPreviousSegment(uri)
    //       })
    //       return cb(null, body)
    //     })
    //   } else {
    //     if (body.toString() === 'ErrNotFound' || body.toString() === 'ErrNotFound\n') {
    //       console.log('ERRNOTFOUND! ', uri)
    //       this._grabNextSegment(uri)
    //       setTimeout(() => {
    //         this.stopPlaylistPolling()
    //       }, 1000)
    //
    //       cb(null, '')
    //     } else {
    //       // console.log('_grabAnsStoreSegment ERR: ', res)
    //       cb(new Error('_grabAnsStoreSegment, wrong statusCode ' + body + ' ' + uri))
    //     }
    //   }
    // })
  }

  _grabPreviousSegment (uri) {
    // get current nonce.
    let nonceInt, nonceLength
    let nonce = uri.match(/_\d+\.ts/)
    if (nonce && nonce.length > 0) {
      nonceLength = nonce[0].length
      nonce = nonce[0].slice(1, -3) // convert _0123.ts to 0123
      try {
        nonceInt = parseInt(nonce)
      } catch (e) {
        console.log('err _grabPreviousSegment: couldn\'t parse ', nonce)
      }

      if (nonceInt === 0) {
        // cant get previous slice to that.
      } else if (nonceInt > 0) {
        let uriBase = uri.slice(0, uri.length - nonceLength)
        let previousUri = uriBase + '_' + String(nonceInt - 1) + '.ts'
        console.log('previousUri: ', previousUri)
        if (!this._stitch.done[previousUri]) {
          this._grabAnsStoreSegment(previousUri)
        }
      }
    }
  }

  /**
   * get the supposed next segment
   * @param  {string} uri livepeer ts segment
   */
  _grabNextSegment (uri) {
    if (this._alreadyCalledNextSegment) {
      // call this once.
    } else {
      this._alreadyCalledNextSegment = true
      // get current nonce.
      let nonceInt, nonceLength
      let nonce = uri.match(/_\d+\.ts/)
      if (nonce && nonce.length > 0) {
        nonceLength = nonce[0].length
        nonce = nonce[0].slice(1, -3) // convert _0123.ts to 0123
        try {
          nonceInt = parseInt(nonce)
        } catch (e) {
          console.log('err _grabPreviousSegment: couldn\'t parse ', nonce)
        }

        let uriBase = uri.slice(0, uri.length - nonceLength)
        let nextUri = uriBase + '_' + String(nonceInt + 1) + '.ts'
        console.log('nextUri: ', nextUri)
        if (!this._stitch.done[nextUri]) {
          this._grabAnsStoreSegment(nextUri)
        }
      }
    }
  }

  /**
   * generate video screenshots / thumbnails
   * @param  {String}   inputPath    path to video m3u8 master playlist
   * @param  {String}   outputFolder path to where you wanna store the thumbnails
   * @param  {Function} callback     (err, generatedFiles)
   * @return {Array}                an array of filenames for the generated screenshots.
   */
  generateScreenshots (inputPath, outputFolder, callback) {
    let outputedFileNames = null
    ffmpeg(inputPath)
      .on('filenames', (filenames) => {
        console.log('Will generate ' + filenames)
        outputedFileNames = filenames
      })
      .on('end', (data) => {
        console.log('screenshots generated!', data)
        setImmediate(() => {
          callback(null, outputedFileNames)
        })
      })
      .on('error', (err) => {
        if (err) {
          console.log('generateScreenshots ERROR : ', err)
          callback(err)
        }
      })
      .screenshots({
        count: 4,
        timestamps: ['10%', '25%', '75%', '85%'],
        folder: outputFolder,
        filename: 'thumbnail-%r.png'
      })
  }

  /**
   * generate the master manifest for the transcoded video.
   * @param  {Function} cb (err, manifest)
   * @return {String}      generated Manifest string.
   */
  generateManifest (cb) {
    let master = '#EXTM3U\n'
    master += '#EXT-X-VERSION:6\n'
    console.log('codecData: ', this.codecData)
    let resolutionLine = (size) => {
      return `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=${tutils.getBandwidth(tutils.getHeight(size))},CODECS="avc1.4d001f,mp4a.40.2",RESOLUTION=${tutils.calculateWidth(this.codecData, tutils.getHeight(size))},NAME=${tutils.getHeight(size)}\n`
    }
    let result = master
    console.log('availableSizes: ', this.resolution.availableSizes)
    forEach(this.resolution.availableSizes, (size) => {
      // log(`format: ${JSON.stringify(formats[size])} , size: ${size}`)
      result += resolutionLine(size)
      result += String(size.split('x')[1]) + '.m3u8\n'
    })

    cb(null, result)
  }

  /**
   * probe video to get the metadata. useful to get all sort of info like original
   * resolution and aspect-ratio and codecs
   * @param  {Function} cb (err, videoMeta)
   * @return {Object}      Object with the most important info + possible downsamples
   */
  getVideoMetadata (cb) {
    let fileStream

    try {
      console.log('getting metadata for ', this.hash)
      fileStream = this.pipfs.ipfs.files.catReadableStream(this.hash)
    } catch (e) {
      if (e) return cb(this._handleError(e))
    }

    fileStream.unpipe = function () { }
    ffmpeg(fileStream)
      .ffprobe(0, (err, metadata) => {
        if (err) return cb(this._handleError(err))
        // Ref: metadata object example https://github.com/fluent-ffmpeg/node-fluent-ffmpeg#reading-video-metadata
        console.log(metadata)
        this.duration = metadata.format.duration
        for (var stream of metadata.streams) {
          if (stream.codec_type === 'video') {
            this.resolution = {
              width: stream.width,
              height: stream.height,
              display_aspect_ratio: stream.display_aspect_ratio,
              availableSizes: tutils.getPossibleBitrates(stream.height),
              bitrate: stream.bit_rate
            }

            this.meta.video = stream

            return cb(null, {
              width: stream.width,
              height: stream.height,
              display_aspect_ratio: stream.display_aspect_ratio,
              availableSizes: tutils.getPossibleBitrates(stream.height),
              bitrate: stream.bit_rate
            })
          }
        }
      })
  }

  _handleError (e) {
    // TODO: handle errors properly like a gentleman.
    console.error('_handleError: ', e)
    return e
  }

  /**
   * the main function where ffmpeg is triggered. it creates a main command then
   * clones it into various down bitrates.
   * @param  {Function} cb (err, result)
   * @return {Object}      returns an object with master hash, path on disk and size.
   */
  run (cb) {
    // let stream
    //
    // try {
    //   stream = this.pipfs.ipfs.files.catReadableStream(this.hash)
    // } catch (e) {
    //   if (e) return cb(this._handleError(e))
    // }

    fs.mkdir(this.rootPath, (err) => {
      if (err) return cb(this._handleError(err))



        //
        //
      let sizes = this.resolution.availableSizes
      mapLimit(sizes, sizes.length, (size, next) => {

      }, (err, results) => {
        if (err) return cb(this._handleError(err))
        this.result = this.result || {}
        this.result['root'] = this.rootPath
        this.result.duration = this.codecData.duration || this.duration
        console.log('result after mapLimit ', this.result)
        this.generateManifest((err, masterPlaylist) => {
          if (err) return cb(this._handleError(err))
          console.log('masterPlaylist: ', masterPlaylist)

          fs.writeFile(this.result.root + '/master.m3u8', masterPlaylist, (err, done) => {
            if (err) return cb(this._handleError(err))
            console.log('generating screenshots from ', this.result.root + '/master.m3u8', '\t', this.rootPath)
            // this.generateScreenshots(this.result.root + '/master.m3u8', this.rootPath, (err, screenshots) => {
            this.generateScreenshots(path.join(process.env.TMP_DIR, 'paratii-ipfs-' + this.hash), this.rootPath, (err, screenshots) => {
              if (err) return cb(this._handleError(err))
              this.result.screenshots = screenshots
              console.log('rootPath: ', this.rootPath)

              this.pipfs.addDirToIPFS(this.rootPath, (err, resp) => {
                if (err) return cb(this._handleError(err))
                console.log('Master Playlist is added to IPFS ', resp)
                this.result.master = resp

                // update the DB ---------------------
                db.addTranscodedHash(this.id, this.result.master.hash)
                db.updateHashIndex(this.hash, this.result.master.hash)
                db.updateInfo(this.id, {result: this.result, meta: this.meta})
                db.updateInfo(this.hash, {result: this.result, meta: this.meta})
                // -----------------------------------
                setTimeout(() => {
                  cb(null, this.result)
                }, 100)
              })
            })
          })
        })
        // cb(null, this.result)
      })
    })
  }

  /**
   * start RTMP stream to livepeer
   * @param  {Function} cb callback when Done
   */
  startRTMPStream (cb) {
    // ffmpeg -i ../videos/Heat.1995.mp4
    // -framerate 30 -pixel_format uyvy422
    // -vcodec libx264 -tune zerolatency
    // -b 1000k -x264-params keyint=60:min-keyint=60
    // -acodec aac -ac 1 -b:a 96k -strict -2
    // -f flv rtmp://localhost:1935/movie
    this.command = ffmpeg('/tmp/paratii-ipfs-' + this.hash, {niceness: 2})
      // .inputOptions('-strict -2')
      .videoCodec('libx264')
      .addOption('-tune', 'zerolatency')
      .addOption('-framerate', 30)
      .addOption('-b:v', '2500k')
      .addOption('-x264-params', 'keyint=60:min-keyint=60')
      // set audio bitrate
      .audioBitrate('96k')
      // set audio codec
      .audioCodec('aac')
      // set number of audio channels
      .audioChannels(2)
      .addOption('-f', 'flv')
      .output(`${LP_RTMP_SERVER}/${this.id}`)
      .on('stderr', (out) => {
        // console.log('stderr: ', out)
      })
      .on('codecData', (data) => {
        console.log('data: ', data)
        this.codecData = data
        console.log('Input is ' + data.audio + ' audio ' +
          'with ' + data.video + ' video')
      })
      .on('end', () => {
        console.log(this.hash, '\t DONE')
        this.emit('downsample:ready', this.hash)
        cb(null)
      })
      .on('error', (err) => {
        console.log('error: ', this.id, '\t', err)
        this.emit('error', err, this.hash)
        return cb(err)
      })
      .on('progress', (progress) => {
        let percent = tutils.getProgressPercent(progress.timemark, this.codecData.duration).toFixed(2)
        // console.log(this.id, ':', size, '\t', percent)
        let obj = {}
        obj['original'] = percent
        db.updateProgress(this.hash, obj)
        this.emit('progress', this.hash, 'original', percent)
      })
      .run()
  }

  startPlaylistPolling (manifestID) {
    this.playlistPool = setInterval(() => {
      this._getHLSPlaylist(manifestID, (err, playlist) => {
        if (err) return this.emit('error', err, this.hash)

        if (playlist && playlist.isMasterPlaylist) {
          this._stitch.masterPlaylist = {
            lastUpdate: new Date(),
            hls: playlist
          }
          let uriList = playlist.variants.map((variant, i) => {
            if (variant.uri.endsWith('.m3u8')) {
              return variant.uri.slice(0, variant.uri.length - 5)
            }
          })

          uriList.forEach((uri) => {
            this._getHLSPlaylist(uri, (err, playlist) => {
              if (err || !playlist) {
                // if it fails. try and try again.
                this.grabMaster()
                return
              }
              console.log('uri: ', uri, '; playlist: ', playlist)
              this._stitch.playlists[uri] = playlist
              playlist.segments.forEach((segment, i) => {
                if (segment.uri.match(/_\d+\.ts/)) {
                  // TODO. grab the segment here. and all the other ones aswell.
                  this._grabAnsStoreSegment(segment.uri, (err, seg) => {
                    if (err) throw err
                    console.log('got seg, length: ', seg.length)
                  })
                }
              })
            })
          })
        } else if (playlist) {
          segments = playlist.variants.map((variant, i) => {
            if (variant.uri.match(/_\d+\.ts/)) {
              // TODO. grab the segment here. and all the other ones aswell.
            }

          })
        }
      })
    }, 500)
  }

  stopPlaylistPolling () {
    console.log('stopPlaylistPolling.....................')
    clearInterval(this.playlistPool)
  }

  /**
   * create and store final file object after the RTMP livepeer is done.
   * @param  {Function} cb err callback
   */
  _onStreamDone (cb) {
    this.result = this.result || {}
    this.result['root'] = this.rootPath
    this.result.duration = this.codecData.duration || this.duration
    console.log('result after mapLimit ', this.result)

    console.log('generating screenshots from ', this.result.root + '/master.m3u8', '\t', this.rootPath)
    // this.generateScreenshots(this.result.root + '/master.m3u8', this.rootPath, (err, screenshots) => {
    this.generateScreenshots(path.join(process.env.TMP_DIR, 'paratii-ipfs-' + this.hash), this.rootPath, (err, screenshots) => {
      if (err) return cb(this._handleError(err))
      this.result.screenshots = screenshots
      console.log('rootPath: ', this.rootPath)

      this.pipfs.addDirToIPFS(this.rootPath, (err, resp) => {
        if (err) return cb(this._handleError(err))
        console.log('Master Playlist is added to IPFS ', resp)
        this.result.master = resp

        // update the DB ---------------------
        db.addTranscodedHash(this.id, this.result.master.hash)
        db.updateHashIndex(this.hash, this.result.master.hash)
        db.updateInfo(this.id, {result: this.result, meta: this.meta})
        db.updateInfo(this.hash, {result: this.result, meta: this.meta})
        // -----------------------------------
        setTimeout(() => {
          cb(null, this.result)
        }, 100)
      })
    })
  }

  grabMaster () {
    if (this.retries < this._maxRetries) {
      this.retries++
      this._getManifestID((err, id) => {
        if (err) return this.emit('error', err, this.hash)
        this._livepeerManifestId = id
        console.log('manifestID: ', id)
        this.emit('manifestID', this.hash, this._livepeerManifestId)
        this.stopPlaylistPolling()
        setImmediate(() => {
          this.startPlaylistPolling(id)
        })
      })
    }
  }

  /**
   * the main entry point to start this Job.
   * @param  {Function} cb (err, result)
   * @return {Object}      returns whatever it gets from run()
   */
  start (cb) {
    fs.mkdir(this.rootPath, (err) => {
      this.getVideoMetadata((err, meta) => {
        if (err) return this.emit('error', err, this.hash)
        this.pipfs.grabFile(this.hash, (err) => {
          if (err) return this.emit('error', err, this.hash)
          // this.run(cb)

          // get manifestID
          setTimeout(() => {
            this.grabMaster()
          }, 4000)

          // this.on('manifestID', (hash, manifestID) => {
          //   this._getHLSPlaylist(manifestID, (err, playlist) => {
          //     if (err) this.emit('error', err, this.hash)
          //     // TODO store all these segments.
          //     console.log('_getHLSPlaylist: ', playlist)
          //     // _getHLSPlaylist:  MasterPlaylist {
          //     //   type: 'playlist',
          //     //   isMasterPlaylist: true,
          //     //   uri: undefined,
          //     //   version: 3,
          //     //   independentSegments: false,
          //     //   start: undefined,
          //     //   source: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:PROGRAM-ID=0,BANDWIDTH=4000000,RESOLUTION=1280x720\n1220090e24
          //     // e20b5d82a23703f5f6c019cbc6a8abe021cf6ebd3157272f8b23a95f12a1ce6dbc120a01a9eefe1bb5a75a6760861c9b58f8b06ccdd63fcf2a51d8
          //     // 57acP720p30fps16x9.m3u8\n',
          //     //   variants:
          //     //    [ Variant {
          //     //        uri: '1220090e24e20b5d82a23703f5f6c019cbc6a8abe021cf6ebd3157272f8b23a95f12a1ce6dbc120a01a9eefe1bb5a75a6760861c9
          //     // b58f8b06ccdd63fcf2a51d857acP720p30fps16x9.m3u8',
          //     //        isIFrameOnly: false,
          //     //        bandwidth: 4000000,
          //     //        averageBandwidth: undefined,
          //     //        codecs: undefined,
          //     //        resolution: [Object],
          //     //        frameRate: undefined,
          //     //        hdcpLevel: undefined,
          //     //        audio: [],
          //     //        video: [],
          //     //        subtitles: [],
          //     //        closedCaptions: [],
          //     //        currentRenditions: [Object] } ],
          //     //   currentVariant: undefined,
          //     //   sessionDataList: [],
          //     //   sessionKeyList: [] }
          //     if (playlist && playlist.isMasterPlaylist) {
          //       if (playlist.variants) {
          //         let uriList = playlist.variants.map((variant, i) => {
          //           if (variant.uri.endsWith('.m3u8')) {
          //             return variant.uri.slice(0, variant.uri.length - 5)
          //           }
          //         })
          //
          //         uriList.forEach((uri) => {
          //           this._getHLSPlaylist(uri, (err, playlist) => {
          //             if (err) throw err
          //             console.log('uri: ', uri, '; playlist: ', playlist)
          //           })
          //         })
          //       }
          //     } else if (playlist) {
          //       segments = playlist.variants.map((variant, i) => {
          //         if (variant.uri.match(/_\d+\.ts/)) {
          //           // TODO. grab the segment here. and all the other ones aswell.
          //         }
          //
          //       })
          //     }
          //   })
          // })

          this.startRTMPStream((err) => {
            if (err) return this.emit('error', err, this.hash)
            setTimeout(() => {
              this.stopPlaylistPolling()

              // finalize the hls folder
              // 1. add screenshots.
              // 2. make sure hls masterplaylist is correct and has all the segments.
              // 3. add to IPFS.
              // all good.
              this._onStreamDone((err, result) => {
                if (err) return this.emit('error', this.hash, err)
                cb(null, result)
              })
            }, 5000)
            // stream done.
          })
        })
      })
    })
  }
}

module.exports = Job
