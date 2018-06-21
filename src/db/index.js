'use strict'

const { parallel } = require('async')
// const db = require('./dbs')
const db = require('./redis')
const handleError = (err) => {
  if (err) {
    console.log('unhandled DB ERROR: ', err)
  }
}
/**
 * All the data functions
 * @type {Object}
 */
const dataOps = {
  // ------------------------[Status Ops]---------------------------------------
  /**
   * get the status of the transcoding by originHash
   * @param  {String}   originHash     video origin hash
   * @param  {Function} callback returns (err, status) where status is string.
   */
  getStatus: (originHash, callback) => {
    db.status.get(originHash, callback)
  },

  /**
   * set video status relative to the transcoder
   * @param {String}   originHash     original video hash (preTranscoded)
   * @param {String}   val      current status of the video
   * @param {Function} callback err callback
   */
  updateStatus: (originHash, val, callback) => {
    if (!callback) {
      callback = handleError
    }
    // TODO: add a log to record time of updatestatus
    // TODO: trigger an update event. use sublevel built-in events ??? maybe.
    db.status.set(originHash, val, callback)
  },

  /**
   * remove a job status, useful for removing wrong in-progress.
   * @param  {String}   originHash origin IPFS hash.
   * @param  {Function} cb         (err)
   * @return {Object}              error instance if del didn't work.
   */
  removeStatus: (originHash, cb) => {
    db.status.del(originHash, cb)
  },

  // ------------------------[progress Ops]-----------------------------------------
  getProgress: (originHash, cb) => {
    db.progress.get(originHash, cb)
  },

  updateProgress: (originHash, json, cb) => {
    db.progress.get(originHash, (err, _str) => {
      if (err) {
        // no progress for this origin hash just yet.
        db.progress.set(originHash, JSON.stringify(json), cb)
      } else {
        let obj = JSON.parse(_str)
        let newObj = Object.assign({}, obj, json)
        db.progress.set(originHash, JSON.stringify(newObj), cb)
      }
    })
  },

  getOverview: (originHash, callback) => {
    parallel({
      info: (cb) => {
        dataOps.getInfo(originHash, cb)
      },
      progress: (cb) => {
        dataOps.getProgress(originHash, cb)
      }
    }, callback)
  },

  // ------------------------[Info Ops]-----------------------------------------
  /**
   * get Info on a hash
   * @param  {String}   hash     could be origin or Transcoded hash.
   * @param  {Function} callback returns (err, info), info Obj spec ???
   */
  getInfo: (hash, callback) => {
    db.info.get(hash, (err, infoStr) => {
      if (err) return callback(err)
      return callback(null, JSON.parse(infoStr))
    })
  },

  /**
   * updates video info
   * @param  {String}   hash     origin or transcoded hash
   * @param  {Object}   info     the info Object, schema needs to be later defined.
   * @param  {Function} callback returns (err) function.
   */
  updateInfo: (hash, info, callback) => {
    // TODO define a schema for the info
    db.info.set(hash, JSON.stringify(info), callback)
  },

  // -----------------------[origin & transcoded conversions]-------------------
  /**
   * figure out if the hash is an origin hash or not.
   * @param  {String}   hash     IPFS hash to test
   * @param  {Function} callback returns (err, isOrigin)
   * @return {Boolean}           isOrigin or not.
   */
  isOriginHash: (hash, callback) => {
    db.origin2Transcoded.get(hash, (err, transcoded) => {
      if (err) {
        return callback(err)
      }

      if (transcoded) {
        // there is a record. hence hash is an origin.
        return callback(null, true)
      } else {
        return callback(null, false)
      }
    })
  },

  /**
   * check if hash is transcoded hash or not.
   * @param  {String}   hash     IPFS hash to test.
   * @param  {Function} callback (err, isTranscodedHash)
   * @return {Boolean}           isTranscodedHash
   */
  isTranscodedHash: (hash, callback) => {
    db.transcoded2Origin.get(hash, (err, origin) => {
      if (err) {
        return callback(err)
      }

      if (origin) {
        // there is a record. hence hash is a transcoded hash.
        return callback(null, true)
      } else {
        return callback(null, false)
      }
    })
  },

  /**
   * updates both origin2Transcoded & transcoded2Origin once both are available
   * @param  {String}   origin     origin hash
   * @param  {String}   transcoded transcoded IPFS hash
   * @param  {Function} callback   async parallel callback.
   */
  updateHashIndex: (origin, transcoded, callback) => {
    if (!callback) {
      callback = handleError
    }

    if (!origin || !transcoded) {
      return callback(new Error('both origin and transcoded are required by updateHashIndex'))
    }

    parallel([
      (cb) => {
        db.origin2Transcoded.set(origin, transcoded, cb)
      },
      (cb) => {
        db.transcoded2Origin.set(transcoded, origin, cb)
      }], callback)
  },

  // --------------------------[Id Index]----------------------------------
  /**
   * get both origin & transcoded hashes from id
   * @param  {String}   id       UUID of the Job
   * @param  {Function} callback (err, hashes)
   * @return {Object}            origin & transcoded hash(if available)
   */
  getHashesById: (id, callback) => {
    if (!id) {
      return callback(new Error('Id is required to get Hashes'))
    }

    db.idIndex.get(id, (err, str) => {
      if (err) return callback(err)
      return callback(null, JSON.parse(str))
    })
  },

  /**
   * adds a new id to the db
   * @param {String} id     UUID of the Job
   * @param {String} origin IPFS hash of the original video
   */
  addId: (id, origin, callback) => {
    if (!callback) {
      callback = handleError
    }

    if (!id || !origin) {
      return callback(new Error('both id and origin are required to add ID to DB'))
    }

    db.idIndex.set(id, JSON.stringify({origin: origin}), callback)
  },

  /**
   * updates idIndex with the transcoding hash
   * @param {String}   id       UUID of the Job
   * @param {String}   hash     IPFS hash of transcoded video
   * @param {Function} callback (err)
   */
  addTranscodedHash: (id, hash, callback) => {
    if (!callback) {
      callback = handleError
    }

    if (!id || !hash) {
      return callback(new Error('both id and hash are required to update ID in DB'))
    }

    module.exports.getHashesById(id, (err, obj) => {
      if (err) {
        return callback(err)
      }

      obj.transcoded = hash
      db.idIndex.set(id, JSON.stringify(obj), callback)
    })
  },
  // --------------------------[ownership Ops]----------------------------------
  /**
   * get an array of videos owned by ETH address
   * @param  {ETHAddress}   address  ETH address of the ownership
   * @param  {Function} callback (err, Array)
   */
  getOwnerVideos: (address, callback) => {
    db.owner2Videos.get(address, (err, vidsStr) => {
      if (err) {
        return callback(err)
      }
      let vidsArr = []

      if (vidsStr) {
        try {
          vidsArr = JSON.parse(vidsStr)
        } catch (e) {
          return callback(e)
        }
      }

      return callback(null, vidsArr)
    })
  },

  /**
   * add a new video to the owner's array.
   * @param  {ETHAddress}   address  ETH address
   * @param  {String}   hash     IPFS of the video
   * @param  {Function} callback (err) callback
   */
  updateOwner: (address, hash, callback) => {
    dataOps.getOwnerVideos(address, (err, vidsArr) => {
      if (err) {
        return callback(err)
      }

      vidsArr.push(hash)

      db.owner2Videos.set(address, JSON.stringify(vidsArr), callback)
    })
  }
}

module.exports = dataOps
