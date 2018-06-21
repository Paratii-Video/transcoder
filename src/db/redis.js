'use strict'

/**
 * redis backend for data + stats.
 */
const redis = require('redis')

const db = {
  status: redis.createClient({prefix: 'status'}),
  progress: redis.createClient({prefix: 'progress'}),
  info: redis.createClient({prefix: 'info'}),
  origin2Transcoded: redis.createClient({prefix: 'origin2Transcoded'}),
  transcoded2Origin: redis.createClient({prefix: 'transcoded2Origin'}),
  idIndex: redis.createClient({prefix: 'idIndex'}),
  owner2Videos: redis.createClient({prefix: 'owner2videos'}),
  pubKey2Videos: redis.createClient({prefix: 'pubKey2Videos'})
}

module.exports = db
