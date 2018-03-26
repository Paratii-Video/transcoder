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

const tutils = require('./utils')
const db = require('../db')

const config = {
  FFMPEG_PATH: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH || '/usr/bin/ffprobe',
  IPFS_API: '/ip4/127.0.0.1/tcp/5002'
}

// var ipfs = ipfsAPI(config.IPFS_API)
ffmpeg.setFfprobePath(config.FFPROBE_PATH)

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
    this.rootPath = path.join(os.tmpdir(), 'paratii-' + this.id)
    this.peerId = opts.peerId
    this.hash = opts.hash
    this.pipfs = opts.pipfs
    this.size = opts.size
    this.meta = {}
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

  _getManifestID (cb) {
    request({
      uri: 'http://localhost:8935/manifestID',
      method: 'GET'
    }, (err, res, body) => {
      if (err) {
        return cb(err)
      }

      cb(null, body)
    })
  }

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
          return cb(null, playlist)
        } catch (e) {
          return cb(e)
        }
      } else {
        cb(new Error('wrong statusCode'))
      }
    })
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

      // ffmpeg -i ../videos/Heat.1995.mp4
      // -framerate 30 -pixel_format uyvy422
      // -vcodec libx264 -tune zerolatency
      // -b 1000k -x264-params keyint=60:min-keyint=60
      // -acodec aac -ac 1 -b:a 96k -strict -2
      // -f flv rtmp://localhost:1935/movie

      this.command = ffmpeg('/tmp/paratii-ipfs-' + this.hash, {niceness: 2})
        // .inputOptions('-strict -2')
        .addOption('-framerate', 30)
        .addOption('-pixel_format', 'uyvy422')
        .addOption('-tune', 'zerolatency')
        .addOption('-b:v', '2500k')
        .addOption('-264-params', 'keyint=60:min-keyint=60')
        .videoCodec('libx264')
        // set audio bitrate
        .audioBitrate('96k')
        // set audio codec
        .audioCodec('aac')
        // set number of audio channels
        .audioChannels(2)
        .addOption('-f', 'flv')
        .on('stderr', (out) => {
          console.log('stderr: ', out)
        })
        //
        //
      let sizes = this.resolution.availableSizes
      mapLimit(sizes, sizes.length, (size, next) => {
        next = once(next)
        console.log(`launching ${size} converter, storing as ${this.rootPath}/${size.split('x')[1]}`)
        this.command.clone()
        .size(size)
        .on('codecData', (data) => {
          console.log('data: ', data)
          this.codecData = data
          console.log('Input is ' + data.audio + ' audio ' +
            'with ' + data.video + ' video')
        })
        .on('end', () => {
          console.log(this.id, ':', size, '\t DONE')
          this.emit('downsample:ready', this.hash, size)
          next(null)
        })
        .on('error', (err) => {
          console.log('error: ', this.id, ':', size, '\t', err)
          this.emit('error', err, this.hash)
          return next(err)
        })
        .on('progress', (progress) => {
          let percent = tutils.getProgressPercent(progress.timemark, this.codecData.duration).toFixed(2)
          // console.log(this.id, ':', size, '\t', percent)
          let obj = {}
          obj[String(size)] = percent
          db.updateProgress(this.hash, obj)
          this.emit('progress', this.hash, size, percent)
        })
        .save(this.rootPath + '/' + String(size.split('x')[1]) + '.m3u8')
        .run()
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
            this.generateScreenshots(path.join(os.tmpdir(), 'paratii-ipfs-' + this.hash), this.rootPath, (err, screenshots) => {
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
   * the main entry point to start this Job.
   * @param  {Function} cb (err, result)
   * @return {Object}      returns whatever it gets from run()
   */
  start (cb) {
    this.getVideoMetadata((err, meta) => {
      if (err) return this.emit('error', err, this.hash)
      this.pipfs.grabFile(this.hash, (err) => {
        if (err) return this.emit('error', err, this.hash)
        this.run(cb)
      })
    })
  }
}

module.exports = Job
