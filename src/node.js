'use strict'

const express = require('express')
const { EventEmitter } = require('events')
const compression = require('compression')
const dopts = require('default-options')
const PIPFS = require('./pipfs')
const apiRoutes = require('./api/v1')
// const db = require('./db')
const Pipeline = require('./pipeline')

class PublisherNode extends EventEmitter {
  /**
   * Publisher Node is the main entry point. it initiates Paratii-IPFS, the
   * transcoding pipeline and REST API for the node.
   * @param  {Object} opts check defaults.
   * @return {PublisherNode}      returns a PublisherNode instance.
   */
  constructor (opts) {
    super()

    let defaults = {
      ipfs: {
        EXPERIMENTAL: { // enable experimental features
          pubsub: false,
          sharding: true, // enable dir sharding
          dht: true // enable KadDHT, currently not interopable with go-ipfs
        },
        bitswap: {
          maxMessageSize: 32 * 1024
        },
        // repo: String(Math.random()),
        config: {
          'Addresses': {
            'Swarm': [
              '/ip4/0.0.0.0/tcp/4002',
              '/ip4/127.0.0.1/tcp/4003/wss',
              '/ip4/0.0.0.0/tcp/4003/ws',
              '/dns4/ws.star.paratii.video/tcp/443/wss/p2p-websocket-star'
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
      },
      api: {
        port: 3000
      },
      pipeline: {}
    }

    this._options = dopts(opts, defaults, {allowUnknown: true})

    // Publisher Node api
    this.api = express()
    this.api.use(compression())
    // hook up the routes
    apiRoutes(this)

    this.api.listen(this._options.api.port)
    // -------------------------------
    // PIPFS & Pipeline.
    this.ipfs = new PIPFS(this._options.ipfs)
    this._options.pipeline.pipfs = this.ipfs
    this.pipeline = new Pipeline(this._options.pipeline)

    // PIPFS events.
    this.ipfs.on('ready', this._onPIPFSReady.bind(this))

    this.ipfs.on('error', (err) => {
      if (err) {
        console.log('[PIPFS] Error: ', err)
      }
    })
  }

  /**
   * hooks up event handlers for transcoding and IPFS API
   */
  _onPIPFSReady () {
    // start the IPFS gateway
    this.ipfs.startAPI(() => {
      this.emit('ready')
    })

    // catch that transcode command from paratii-protocol
    this.ipfs.on('transcode', (peerId, command) => {
      console.log('full loop ', command.payload.toString(), '\n', command.args.toString())
      let args = JSON.parse(command.args.toString())

      // push command to the main transcoder pipeline.
      this.pipeline.push({
        peerId: peerId,
        priority: 1,
        pipfs: this.ipfs,
        hash: args.hash,
        size: args.size
      })
    })

    this.ipfs.on('pin', (peerId, command) => {
      console.log('Got pinning command ', command.payload.toString(), '\n', command.args.toString())
      let args = JSON.parse(command.args.toString())
      this.ipfs.grabFile(args.hash, (err) => {
        if (err) {
          let msg = this.ipfs.protocol.createCommand('pin:error',
            { hash: args.hash,
              err: JSON.stringify(err)
            })
          this.ipfs.protocol.network.sendMessage(peerId, msg, (err) => {
            if (err) return console.log('err: ', err)
            console.log('paratii protocol msg sent: ', args.hash)
          })
          console.log('sending pin:error ', err)
        } else {
          let msg = this.ipfs.protocol.createCommand('pin:done', { hash: args.hash })
          console.log('sending pin:done ', msg)
          this.ipfs.protocol.network.sendMessage(peerId, msg, (err) => {
            if (err) return console.log('err: ', err)
            console.log('paratii protocol msg sent: ', args.hash)
          })
          console.log('grabFile done!!')
        }
      })
    })

    // this.ipfs.on('transcoding:progress', (peerId, command) => {
    //   // let args = JSON.parse(command.args.toString())
    //   console.log('transcoding progress:::: ', command.payload.toString(), '\n', command.args.toString())
    // })
  }

  /**
   * stop the PublisherNode, mainly to stop ipfs
   * @param  {Function} callback (err)
   * @return {Object}            returns error Object.
   */
  stop (callback) {
    this.ipfs.ipfs.stop(callback)
  }
}

module.exports = PublisherNode
