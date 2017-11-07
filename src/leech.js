'use strict'
const os = require('os')
const path = require('path')
const fs = require('fs')
const { queue, eachSeries } = require('async')
const Transcoder = require('./transcoder')
const PIPFS = require('./pipfs')
const downloader = require('./downloader')
const Data = require('./data')

const log = require('debug')('paratii:transcoder')
log.error = require('debug')('paratii:transcoder:error')

let testHash = '/ipfs/QmR6QvFUBhHQ288VmpHQboqzLmDrrC2fcTUyT4hSMCwFyj'
// const testHash = '/ipfs/QmeG4popSYeipnvuvP6u4UxuRfKWTzy6eEMyC54ArFRNiG'
var data = new Data({})

var pipfs = new PIPFS({
  bitswap: {
    maxMessageSize: 32 * 1024
  },
  // repo: String(Math.random()),
  config: {
    'Addresses': {
      'Swarm': [
        '/ip4/0.0.0.0/tcp/4002',
        '/ip4/127.0.0.1/tcp/4003/ws'
      ],
      'API': '/ip4/127.0.0.1/tcp/5002',
      'Gateway': '/ip4/127.0.0.1/tcp/9090'
    },
    'Discovery': {
      'MDNS': {
        'Enabled': true,
        'Interval': 10
      },
      'webRTCStar': {
        'Enabled': true
      }
    },
    'Bootstrap': [
      '/ip4/104.131.131.82/tcp/4001/ipfs/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
      '/ip4/104.236.179.241/tcp/4001/ipfs/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM',
      '/ip4/162.243.248.213/tcp/4001/ipfs/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm',
      '/ip4/128.199.219.111/tcp/4001/ipfs/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu',
      '/ip4/104.236.76.40/tcp/4001/ipfs/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64',
      '/ip4/178.62.158.247/tcp/4001/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd',
      '/ip4/178.62.61.185/tcp/4001/ipfs/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3',
      '/dns4/wss0.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmZMxNdpMkewiVZLMRxaNxUeZpDUb34pWjZ1kZvsd16Zic',
      '/dns4/wss1.bootstrap.libp2p.io/tcp/443/wss/ipfs/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzJyGFsD6'
    ]
  }
})

// let transcoder = new Transcoder({
//   sourcePath: testHash
// })
//
// transcoder.start((err, res) => {
//   if (err) throw err
//
//   console.log('done!')
// })

function startTranscodingJob (job, cb) {
  if (!job) {
    throw new Error('job is required')
  }
  data.getVideo(job.hash, (err, vid) => {
    if (err) throw err
    if (vid) {
      let obj
      try {
        obj = JSON.parse(vid)
      } catch (e) {
        console.error('video obj cannot be parsed', vid)
      }

      return cb(null, obj.result)
    } else {

      log('Starting job ', job.hash)

      let transcoder = new Transcoder({
        ipfs: job.ipfs,
        sourcePath: job.hash
      })

      transcoder.start((err, res) => {
        if (err) return cb(err)

        log('Transcoding Job ', job.hash, ' done')
        // add info + master hash
        data.addVideo(job.hash, {result: res, info: job.info}, (err) => {
          if (err) {
            console.log('addVideo Error ', err)
            return cb(err)
          }

          cb(null, res)
        })

        // cb(null, res)
      })
    }
  })
}

function allDone () {
  log('All Transcoding Jobs done!')
}

var qTranscoder = queue(startTranscodingJob, 4)
qTranscoder.drain = allDone

pipfs.on('ready', () => {
  // qTranscoder.push({
  //   ipfs: pipfs.ipfs,
  //   hash: testHash
  // })

  pipfs.startAPI(() => {

  })
  pipfs.on('transcode', (peerId, command) => {
    log('full loop ', command.payload.toString(), '\n', command.args.toString())
    let args = JSON.parse(command.args.toString())
    qTranscoder.push({
      peerId: peerId,
      ipfs: pipfs.ipfs,
      hash: args.hash
    })
  })

  // Youtube Download Test
  // const url = 'https://www.youtube.com/watch?v=fULtYTDgZgA'
  // downloader.yt.getInfo(url, (err, info) => {
  //   if (err) throw err
  //   console.log('info : ', info)
  // })
  // const output = path.resolve(__dirname, '../video.mp4')
  // downloader.download(url, output, (err, out) => {
  //   if (err) throw err
  //
  //   log('downloader called back , uploading to IPFS')
  //   pipfs.upload([out], (err, resp) => {
  //     if (err) throw err
  //     log('upload finished ', resp)
  //     qTranscoder.push({
  //       peerId: pipfs.id,
  //       ipfs: pipfs.ipfs,
  //       hash: resp[0].hash
  //     })
  //   })
  // })


  // downloader.parseXlsx('./content_vids.xlsx', (err, result) => {
  //   if (err) throw err
  //   console.log('result: ', result)
  //
  //   require('fs').writeFile('./vids.json', JSON.stringify(result), (err, done) => {
  //     if (err) throw err
  //     console.log('done')
  //   })
  //
  //   if (result && result.youtube) {
  //     result.youtube.forEach((record) => {
  //       downloader.download(
  //         record.url,
  //         path.join(os.tmpdir(), 'yt_' + record.name.replace('/ /g', '_') + '.mp4'),
  //         (err, output) => {
  //           if (err) throw err
  //           pipfs.upload([output], (err, resp) => {
  //             if (err) throw err
  //             qTranscoder.push({
  //               peerId: pipfs.id,
  //               ipfs: pipfs.ipfs,
  //               hash: resp[0].hash
  //             })
  //           })
  //         })
  //     })
  //   }
  // })

  fs.readFile('./vids.json', (err, vids) => {
    if (err) throw err

    try {
      vids = JSON.parse(vids)
    } catch (e) {
      if (e) throw e
    }

    eachSeries(vids.youtube, (record, callback) => {
      downloader.yt.getInfo(record.url, (err, info) => {
        if (err) return callback(err)
        downloader.download(
          record.url,
          path.join(os.tmpdir(), 'yt_' + record.name.replace(/( |\/)/g, '_') + '.mp4'),
          (err, output) => {
            if (err) return callback(err)
            pipfs.upload([output], (err, resp) => {
              if (err) return callback(err)
              qTranscoder.push({
                peerId: pipfs.id,
                ipfs: pipfs.ipfs,
                hash: resp[0].hash,
                info: info // adding info for later parsing
              })

              callback()
            })
          })
      })
    })

    // eachSeries(vids.vimeo, (record, callback) => {
    //   downloader.vi.getInfo(record.url, (err, info) => {
    //     if (err) throw err
    //     downloader.viDownload(
    //       record.url,
    //       path.join(os.tmpdir(), 'vi_' + record.name.replace('/( |\/)/g', '_') + '.mp4'),
    //       (err, output) => {
    //         if (err) throw err
    //         pipfs.upload([output], (err, resp) => {
    //           if (err) throw err
    //           qTranscoder.push({
    //             peerId: pipfs.id,
    //             ipfs: pipfs.ipfs,
    //             hash: resp[0].hash,
    //             info: info, // adding info for later parsing
    //             sourceUrl: record.url
    //           })
    //
    //           callback()
    //         })
    //       })
    //   })
    // })

    // data.dumpDb((err) => {
    //   if (err) throw err
    //   console.log('done')
    // })
    // fs.readdir(os.tmpdir(), (err, files) => {
    //   if (err) throw err
    //   eachSeries(files, (file, callback) => {
    //     if (file && file.match(/yt_/g)) {
    //       pipfs.upload([output], (err, resp) => {
    //         if (err) throw err
    //         qTranscoder.push({
    //           peerId: pipfs.id,
    //           ipfs: pipfs.ipfs,
    //           hash: resp[0].hash,
    //           info: info, // adding info for later parsing
    //           sourceUrl: record.url
    //         })
    //
    //         callback()
    //       })
    //     }
    //   })
    // })
  })

  // const vidl = require('vimeo-downloader')
  // const url = 'https://vimeo.com/129522659'
  // downloader.viDownload(url, './vimeo-video.mp4', (err, output) => {
  //   if (err) throw err
  //
  //   console.log('output: ', output)
  // })
})
