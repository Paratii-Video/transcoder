
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

  exportDb (callback) {
    let output = []

    this.db.createReadStream()
      .on('data', (data) => {
        let obj
        try {
          obj = data.value.toString()
          obj = JSON.parse(obj)
        } catch (e) {
          console.log('Couldn\'t parse Video ', data.key.toString(), ' | err: ', e)
        }

        let vid = {
          _id: data.key.toString(),
          title: obj.info.title,
          description: obj.info.description,
          price: 0,
          src: '/ipfs/' + obj.result.master.hash,
          mimetype: 'video/mp4',
          thumb: obj.info.thumbnail_url || obj.result.screenshots[0],
          stats: {
            likes: 0,
            dislikes: 0
          },
          uploader: {
            address: '0xe19678107410951a9ed1f6906ba4c913eb0e44d4', // arbitrary address for now. FIXME
            name: (obj.info.author) ? obj.info.author.name : obj.info.uploader
          },
          tags: obj.info.keywords
        }

        output.push(vid)
      })
      .on('error', (err) => {
        console.log('Oh my!', err)
        callback(err)
      })
      .on('close', () => {
        console.log('Data Stream closed')
      })
      .on('end', () => {
        console.log('Data Stream ended')
        callback(null, output)
      })
  }
}

module.exports = Data
