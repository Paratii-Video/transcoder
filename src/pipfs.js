/**
 * @module TranscoderIPFS integration.
 */

'use strict'

const { EventEmitter } = require('events')
const Ipfs = require('ipfs')
const HttpAPI = require('ipfs/src/http/index.js')
const ParatiiProtocol = require('paratii-protocol')
const log = require('debug')('paratii:ipfs')
log.error = require('debug')('paratii:ipfs:error')

class PIPFS extends EventEmitter {
  constructor (opts) {
    super()

    this.config = opts
    this.ipfs = new Ipfs(this.config)

    this.ipfs.on('ready', () => {
      log('up and running ... repo:', this.ipfs.repo.path())
      log('Hooking up paratii-protocol')
      this.ipfs.id().then((id) => {
        this.protocol = new ParatiiProtocol(
          this.ipfs._libp2pNode,
          this.ipfs._repo.blocks,
          // add ETH Address here.
          '0xPlace_holder_here_till_I_add_utils'
        )

        this.protocol.notifications.on('message:new', (peerId, msg) => {
          console.log('[paratii-protocol] ', peerId.toB58String(), ' new Msg: ', msg)
        })

        this.protocol.notifications.on('command:transcode', (peerId, command) => {
          log('got Transcode command from ', peerId.toB58String(), ' | command: ', command)
          this.emit('transcode', peerId, command)
        })

        this.protocol.start(() => {
          log('paratii-protocol is live.')
          this.emit('ready')
          // return cb(null)
        })
      })

      this.ipfs.on('error', (err) => {
        if (err) throw err
      })
    })
  }

  startAPI (cb) {
    this.httpAPI = new HttpAPI(this.ipfs, null, null)

    this.httpAPI.start((err) => {
      if (err && err.code === 'ENOENT' && err.message.match(/Uninitalized repo/i)) {
        log('Error: no initialized ipfs repo found in ' + this.node.repo.path())
        log('please run: jsipfs init')
      }
      if (err) {
        throw err
      }
      log('Daemon is ready')
      cb()
    })
  }
}

module.exports = PIPFS
