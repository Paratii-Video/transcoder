/**
 * @module pipeline - Transcoding pipeline
 */
'use strict'

const os = require('os')
// const path = require('path')
const { priorityQueue } = require('async')
const { EventEmitter } = require('events')
const dopts = require('default-options')
const db = require('../db')

/**
 * The main class for the transcoding pipeline.
 * @extends EventEmitter
 */
class Pipeline extends EventEmitter {
  constructor (opts) {
    super()

    // if (!opts || !opts.ipfs) {
    //   throw new Error('[Pipeline] ipfs is required.')
    // }

    let defaults = {
      concurrency: os.cpus().length
    }

    this._options = dopts(opts, defaults, {allowUnknown: true})
    this._queue = priorityQueue(this._processJob.bind(this), this._options.concurrency)
  }

  /**
   * processes a video by transcoding it to multiple bitrates in HLS
   * @name  _processJob
   * @param  {Object}   job      the job info. TODO: define spec.
   * @param  {Function} callback returns transcoder result, trigger next job
   */
  _processJob (job, callback) {
    // FOR TESTING ONLY
    // 1. update status to 'in-progress'
    // 2. run it.
    db.updateStatus(job.hash, 'in-progress')
    this.emit('job:status', job, 'in-progress')
    setTimeout(() => {
      return callback(null, 1)
    }, 2000)
    // --------------------------
  }

  _calculatePriority (job, callback) {
    // TODO calculate priority
  }

  push (job, callback) {
    if (!job) {
      return callback(new Error('[pipeline] job is required job: ' + job))
    }

    // Logic:
    // 1. check if the <Hash> is already been transcoded or being transcoded.
    // 2. Trigger Transcoder.
    // 3. once it's done. notify client / update status DB.
    db.getStatus(job.hash, (err, status) => {
      if (err) {
        if (err.type === 'NotFoundError') {
          // video is fresh. go for it.
          // 1. add it to status as queued
          // 2. push it to queue
          db.updateStatus(job.hash, 'queued')
          this.emit('job:status', job, 'queued')
          this._queue.push(job, job.priority || 0, (err, result) => {
            if (err) {
              return callback(err)
            }
            // TODO. now the job is done. update status in DB
            if (result) {
              db.updateStatus(job.hash, 'finished')
              this.emit('job:status', job, 'finished')
              return callback(null, 'done')
            }
          })
        } else {
          return callback(err)
        }
      }

      if (status) {
        // video is already in DB.
        // TODO : handle this gracefully
        switch (status) {
          case 'queued':
            console.log(`Job ${job.hash} is already queued.`)
            break
          case 'in-progress':
            console.log(`Job ${job.hash} is currently in progress.`)
            break
          default:
            return callback(new Error('video status is unkown : ' + status))
        }
        return callback(null, status)
      }
    })
  }
}

module.exports = Pipeline
