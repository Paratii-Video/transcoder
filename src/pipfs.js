/**
 * @module TranscoderIPFS integration.
 */

'use strict'

const { EventEmitter } = require('events')
const Ipfs = require('ipfs')
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

  start (cb) {
  }
}

module.exports = PIPFS
