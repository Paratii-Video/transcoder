'use strict'

// sublevels
// - status : holds originHash => transcoding status.
//    0 / null - unknown , hash is not known to this transcoder.
//    queued - awaiting transcoding.
//    in-progress - currently transcoding.
//    finished - finished transcoding, but not delievered to client.
//    done - finished, delivered.
//    settled - got paid.
//    --------------------------------------------------------------------------
// - info : holds actual info for the job hash => info.
// - origin2transcoded : returns transcoded hash from origin.
// - transcoded2origin : returns origin from transcoded hash.
// - owner2videos : retuns array of transcodedHashes from origin address
// - pubKey2videos: returns array of transcodedHashes from owner PubKey.
//    --------------------------------------------------------------------------
// TODO : add sublevels for keeping financials and stats.

const levelup = require('levelup')
const leveldown = require('leveldown')
const sublevel = require('level-sublevel')
const mainDB = sublevel(levelup(leveldown('./datastore')))

const db = {
  status: mainDB.sub('status'),
  info: mainDB.sub('info'),
  origin2Transcoded: mainDB.sub('origin2Transcoded'),
  transcoded2Origin: mainDB.sub('transcoded2Origin'),
  owner2Videos: mainDB.sub('owner2videos'),
  pubKey2Videos: mainDB.sub('pubKey2Videos')
}

module.exports = db
