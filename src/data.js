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

  dumpDb (callback) {
    this.db.createReadStream()
      .on('data', (data) => {
        console.log(data.key.toString(), '\n')
      })
      .on('error', (err) => {
        console.log('Oh my!', err)
        callback(err)
      })
      .on('close', () => {
        console.log('Stream closed')
      })
      .on('end', () => {
        console.log('Stream ended')
        callback()
      })
  }
}

module.exports = Data
