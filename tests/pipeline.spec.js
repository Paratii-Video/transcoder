/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const assert = chai.assert
const expect = chai.expect
chai.use(dirtyChai)
const { each, setImmediate } = require('async')
const PIPFS = require('../src/pipfs')
const Pipeline = require('../src/pipeline')

// describe('# Pipeline Spec', function () {
//   this.timeout(20000)
//
//   let pipeline
//   before((done) => {
//     pipeline = new Pipeline({})
//     pipeline.on('job:status', (job, status) => {
//       console.log(`Job ${job.hash} : ${status}`)
//     })
//     done()
//   })
//
//   it('run a single job, get done back', (done) => {
//     pipeline.push({hash: String(Math.random() * 100), priority: 1}, (err, status) => {
//       if (err) {
//         return done(err)
//       }
//
//       assert.equal(status, 'done')
//       return done()
//     })
//     // console.log('pipeline waiting list length: ', pipeline._queue.length())
//   }).timeout(20000)
//
//   it('run multiple jobs, remove one from queue', (done) => {
//     let jobs = [
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.random() * 100), priority: 1}
//     ]
//
//     each(jobs, pipeline.push.bind(pipeline), (err) => {
//       if (err) return done(err)
//       // done()
//     })
//
//     pipeline.once('drained', () => {
//       console.log('all jobs are done')
//       done()
//     })
//
//     setImmediate(() => {
//       console.log('pipeline waiting list length: ', pipeline._queue.length())
//       setTimeout(() => {
//         console.log('removing job #', jobs[7].hash)
//         pipeline._queue.remove((task, priority) => { return (task.data.hash === jobs[7].hash) })
//       }, 1000)
//     })
//   }).timeout(25000)
//
//   it('get queue stats', (done) => {
//     let jobs = [
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
//       {hash: String(Math.random() * 100), priority: 1}
//     ]
//
//     each(jobs, pipeline.push.bind(pipeline), (err) => {
//       if (err) return done(err)
//       // done()
//     })
//
//     pipeline.once('drained', () => {
//       console.log('all jobs are done')
//       done()
//     })
//
//     setTimeout(() => {
//       let stats = pipeline.stats()
//       assert.isOk(stats)
//       assert.equal(stats.running, true)
//       console.log('currently processing : ', stats.workersList.map((task) => {
//         return task.data
//       }))
//
//       console.log('stats ongoing: ', stats.ongoing)
//     }, 1000)
//   })
// })

describe('# pipeline', function () {
  let pipeline, pipfs
  before((done) => {
    pipfs = new PIPFS({
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
          '/dns4/bootstrap.paratii.video/tcp/443/wss/ipfs/QmeUmy6UtuEs91TH6bKnfuU1Yvp63CkZJWm624MjBEBazW',
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

    pipeline = new Pipeline({pipfs: pipfs})
    pipfs.on('ready', () => {
      done()
    })
  })

  it('transcode a properly fragged file', (done) => {
    pipfs.upload(['./tests/fixtures/frag_bunny.mp4'], (err, hashes) => {
      if (err) return done(err)
      assert.isOk(hashes)
      expect(hashes).to.have.lengthOf(1)

      pipeline.push({
        hash: hashes[0].hash,
        priority: 1
      }, (err, status) => {
        if (err) return done(err)
        console.log('video Transcoded ', status)
        done()
      })
    })
  }).timeout(300000)
})

// non fragged file
// data:  { format: 'mov,mp4,m4a,3gp,3g2,mj2',
  // audio: 'aac (LC) (mp4a / 0x6134706D)',
  // video: 'h264 (Main) (avc1 / 0x31637661)',
  // duration: '00:02:34.62',
  // video_details:
  //  [ 'h264 (Main) (avc1 / 0x31637661)',
  //    'yuv420p(tv',
  //    'bt709)',
  //    '1280x720 [SAR 1:1 DAR 16:9]',
  //    '531 kb/s',
  //    '23.98 fps',
  //    '23.98 tbr',
  //    '90k tbn',
  //    '47.95 tbc (default)' ],
  // audio_details:
  //  [ 'aac (LC) (mp4a / 0x6134706D)',
  //    '44100 Hz',
  //    'stereo',
  //    'fltp',
  //    '125 kb/s (default)' ] }
