'use strict'

const { EventEmitter } = require('events')

const io = require('socket.io')
const redisAdapter = require('socket.io-redis')

class Dispatch extends EventEmitter {
  constructor (opts) {
    super()
    if (!opts) {
      opts = {}
    }

    this._config = {}
    this._config.port = opts.port || 3000
    this._config.redisConf = opts.redisConf || { host: 'localhost', port: 6379 }
    this._node = opts.node
    if (opts.server) {
      this._io = io(opts.server, {
        serveClient: false,
        pingInterval: 10000,
        pingTimeout: 5000,
        cookie: false
      })
    } else {
      this._io = io(this._config.port, {
        serveClient: false,
        pingInterval: 10000,
        pingTimeout: 5000,
        cookie: false
      })
    }

    this._io.adapter(redisAdapter(this._config.redisConf))

    this._io.on('connection', (socket) => {
      socket.emit('hello', {test: 1})
      console.log('got connection')
      socket.join('room42', () => {
        let rooms = Object.keys(socket.rooms)
        console.log(rooms)
        console.log('socket.id: ', socket.id)
      })

      socket.on('room42', (data) => {
        console.log('room42:', data)
      })

      socket.on('upload', (data) => {
        // TODO
      })

      socket.on('transcode', (data) => {
        this._node.pipeline.push({
          peerId: socket.id,
          priority: 1,
          pipfs: this._node.ipfs,
          hash: data.hash,
          size: data.size
        })
        console.log('got transcode', data)
        socket.emit('statusUpdate', data)
      })

      socket.on('pin', (data) => {
        // TODO
      })

      socket.on('getStatus', (data) => {

      })
      // socket.on('serve', this._handleServe.bind(this))
    })
  }

  _handleUpload (data) {

  }

  _handleTranscode (data) {

  }

  _handlePin (data) {

  }
}

module.exports = Dispatch
