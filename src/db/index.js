'use strict'

const { parallel } = require('async')
const db = require('./dbs')

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
    // TODO: add a log to record time of updatestatus
    // TODO: trigger an update event. use sublevel built-in events ??? maybe.
    db.status.put(originHash, val, callback)
  },

  // ------------------------[Info Ops]-----------------------------------------
  /**
   * get Info on a hash
   * @param  {String}   hash     could be origin or Transcoded hash.
   * @param  {Function} callback returns (err, info), info Obj spec ???
   */
  getInfo: (hash, callback) => {
    db.info.get(hash, callback)
  },

  /**
   * updates video info
   * @param  {String}   hash     origin or transcoded hash
   * @param  {Object}   info     the info Object, schema needs to be later defined.
   * @param  {Function} callback returns (err) function.
   */
  updateInfo: (hash, info, callback) => {
    // TODO define a schema for the info
    db.info.put(hash, JSON.stringify(info), callback)
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
    if (!origin || !transcoded) {
      return callback(new Error('both origin and transcoded are required by updateHashIndex'))
    }

    parallel([
      (cb) => {
        db.origin2Transcoded.put(origin, transcoded, cb)
      },
      (cb) => {
        db.transcoded2Origin.put(transcoded, origin, cb)
      }], callback)
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

      db.owner2Videos.put(address, JSON.stringify(vidsArr), callback)
    })
  }
}

module.exports = dataOps