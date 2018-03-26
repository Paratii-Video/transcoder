'use strict'
const { EventEmitter } = require('events')
const { LivepeerSDK } = require('@livepeer/sdk')

class Livepeer extends EventEmitter {
  constructor (opts) {
    super()

    this.init()
  }

  init () {
    return new Promise((resolve, reject) => {
      if (this._rpc) {
        return resolve(this._rpc)
      } else {
        LivepeerSDK(this._livepeerOpts).then(async (sdk) => {
          const { rpc } = sdk
          const tokens = await rpc.getTokenTotalSupply()

          console.log(tokens)
          this._rpc = rpc
          return resolve(rpc)
        }).catch(reject)
      }
    })
  }

  async createJob (job) {
    let rpc = await this.init()
    let tx = await rpc.createJob(job)
    return tx
  }
}

module.exports = Livepeer
