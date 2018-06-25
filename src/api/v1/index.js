'use strict'
const os = require('os')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto');
const express = require('express')
const fileUpload = require('express-fileupload')
const glob = require('glob')
const eachLimit = require('async/eachLimit')
const once = require('once')
const request = require('request')
const ffmpeg = require('fluent-ffmpeg')
const pump = require('pump')

const router = express.Router()
// const resumable = require('./resumable-node.js')('/tmp/resumable.js/')

module.exports = (node) => {
  let streams = {}
  let ipfsStream = null
  let lastChunk = {}

  router.get('/', (req, res, next) => {
    res.json({test: 1})
  })

  router.get('/stats', (req, res, next) => {
    // TODO
    res.json({Message: 'Not implemented yet', code: 0})
  })

  router.get('/job/:id', (req, res, next) => {
    res.json({Message: 'Not implemented yet', code: 0})
  })

  router.get('/transcode/:hash', (req, res, next) => {
    res.status(200).send(`<html>
      <body>
        <form ref='uploadForm'
          id='uploadForm'
          action='http://localhost:6565/api/v1/transcode/${req.params.hash}'
          method='post'
          encType="multipart/form-data">
            <input type="file" name="originVideo" />
            <input type='submit' value='Upload!' />
        </form>
      </body>
    </html>`)
  })

  router.get('/debug/:hash', (req, res, next) => {
    node.pipeline.push({
      peerId: node.ipfs.peerId,
      priority: 1,
      pipfs: node.ipfs,
      hash: req.params.hash,
      size: 1
    })

    res.status(200).send('check logs')
  })

  router.post('/transcode/:hash', (req, res, next) => {
    let hash = req.params.hash
    console.log('req.body: ', req.body)
    console.log('hash to reproduce: ', hash)
    // resumable.post(req, (status, filename, originalFilename, identifier) => {
    //   console.log('POST', status, originalFilename, identifier)
    //   res.send(status)
    // })

    // console.log('req.files: ', req.files)

    let stream = fs.createWriteStream(path.join(process.env.TMP_DIR, 'res-js-' + hash + '_' + req.body.resumableChunkNumber))

    stream.end(req.files.file.data, () => {
      if (req.body.resumableChunkNumber === req.body.resumableTotalChunks) {
        // combine file.
        glob(path.join(process.env.TMP_DIR, 'res-js-' + hash + '_*'), (err, files) => {
          if (err) throw err
          console.log('got a list of files: ', files)
          node.ipfs.upload(files, (err, hashes) => {
            if (err) throw err
            console.log('got hashes: ', hashes)
            res.send('ok')
          })
        })
      } else {
        return res.status(200).send('ok')
      }
    })
    // req.body:  { resumableChunkNumber: '29',
    //   resumableChunkSize: '1048576',
    //   resumableCurrentChunkSize: '1757886',
    //   resumableTotalSize: '31118014',
    //   resumableType: 'video/mp4',
    //   resumableIdentifier: '31118014-Around_The_Block_Teaser_1mp4',
    //   resumableFilename: 'Around_The_Block_Teaser_1.mp4',
    //   resumableRelativePath: 'Around_The_Block_Teaser_1.mp4',
    //   resumableTotalChunks: '29' }
    // req.files:  { file:
    //    { name: 'Around_The_Block_Teaser_1.mp4',
    //      data: <Buffer f8 e2 be 48 c4 e2 ea 76 92 ce c8 68 a2 31 cb dc 72 a7 97 ce 72 6c 8f 71 54 67 07 e7 5d 38 56 fb 89 45 5d 98 fd e2 85 c3 ed c2 af d3 98 73 ef 49 b7 46 ... >,
    //      encoding: '7bit',
    //      truncated: false,
    //      mimetype: 'application/octet-stream',
    //      md5: '005e8392a3577dbb9b244f360df26c46',
    //      mv: [Function: mv] } }

    // resumable.post(req, (status, filename, originalFilename, identifier) => {
    //   console.log('POST', status, originalFilename, identifier)
    //   res.send(status)
    // })
    // res.status(200).send('ok')
  })

  router.get('/thumbnail/resize', (req, res, next) => {
    let imgUrl = req.query.url
    let size = req.query.size
    let hash = crypto.createHash('sha256').update(imgUrl).digest()

    console.log(imgUrl, size, hash.toString('hex'))
    let originalImgPath = path.join(process.env.TMP_DIR, 'img-js-' + hash.toString('hex') + path.extname(imgUrl))
    let outputFilename = path.join(process.env.TMP_DIR, 'img-js-' + hash.toString('hex') + '_' + size + path.extname(imgUrl))

    fs.readFile(outputFilename, (err, file) => {
      if (err) {
        // file doesn't exist.
        fs.readFile(originalImgPath, (err, file) => {
          if (err) {
            // download original
            let stream = fs.createWriteStream(originalImgPath)

            request.get(imgUrl)
              .on('error', (err) => {
                res.sendStatus(500).send(err)
              })
              .on('end', () => {
                console.log('stream ended!', stream.path)
                resizeImg(stream.path, size, outputFilename, (err, filename) => {
                  if (err) {
                    res.sendStatus(500).send(err)
                  } else {
                    let f = fs.createReadStream(outputFilename)
                    pump(f, res, (err) => {
                      if (err) console.log('err: ', err)
                    })
                  }
                })
              })
              .pipe(stream)
          } else {
            // resize img
            resizeImg(originalImgPath, size, outputFilename, (err, filename) => {
              if (err) {
                res.sendStatus(500).send(err)
              } else {
                let f = fs.createReadStream(outputFilename)
                pump(f, res, (err) => {
                  if (err) console.log('err: ', err)
                })
              }
            })
          }
        })
      } else {
        // resized version exist. send it.
        let f = fs.createReadStream(outputFilename)
        pump(f, res, (err) => {
          if (err) console.log('err: ', err)
        })
      }
    })
    // let stream = fs.createWriteStream(originalImgPath)
    //
    // request.get(imgUrl)
    //   .on('error', (err) => {
    //     res.sendStatus(500).send(err)
    //   })
    //   .on('end', () => {
    //     console.log('stream ended!', stream.path)
    //
    //     ffmpeg(stream.path)
    //       .addOption(`-vf scale=${size}`)
    //       .on('end', () => {
    //         console.log(stream.path, ':', size, '\t DONE')
    //         // res.send(200)
    //         // res.send()
    //         let f = fs.createReadStream(outputFilename)
    //         pump(f, res, (err) => {
    //           if (err) console.log('err: ', err)
    //         })
    //       })
    //       .save(path.join(process.env.TMP_DIR, 'resized-img-js-' + hash.toString('hex') + path.extname(imgUrl)))
    //       .run()
    //   })
    //   .pipe(stream)
  })

  function resizeImg (img, size, outputFilename, cb) {
    cb = once(cb)
    ffmpeg(img)
      .addOption(`-vf scale=${size}`)
      .on('error', (err) => {
        return cb(err)
      })
      .on('end', () => {
        console.log(img, ':', size, '\t DONE')
        // res.send(200)
        // res.send()
        return cb(null, outputFilename)
      })
      .save(outputFilename)
      .run()
  }

  node.api.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Content-Disposition')
    next()
  })

  node.api.use(fileUpload())
  node.api.use('/api/v1', router)
}
