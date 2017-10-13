
/**
 * PARATII TRANSCODER - WORK IN PROGRESS - gitter @Ya7ya for help
 */

'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
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

var ipfs = ipfsAPI(config.IPFS_API)
ffmpeg.setFfprobePath(config.FFPROBE_PATH)

// let testHash = '/ipfs/QmR6QvFUBhHQ288VmpHQboqzLmDrrC2fcTUyT4hSMCwFyj'
// let testHash = '/ipfs/QmaLDCUrJqjHgnv8trt8KcSuFavQaorZpMtSDogE6np8st'
let testHash = '/ipfs/QmeG4popSYeipnvuvP6u4UxuRfKWTzy6eEMyC54ArFRNiG'

// let testHash = '/ipfs/QmZgNs5jJJtv1yD83aCoQvRUYscfneSZeYQyLpjKrfyRFK'

function getResolutionPath (filePath, cb) {
  ffmpeg.ffprobe(path.resolve(__dirname, filePath), (err, metadata) => {
    if (err) return cb(err)

    // console.log(metadata)

    for (var stream of metadata.streams) {
      if (stream.codec_type === 'video') {
        return cb(null, {
          width: stream.width,
          height: stream.height,
          display_aspect_ratio: stream.display_aspect_ratio
        })
      }
    }
  })
}
//
// getResolution('../../videos/The Night Manager S01E03.mp4', (err, meta) => {
//   if (err) throw err
//
//   console.log(meta)
// })

function getResolution (ipfsHash, cb) {
  ipfs.files.get(ipfsHash, (err, filesStream) => {
    if (err) return cb(err)

    filesStream.on('data', (file) => {
      console.log('got file Obj ', file.path, ' size: ', file.size)
      if (file.content) {
        ffmpeg(file.content)
          .ffprobe(0, (err, metadata) => {
            if (err) return cb(err)

            // console.log(metadata)
            for (var stream of metadata.streams) {
              if (stream.codec_type === 'video') {
                return cb(null, {
                  width: stream.width,
                  height: stream.height,
                  display_aspect_ratio: stream.display_aspect_ratio
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

// getResolution(testHash, (err, meta) => {
//   if (err) throw err
//
//   console.log('meta: ', meta)
// })
// var fileStream = fs.createWriteStream('outputfile.mp4')

function convertToHLS (filePath, cb) {
  console.log('loading converter')
  ffmpeg(filePath)
    .inputOptions('-strict -2')
    // .inputOptions('preset', 'superfast')
    .addOption('-profile:v', 'baseline')
    .addOption('-level', 3.0)
    .addOption('-start_number', 0)
    .videoCodec('libx264')
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
    .on('end', () => {
      console.log('finished processing file.')
      return cb()
    })
    .on('error', (err) => {
      console.log('an error happened: ', err)
      return cb(err)
    })
    .save('/tmp/master.m3u8')
    // .outputOptions('-strict -2 -profile:v baseline -level 3.0 -start_number 0 -hls_time 5 -hls_list_size 0 -f hls')
}

// convertToHLS('./frag_bunny.mp4', () => {
//   console.log('done')
// })

function getFileStream (ipfsHash, cb) {
  ipfs.files.get(ipfsHash, (err, filesStream) => {
    if (err) return cb(err)

    filesStream.on('data', (file) => {
      console.log('got file Obj ', file.path, ' size: ', file.size)
      if (file.content) {
        return cb(null, file.content)
      }
    })

    filesStream.on('error', (err) => {
      console.error('filesStream Err ', err)
      return cb(err)
    })

    filesStream.on('end', () => {
      console.log('filesStream ended!')
    })
  })
}

// getFileStream(testHash, (err, stream) => {
//   if (err) throw err
//
//   console.log('typeof stream: ', typeof stream)
//   ffmpeg(stream)
//     .ffprobe(0, (err, metadata) => {
//       if (err) throw err
//
//       // console.log(metadata)
//       for (var stream of metadata.streams) {
//         if (stream.codec_type === 'video') {
//           console.log({
//             width: stream.width,
//             height: stream.height,
//             display_aspect_ratio: stream.display_aspect_ratio
//           })
//         }
//       }
//     })
//
//   convertToHLS(stream, () => {
//     console.log('done')
//   })
// })

function addDirToIPFS (dirPath, cb) {
  let resp = null
  ipfs.files.createAddStream((err, addStream) => {
    if (err) return cb(err)
    addStream.on('data', (file) => {
      console.log('file Added ', file)
      if ('/' + file.path === dirPath) {
        // console.log('this is the hash to return ')
        resp = file
      }
    })

    addStream.on('end', () => {
      console.log('addStream ended')
      cb(null, resp)
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
      }, (err) => {
        if (err) return cb(err)
        addStream.end()
      })
    })
  })
}

function convertAndAdd (ipfsHash, size, cb) {
  let hashes = []
  getFileStream(ipfsHash, (err, stream) => {
    if (err) return cb(err)

    fs.mkdtemp(path.join(os.tmpdir(), 'paratii-'), (err, folder) => {
      if (err) return cb(err)
      let command = ffmpeg(stream)
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
        .on('stderr', (err) => {
          if (err) console.error('stderr: ', err)
        })
        .on('end', () => {
          console.log('finished processing file.')
          addDirToIPFS(folder, cb)
          // return cb()
        })
        .on('error', (err) => {
          console.log('an error happened: ', err)
          return cb(err)
        })
        .output(folder + '/master.m3u8')
        .run()
    })
  })
}

// convertAndAdd(testHash, (err, resp) => {
//   if (err) {
//     console.log('error : ', err)
//   }
//   console.log('done ', resp)
// })

getResolution(testHash, (err, meta) => {
  if (err) throw err
  console.log('available conversions ', conversions[String(meta.height)])
  const availableSizes = conversions[String(meta.height)]

  convertAndAdd(testHash, availableSizes[0], (err, resp) => {
    if (err) {
      console.log('error : ', err)
    }
    console.log('done ', resp)
  })
})
