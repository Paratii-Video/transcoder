/**
 * @module pipeline - Transcoding pipeline
 */
'use strict'

const os = require('os')
// const path = require('path')
const { priorityQueue } = require('async')
const { EventEmitter } = require('events')
const dopts = require('default-options')

/**
 * The main class for the transcoding pipeline.
 * @extends EventEmitter
 */
class Pipeline extends EventEmitter {
  constructor (opts) {
    super()

    if (!opts || !opts.ipfs) {
      throw new Error('[Pipeline] ipfs is required.')
    }

    if (!opts || !opts.db) {
      throw new Error('[Pipeline] db is required.')
    }

    let defaults = {
      concurrency: os.cpus().length
    }

    this._options = dopts(opts, defaults, {allowUnknown: true})
    this._queue = priorityQueue(this._processJob, this._options.concurrency)
  }

  /**
   * processes a video by transcoding it to multiple bitrates in HLS
   * @name  _processJob
   * @param  {Object}   job      the job info. TODO: define spec.
   * @param  {Function} callback returns transcoder result, trigger next job
   */
  _processJob (job, callback) {

    // Logic:
    // 1. check if the <Hash> is already been transcoded or being transcoded.
    // 2. Trigger Transcoder.
    // 3. once it's done. notify client / update status DB.
  }

  _calculatePriority (job, callback) {
    // TODO calculate priority
  }

  push (job, priority, callback) {
    if (!job) {
      return callback(new Error('[pipeline] job is required job: ' + job))
    }
  }
}

module.exports = Pipeline
