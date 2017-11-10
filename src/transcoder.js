'use strict'

const { EventEmitter } = require('events')
const path = require('path')
const fs = require('fs')
const os = require('os')
const tar = require('tar-stream')
const pull = require('pull-stream')
const toStream = require('pull-stream-to-stream')
const log = require('debug')('paratii:transcoder')
const { mapLimit, eachSeries, nextTick } = require('async')
const ipfsAPI = require('ipfs-api')
const ffmpeg = require('fluent-ffmpeg')
const { forEach } = require('lodash')
const once = require('once')

const config = {
  FFMPEG_PATH: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH || '/usr/bin/ffprobe',
  IPFS_API: '/ip4/127.0.0.1/tcp/5002'
}

const conversions = {
  '2160': ['?x2160', '?x1440', '?x1080', '?x720', '?x480', '?x360', '?x240', '?x144'],
  '1440': ['?x1440', '?x1080', '?x720', '?x480', '?x360', '?x240', '?x144'],
  '1080': ['?x1080', '?x720', '?x480', '?x360', '?x240', '?x144'],
  '720': ['?x720', '?x480', '?x360', '?x240', '?x144'],
  '480': ['?x480', '?x360', '?x240', '?x144'],
  '360': ['?x360', '?x240', '?x144'],
  '240': ['?x240', '?x144'],
  '144': ['?x144']
}

// { '?x360':
  //  { path: 'tmp/paratii-9SVMCY',
  //    hash: 'QmXUPZZhDLnrPaTR7eLPVFMDgHZBNhEAX6yzULe6F4cBdV',
  //    size: 6410521 },
  // '?x240':
  //  { path: 'tmp/paratii-q86Byh',
  //    hash: 'QmSEohbTwgifvjgWwQQbufANXpQHDVEdQjaTUovYsWbUSA',
  //    size: 4584168 },
  // '?x144':
  //  { path: 'tmp/paratii-vli2p4',
  //    hash: 'Qmf8qPTrp6ZzBFCdyWp2odLcCppptce6HDkDKpfXLwUCTK',
  //    size: 2537626 } }

const MAX_BIT_RATE = {
  '1080': '350000',
  '720': '170000',
  '480': '156000',
  '360': '128000',
  '240': '100000',
  '144': '64000'
}

// var ipfs = ipfsAPI(config.IPFS_API)
ffmpeg.setFfprobePath(config.FFPROBE_PATH)

class Transcoder extends EventEmitter {
  constructor (opts) {
    super()
    if (!opts.sourcePath) {
      throw new Error('[transcoder] sourcePath is required')
    }

    if (!opts.ipfs) {
      // throw new Error('[transcoder] IPFS is required')
      this.ipfs = ipfsAPI(config.IPFS_API)
    } else {
      this.ipfs = opts.ipfs
    }

    this.sourcePath = opts.sourcePath
    this.result = {}
  }

  getHeight (size) {
    let res = this.codecData.video_details[3].split('x')
    let height = parseInt(res[0])
    let width = parseInt(res[1])

    let s = parseInt(size.split('x')[1])

    return String(Math.floor((height * s) / width) + 'x' + s)
  }

  getBitrate (size) {
    // https://support.google.com/youtube/answer/1722171?hl=en-GB
    // https://developer.apple.com/library/content/technotes/tn2224/_index.html#//apple_ref/doc/uid/DTS40009745-CH1-VARIANTPLAYLISTS
    let originBitrate = this.resolution.bitrate
    let height = this.resolution.height

    let s = parseInt(size.split('x')[1])
    // if (height === s || s >= 720) {
    //   return String(originBitrate)
    // } else {
    // }
    return MAX_BIT_RATE[String(s)]
  }

  getResolution (cb) {
    // this.getFileStream(this.sourcePath, (err, filesStream) => {
    this.ipfs.files.get(this.sourcePath, (err, filesStream) => {
      if (err) return cb(err)
      // console.log('fileStream: ', filesStream)
      // filesStream.on('data', (file) => {
      //   console.log('chunk :', file)
      // })

      filesStream.on('data', (file) => {
        // console.log('got file Obj ', file.path, ' size: ', file.size)
        // file.content.resume()
        console.log('got file Obj ', file.path, ' size: ', file.size, ' file: ', file)
        if (file.content) {
          file.content.unpipe = function () { }

          ffmpeg(file.content.resume())
            .ffprobe(0, (err, metadata) => {
              if (err) throw err
              // Ref: metadata object example https://github.com/fluent-ffmpeg/node-fluent-ffmpeg#reading-video-metadata
              console.log(metadata)
              for (var stream of metadata.streams) {
                if (stream.codec_type === 'video') {
                  this.resolution = {
                    width: stream.width,
                    height: stream.height,
                    display_aspect_ratio: stream.display_aspect_ratio,
                    availableSizes: conversions[String(stream.height)],
                    bitrate: stream.bit_rate
                  }

                  return cb(null, {
                    width: stream.width,
                    height: stream.height,
                    display_aspect_ratio: stream.display_aspect_ratio,
                    availableSizes: conversions[String(stream.height)],
                    bitrate: stream.bit_rate
                  })
                }
              }
            })
        }
      })

      filesStream.on('error', (err) => {
        console.error('filesStream Err ', err)
      })

      filesStream.on('end', () => {
        console.log('filesStream ended!')
      })
    })
  }

  convertTo (sizes, cb) {
    this.convertAndAdd(this.sourcePath, sizes, (err, convertedHash) => {
      if (err) return cb(err)
      console.log(`Converted ${sizes.join(',')} : ${JSON.stringify(this.result)}`)
      // this.result[size] = convertedHash
      // cb(null, convertedHash)
      cb(null, this.result)
    })

    // eachSeries(sizes, (size, next) => {
    //   this.convertAndAdd(this.sourcePath, size, (err, convertedHash) => {
    //     if (err) return next(err)
    //     console.log(`Converted ${size} : ${JSON.stringify(convertedHash)}`)
    //     this.result[size] = convertedHash
    //     next()
    //   })
    // }, (err) => {
    //   if (err) throw err
    //   cb(null, this.result)
    // })
  }

  createMasterPlaylist (formats, cb) {
    let master = '#EXTM3U\n'
    master += '#EXT-X-VERSION:6\n'

    let resolutionLine = (size) => {
      return `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=${this.getBitrate(size)},CODECS="avc1.4d001f,mp4a.40.2",RESOLUTION=${this.getHeight(size)}\n`
    }
    let result = master
    log('availableSizes: ', formats.resolution.availableSizes)
    forEach(formats.resolution.availableSizes, (size) => {
      // log(`format: ${JSON.stringify(formats[size])} , size: ${size}`)
      result += resolutionLine(size)
      result += String(size.split('x')[1]) + '.m3u8\n'
      // if (formats[size]) {
      // } else {
      //   log(`CANNOT find format ${size}, ${JSON.stringify(formats)}`)
      // }
    })

    cb(null, result)
  }

  start (cb) {
    console.log(`Starting Transcoder : ${this.sourcePath}`)
    this.getResolution((err, res) => {
      if (err) throw err
      this.resolution = res
      this.result = this.result || {}
      this.result.resolution = res
      console.log(`Original Resolution: ${res.height}p , availableSizes: ${res.availableSizes.join(',')}`)
      this.convertTo(res.availableSizes, (err, result) => {
        if (err) throw err
        console.log(`Transcoder Finished ${this.sourcePath}`)
        this.result.originPath = this.sourcePath
        this.result.resolution = this.resolution
        console.log('Result: ', result)
        cb(null, this.result)
        // this.createMasterPlaylist(result, (err, masterPlaylist) => {
        //   if (err) throw err
        //
        // })
      })
    })
  }

  generateScreenshots (inputPath, outputFolder, callback) {
    let outputedFileNames = null
    ffmpeg(inputPath)
      .on('filenames', (filenames) => {
        console.log('Will generate ' + filenames)
        outputedFileNames = filenames
      })
      .on('end', () => {
        callback(null, outputedFileNames)
      })
      .screenshots({
        count: 4,
        folder: outputFolder,
        filename: 'thumbnail-%r.png'
      })
  }

  getFileStream (ipfsHash, callback) {
    this.ipfs.files.getPull(ipfsHash, (err, stream) => {
      if (err) return callback(err)
      const pack = tar.pack()

      pull(
        stream,
        pull.asyncMap((file, cb) => {
          const header = { name: file.path }
          if (!file.content) {
            header.type = 'directory'
            pack.entry(header)
            cb()
          } else {
            header.size = file.size
            const packStream = pack.entry(header, cb)
            if (!packStream) {
              // this happens if the request is aborted
              // we just skip things then
              log('other side hung up')
              return cb()
            }
            toStream.source(file.content).pipe(packStream)
          }
        }),
        pull.onEnd((err) => {
          if (err) {
            log.error(err)
            pack.emit('error', err)
            pack.destroy()
            return
          }
          pack.finalize()
          console.log('pull ended')
        })
      )

      callback(null, pack)
    })

    // this.ipfs.files.get(ipfsHash, (err, filesStream) => {
    //   if (err) return cb(err)
    //
    //   filesStream.on('data', (file) => {
    //     console.log('got file Obj ', file.path, ' size: ', Object.keys(file))
    //     if (file.content) {
    //       return cb(null, file.content)
    //     }
    //   })
    //
    //   filesStream.on('error', (err) => {
    //     console.error('filesStream Err ', err)
    //     return cb(err)
    //   })
    //
    //   filesStream.on('end', () => {
    //     console.log('filesStream ended!')
    //   })
    // })
  }

  addDirToIPFS (dirPath, cb) {
    cb = once(cb)
    let resp = null
    this.ipfs.files.createAddStream((err, addStream) => {
      if (err) return cb(err)
      addStream.on('data', (file) => {
        console.log('dirPath ', dirPath)
        console.log('file Added ', file)
        if ('/' + file.path === dirPath) {
          console.log('this is the hash to return ')
          resp = file
          nextTick(() => cb(null, resp))
        }
      })

      addStream.on('end', () => {
        console.log('addStream ended')
        // nextTick(() => cb(null, resp))
      })

      fs.readdir(dirPath, (err, files) => {
        if (err) return cb(err)
        eachSeries(files, (file, next) => {
          next = once(next)
          try {
            console.log('reading file ', file)
            let rStream = fs.createReadStream(path.join(dirPath, file))
            rStream.on('error', (err) => {
              if (err) {
                log('rStream Error ', err)
                return next()
              }
            })
            if (rStream) {
              addStream.write({
                path: path.join(dirPath, file),
                content: rStream
              })
            }
          } catch (e) {
            if (e) {
              console.log('gotcha ', e)
            }
          } finally {
          }
          // next()
          nextTick(() => next())
        }, (err) => {
          if (err) return cb(err)
          // addStream.destroy()
          addStream.end()
        })
      })
    })
  }

  convertAndAdd (ipfsHash, sizes, cb) {
    // TODO use ffmpeg command cloning https://github.com/fluent-ffmpeg/node-fluent-ffmpeg#cloning-an-ffmpegcommand
    // this.getFileStream(ipfsHash, (err, stream) => {
    this.ipfs.files.get(ipfsHash, (err, filesStream) => {
      if (err) return cb(err)
      filesStream.on('data', (stream) => {
        if (stream && stream.content) {
          fs.mkdtemp(path.join(os.tmpdir(), 'paratii-'), (err, folder) => {
            if (err) return cb(err)
            let command = ffmpeg(stream.content)
              // .inputOptions('-strict -2')
              .addOption('-preset', 'fast')
              .addOption('-framerate', 30)
              .addOption('-tune', 'zerolatency')
              .addOption('-profile:v', 'baseline')
              .addOption('-level', 3.0)
              .addOption('-start_number', 0)
              .videoCodec('libx264')
              // set audio bitrate
              .audioBitrate('64k')
              // set audio codec
              .audioCodec('aac')
              // set number of audio channels
              .audioChannels(2)
              // set hls segments time
              .addOption('-hls_time', 5)
              // include all the segments in the list
              .addOption('-hls_list_size', 0)
              .addOption('-f', 'hls')
              .on('codecData', (data) => {
                log('data: ', data)
                this.codecData = data
                console.log('Input is ' + data.audio + ' audio ' +
                  'with ' + data.video + ' video')
              })
              // .on('stderr', (out) => {
              //   log('stderr: ', out)
              // })
              // .on('end', () => {
              //   console.log('finished processing file.')
              //   this.addDirToIPFS(folder, cb)
              //   // return cb()
              // })
              // .on('error', (err) => {
              //   console.log('an error happened: ', err)
              //   return cb(err)
              // })
              // .on('progress', function (progress) {
              //   console.log('Processing: ', progress)
              // })
            this.path2size = {}
            let saveLog = {}
            console.log('sizes : ', sizes)
            mapLimit(sizes, sizes.length, (size, next) => {
              next = once(next)
              // fs.mkdtemp(path.join(folder, 'p-'), (err, secondFolder) => {
              //   if (err) throw err
              //
              //   this.path2size[secondFolder] = size
              // })
              log(`launching ${size} converter, storing as ${folder}/${size.split('x')[1]}`)
              command.clone()
              .size(size)
              .on('codecData', (data) => {
                log('data: ', data)
                this.codecData = data
                console.log('Input is ' + data.audio + ' audio ' +
                'with ' + data.video + ' video')
              })
              .on('end', () => {
                // console.log('finished processing file.', this.path2size, ' ', secondFolder)
                // if (saveLog[secondFolder]) {
                //   log('saveToIPFS already called ', secondFolder)
                // } else {
                //   saveLog[secondFolder] = true
                //   this.addDirToIPFS(secondFolder, next)
                // }
                next(null)
                // return cb()
              })
              .on('error', (err) => {
                console.log('an error happened: ', err)
                return next(err)
              })
              .on('progress', (progress) => {
                log('Processing: ', progress.timemark)
              })
              .save(folder + '/' + String(size.split('x')[1]) + '.m3u8')
              .run()
            }, (err, results) => {
              if (err) throw err
              this.result['root'] = folder
              log('result after mapLimit ', this.result)
              this.createMasterPlaylist(this.result, (err, masterPlaylist) => {
                if (err) throw err
                console.log('masterPlaylist: ', masterPlaylist)
                fs.writeFile(this.result.root + '/master.m3u8', masterPlaylist, (err, done) => {
                  if (err) throw err
                  this.generateScreenshots(this.result.root + '/master.m3u8', folder, (err, screenshots) => {
                    if (err) throw err
                    this.result.screenshots = screenshots
                    this.addDirToIPFS(this.result.root, (err, resp) => {
                      if (err) throw err
                      log('Master Playlist is added to IPFS ', resp)
                      this.result.master = resp
                      cb(null, this.result)
                    })

                  })
                })
              })
              // cb(null, this.result)
            })

          })
        }
      })
    })
  }
}

module.exports = Transcoder
