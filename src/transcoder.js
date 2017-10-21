'use strict'

const { EventEmitter } = require('events')
const path = require('path')
const fs = require('fs')
const os = require('os')
const tar = require('tar-stream')
const pull = require('pull-stream')
const toStream = require('pull-stream-to-stream')
const log = require('debug')('paratii:transcoder')
const { eachSeries, nextTick } = require('async')
const ipfsAPI = require('ipfs-api')
const ffmpeg = require('fluent-ffmpeg')

const config = {
  FFMPEG_PATH: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH || '/usr/bin/ffprobe',
  IPFS_API: '/ip4/127.0.0.1/tcp/5002'
}

const conversions = {
  '1080': ['?x1080', '?x720', '?x480', '?x360', '?x240', '?x144'],
  '720': ['?x720', '?x480', '?x360', '?x240', '?x144'],
  '480': ['?x480', '?x360', '?x240', '?x144'],
  '360': ['?x360', '?x240', '?x144'],
  '240': ['?x240', '?x144'],
  '144': ['?x144']
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

              // console.log(metadata)
              for (var stream of metadata.streams) {
                if (stream.codec_type === 'video') {
                  this.resolution = {
                    width: stream.width,
                    height: stream.height,
                    display_aspect_ratio: stream.display_aspect_ratio,
                    availableSizes: conversions[String(stream.height)]
                  }

                  return cb(null, {
                    width: stream.width,
                    height: stream.height,
                    display_aspect_ratio: stream.display_aspect_ratio,
                    availableSizes: conversions[String(stream.height)]
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
    eachSeries(sizes, (size, next) => {
      this.convertAndAdd(this.sourcePath, size, (err, convertedHash) => {
        if (err) return next(err)
        console.log(`Converted ${size} : ${convertedHash}`)
        this.result[size] = convertedHash
        next()
      })
    }, (err) => {
      if (err) throw err
      cb(null, this.result)
    })
  }

  start (cb) {
    console.log(`Starting Transcoder : ${this.sourcePath}`)
    this.getResolution((err, res) => {
      if (err) throw err
      this.resolution = res
      console.log(`Original Resolution: ${res.height}p , availableSizes: ${res.availableSizes.join(',')}`)
      this.convertTo(res.availableSizes, (err, result) => {
        if (err) throw err
        console.log(`Transcoder Finished ${this.sourcePath}`)
        console.log(result)
        cb(null, result)
      })
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
    let resp = null
    this.ipfs.files.createAddStream((err, addStream) => {
      if (err) return cb(err)
      addStream.on('data', (file) => {
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
          let rStream = fs.createReadStream(path.join(dirPath, file))
          console.log('reading file ', file)
          try {
            addStream.write({
              path: path.join(dirPath, file),
              content: rStream
            })
          } catch (e) {
            if (e) {
              console.log('gotcha ', e)
            }
          } finally {

          }
          nextTick(() => next())
          // next()
        }, (err) => {
          if (err) return cb(err)
          // addStream.destroy()
          addStream.end()
        })
      })
    })
  }

  convertAndAdd (ipfsHash, size, cb) {
    // this.getFileStream(ipfsHash, (err, stream) => {
    this.ipfs.files.get(ipfsHash, (err, filesStream) => {
      if (err) return cb(err)
      filesStream.on('data', (stream) => {
        if (stream && stream.content) {
          fs.mkdtemp(path.join(os.tmpdir(), 'paratii-'), (err, folder) => {
            if (err) return cb(err)
            let command = ffmpeg(stream.content)
              .inputOptions('-strict -2')
              .addOption('-profile:v', 'baseline')
              .addOption('-level', 3.0)
              .addOption('-start_number', 0)
              .videoCodec('libx264')
              .size(size)
              // set audio bitrate
              .audioBitrate('128k')
              // set audio codec
              .audioCodec('aac')
              // set number of audio channels
              .audioChannels(2)
              // set hls segments time
              .addOption('-hls_time', 5)
              // include all the segments in the list
              .addOption('-hls_list_size', 0)
              .addOption('-f', 'hls')
              // .inputOptions('-strict -2 -profile:v baseline -level 3.0 -start_number 0 -hls_time 5 -hls_list_size 0 -f hls')
              // .output(fileStream)
              // .on('progress', (progress) => {
              //   // percentage is not available when using an input stream
              //   console.log('Processing: ', progress.percentage, ' % done')
              // })
              .on('stderr', (out) => {
                log('stderr: ', out)
              })
              .on('end', () => {
                console.log('finished processing file.')
                this.addDirToIPFS(folder, cb)
                // return cb()
              })
              .on('error', (err) => {
                console.log('an error happened: ', err)
                return cb(err)
              })
              .on('progress', function (progress) {
                console.log('Processing: ', progress)
              })
              .output(folder + '/master.m3u8')
              .run()
          })
        }
      })
    })
  }
}

module.exports = Transcoder
