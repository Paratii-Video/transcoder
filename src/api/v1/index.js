'use strict'
const os = require('os')
const fs = require('fs')
const path = require('path')
const express = require('express')
const fileUpload = require('express-fileupload')
const glob = require('glob')
const eachLimit = require('async/eachLimit')
const once = require('once')

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

  // router.post('/transcode/:hash', (req, res, next) => {
  //   // res.json({Message: 'Not implemented yet', code: 0})
  //   let hash = req.params.hash
  //   req.pipe(fs.createWriteStream(path.join(os.tmpdir(), 'paratii-ipfs-' + hash)))
  //   req.on('end', () => {
  //     node.ipfs.upload([path.join(os.tmpdir(), 'paratii-ipfs-' + hash)], (err, hashes) => {
  //       if (err) {
  //         return res.status(500).send(err)
  //       }
  //       console.log('hashes: ', hashes)
  //       if (hashes && hashes[0]) {
  //         if (hashes[0].hash === req.params.hash) {
  //           return res.status(200).json({hash: hash, status: 'done'})
  //         } else {
  //           res.status(406).json({
  //             err: 'hash mismatch',
  //             expected: req.params.hash,
  //             actual: hashes[0].hash
  //           })
  //         }
  //       } else {
  //         return res.status(400).send('couldn\'t produce ipfs hash')
  //       }
  //     })
  //   })
  //
  //   // console.log('files: ', req.files)
  //   // if (!req.files) {
  //   //   return res.status(400).send('No files were uploaded.')
  //   // }
  //   //
  //   // let file = req.files.originVideo
  //   // file.mv(path.join(os.tmpdir(), 'paratii-ipfs-' + hash), (err) => {
  //   //   if (err) {
  //   //     return res.status(500).send(err)
  //   //   }
  //   // })
  // })

  router.post('/transcode/:hash', (req, res, next) => {
    let hash = req.params.hash
    console.log('req.body: ', req.body)
    console.log('hash to reproduce: ', hash)
    // resumable.post(req, (status, filename, originalFilename, identifier) => {
    //   console.log('POST', status, originalFilename, identifier)
    //   res.send(status)
    // })

    // console.log('req.files: ', req.files)

    let stream = fs.createWriteStream(path.join(os.tmpdir(), 'res-js-' + hash + '_' + req.body.resumableChunkNumber))

    stream.end(req.files.file.data, () => {
      if (req.body.resumableChunkNumber === req.body.resumableTotalChunks) {
        // combine file.
        glob(path.join(os.tmpdir(), 'res-js-' + hash + '_*'), (err, files) => {
          if (err) throw err
          console.log('got a list of files: ', files)
          node.ipfs.upload(files, (err, hashes) => {
            if (err) throw err
            console.log('got hashes: ', hashes)
            res.send('ok')
          })
          // if (!ipfsStream) {
          //   ipfsStream = node.ipfs.ipfs.files.addReadableStream()
          // }
          // let writeIt = fs.createWriteStream(path.join(os.tmpdir(), 'paratii-ipfs' + hash))
          //
          // eachLimit(files, 1, (file, callback) => {
          //   callback = once(callback)
          //   let s = fs.createReadStream(file).pipe(writeIt)
          //   s.once('error', (err) => {
          //     console.log('readStream Err: ', file, err)
          //     return callback(err)
          //   })
          //
          //   s.once('close', () => {
          //     return callback()
          //   })
          // }, (err) => {
          //   if (err) throw err
          //   res.status(200).send('ok')
          // })
        })
      } else {
        return res.status(200).send('ok')
      }
    })
    // if (req.body && req.body.resumableFilename) {
    //   if (!ipfsStream) {
    //     ipfsStream = node.ipfs.ipfs.files.addReadableStream()
    //   }
    //
    //   if (!lastChunk[req.body.resumableFilename]) {
    //     lastChunk[req.body.resumableFilename] = 0
    //   }
    //
    //   if (lastChunk[req.body.resumableFilename] === parseInt(req.body.resumableTotalChunks) &&
    //       req.body.resumableChunkNumber !== req.body.resumableTotalSize) {
    //     lastChunk[req.body.resumableFilename] = 0
    //   }
    //
    //   if (lastChunk[req.body.resumableFilename] + 1 === parseInt(req.body.resumableChunkNumber)) {
    //     ipfsStream.once('data', (file) => {
    //       console.log('ipfsStream: ', file)
    //       try {
    //         res.status(200).send('ok')
    //       } catch (e) {
    //         console.log('express err: ', e.msg)
    //       }
    //     })
    //     console.log('writing chunk ', req.body.resumableChunkNumber)
    //     ipfsStream.write({
    //       path: req.body.resumableFilename,
    //       content: Buffer.from(req.files.file.data)
    //     })
    //
    //     lastChunk[req.body.resumableFilename]++
    //   } else {
    //     try {
    //       res.status(405).send('nonce mismatch')
    //     } catch (e) {
    //       console.log('express err: ', e.msg)
    //     }
    //   }
    //   // -----------------------------------------------------------------------
    //   // if (!streams[req.body.resumableFilename]) {
    //   //   streams[req.body.resumableFilename] = fs.createWriteStream(path.join(os.tmpdir(), 'paratii-ipfs-' + hash))
    //   //
    //   //   streams[req.body.resumableFilename].on('error', (err) => {
    //   //     if (err) {
    //   //       console.error('stream error : ', err)
    //   //       return res.status(500).send(err)
    //   //     }
    //   //   })
    //   //
    //   //   streams[req.body.resumableFilename].once('close', () => {
    //   //     delete streams[req.body.resumableFilename]
    //   //   })
    //   // }
    //   //
    //   // if (req.body.resumableChunkNumber === req.body.resumableTotalChunks) {
    //   //   streams[req.body.resumableFilename].end(req.files.file.data, () => {
    //   //     console.log('ending stream')
    //   //     console.log(path.join(os.tmpdir(), 'paratii-ipfs-' + hash))
    //   //     node.ipfs.upload([path.join(os.tmpdir(), 'paratii-ipfs-' + hash)], (err, hashes) => {
    //   //       if (err) {
    //   //         return res.status(500).send(err)
    //   //       }
    //   //       console.log('hashes: ', hashes)
    //   //       if (hashes && hashes[0]) {
    //   //         if (hashes[0].hash === hash) {
    //   //           res.status(200).send('done')
    //   //         } else {
    //   //           console.log('hash mismatch', hash, hashes[0].hash)
    //   //           res.status(406).send('hash mismatch ' + hash + ' ' + hashes[0].hash)
    //   //         }
    //   //       } else {
    //   //         res.status(400).send('couldn\'t produce ipfs hash')
    //   //       }
    //   //     })
    //   //   })
    //   // } else {
    //   //   streams[req.body.resumableFilename].write(req.files.file.data, () => {
    //   //     // if (req.body.resumableChunkNumber === req.body.resumableTotalChunks) {
    //   //     // } else {
    //   //     // }
    //   //
    //   //     return res.status(200).send('ok')
    //   //   })
    //   // }
    //   // -----------------------------------------------------------------------
    // }
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

  node.api.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Content-Disposition')
    next()
  })

  node.api.use(fileUpload())
  node.api.use('/api/v1', router)
}
