'use strict'


const { queue } = require('async')
const Transcoder = require('./transcoder')
const PIPFS = require('./pipfs')

const log = require('debug')('paratii:transcoder')
log.error = require('debug')('paratii:transcoder:error')

let testHash = '/ipfs/QmR6QvFUBhHQ288VmpHQboqzLmDrrC2fcTUyT4hSMCwFyj'
// const testHash = '/ipfs/QmeG4popSYeipnvuvP6u4UxuRfKWTzy6eEMyC54ArFRNiG'

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

  log('Starting job ', job.hash)

  let transcoder = new Transcoder({
    ipfs: job.ipfs,
    sourcePath: job.hash
  })

  transcoder.start((err, res) => {
    if (err) throw err

    log('Transcoding Job ', job.hash, ' done')
    let msg = pipfs.protocol.createCommand('transcoding:done', {hash: job.hash, author: job.peerId, result: JSON.stringify(res)})
    pipfs.protocol.network.sendMessage(job.peerId, msg, (err) => {
      if (err) throw err
      log('paratii protocol msg sent: ', job.hash)
    })
    cb(null, res)
  })
}

function allDone () {
  log('All Transcoding Jobs done!')
}

var qTranscoder = queue(startTranscodingJob, 1)
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
})
