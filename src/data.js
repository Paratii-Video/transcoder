'use strict'

const levelup = require('levelup')
const leveldown = require('leveldown')

class Data {
  constructor (opts) {
    this.db = levelup(leveldown(opts.dbName || './dbstore'))
  }

  addVideo (url, video, callback) {
    this.db.put(url, JSON.stringify(video), callback)
  }

  getVideo (vId, callback) {
    this.db.get(vId, callback)
  }
}

module.exports = Data
