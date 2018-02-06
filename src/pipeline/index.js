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
const Job = require('../ffmpeg/job')
const noop = function () { }
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
    this._queue.drain = this._drained.bind(this)

    this.pipfs = this._options.pipfs
    this._jobs = {}
    this._lastUpdate = {}

    this.pipfs.on('progress', (hash, chunkSize) => {
      if (this._jobs[hash] && this._jobs[hash].peerId && ((new Date() - this._lastUpdate[hash]) / 1000 > 5)) {
        // TODO calculate percent. send it to the client. store it here if
        // client isn't available
        let msg = this._jobs[hash].pipfs.protocol.createCommand('uploader:progress',
          { hash: hash,
            author: this._jobs[hash].peerId.id,
            chunkSize: chunkSize,
            percent: (chunkSize / this._jobs[hash].size) * 100
          })
        this._jobs[hash].pipfs.protocol.network.sendMessage(this._jobs[hash].peerId, msg, (err) => {
          if (err) return console.log('err: ', err)
          console.log('paratii protocol msg sent: ', hash)
        })

        this._lastUpdate[hash] = new Date()
      }
    })
  }

  /**
   * callback when the queue has finished all the tasks.
   * @return {event} returns event drained for now.
   */
  _drained () {
    this.emit('drained')
  }

  /**
   * processes a video by transcoding it to multiple bitrates in HLS
   * @name  _processJob
   * @param  {Object}   job      the job info. TODO: define spec.
   * @param  {Function} callback returns transcoder result, trigger next job
   */
  _processJob (job, callback) {
    // 1. update status to 'in-progress'
    // 2. run it.
    db.updateStatus(job.hash, 'in-progress')
    this.emit('job:status', job, 'in-progress')
    // -------------------------------------------------------------------------
    // FOR TESTING ONLY
    // setTimeout(() => {
    //   return callback(null, 1)
    // }, 2000)
    // -------------------------------------------------------------------------
    this._jobs[job.hash] = new Job(job)

    // paratii-protocol signal to client that job started.
    if (this._jobs[job.hash].peerId) {
      let msg = this._jobs[job.hash].pipfs.protocol.createCommand('transcoding:started',
        { hash: this.hash,
          author: this._jobs[job.hash].peerId.id
        })
      this._jobs[job.hash].pipfs.protocol.network.sendMessage(this._jobs[job.hash].peerId, msg, (err) => {
        if (err) return console.log('err: ', err)
        console.log('paratii protocol msg sent: ', job.hash)
      })
      this._lastUpdate[job.hash] = new Date()
    }

    this._jobs[job.hash].on('error', (err, hash) => {
      if (err) {
        if (this._jobs[job.hash].peerId) {
          let msg = this._jobs[job.hash].pipfs.protocol.createCommand('transcoding:error',
            { hash: hash,
              author: this._jobs[job.hash].peerId.id,
              err: JSON.stringify(err)
            })
          this._jobs[job.hash].pipfs.protocol.network.sendMessage(this._jobs[job.hash].peerId, msg, (err) => {
            if (err) return console.log('err: ', err)
            console.log('paratii protocol msg sent: ', job.hash)
          })
        }

        // remove it from in-progress
        db.removeStatus(job.hash, (e) => {
          if (e) {
            console.log('DB removeStatus Error: ', e)
          }
        })
        console.log('JOB ERROR ', err)
      }
    })

    // paratii-protocol signal to client that downsample is ready.
    this._jobs[job.hash].on('downsample:ready', (hash, size) => {
      if (this._jobs[job.hash].peerId) {
        let msg = this._jobs[job.hash].pipfs.protocol.createCommand('transcoding:downsample:ready',
          { hash: hash,
            author: this._jobs[job.hash].peerId.id,
            size: size
          })
        this._jobs[job.hash].pipfs.protocol.network.sendMessage(this._jobs[job.hash].peerId, msg, (err) => {
          if (err) return console.log('err: ', err)
          console.log('paratii protocol msg sent: ', job.hash)
        })
      }
    })

    // paratii-protocol signal to client the progress of a job.
    this._jobs[job.hash].on('progress', (hash, size, percent) => {
      if (this._jobs[job.hash].peerId && ((new Date() - this._lastUpdate[job.hash]) / 1000 > 5)) {
        let msg = this._jobs[job.hash].pipfs.protocol.createCommand('transcoding:progress',
          { hash: hash,
            author: this._jobs[job.hash].peerId.id,
            size: size,
            percent: percent
          })
        this._jobs[job.hash].pipfs.protocol.network.sendMessage(this._jobs[job.hash].peerId, msg, (err) => {
          if (err) return console.log('err: ', err)
          console.log('paratii protocol msg sent: ', job.hash)
        })

        this._lastUpdate[job.hash] = new Date()
      }
    })

    this._jobs[job.hash].start((err, jobResult) => {
      if (err) return console.log('err: ', err)
      // update job status.
      console.log('JOB IS OVER, RESULT: ', jobResult)
      // signal paratii-protocol to client that job is done.
      if (this._jobs[job.hash].peerId) {
        let msg = this._jobs[job.hash].pipfs.protocol.createCommand('transcoding:done',
          { hash: job.hash,
            author: this._jobs[job.hash].peerId.id,
            result: JSON.stringify(jobResult)
          })
        this._jobs[job.hash].pipfs.protocol.network.sendMessage(this._jobs[job.hash].peerId, msg, (err) => {
          if (err) return console.log('err: ', err)
          console.log('paratii protocol msg sent: ', job.hash)
        })

        // FOR TESTING
        // delete the file if it's used for testing.
        // QmTkuJTcQhtQm8bPzF1hQmhrDPsdLs28soUZQEUx7t9pBJ
        if (job.hash === 'QmTkuJTcQhtQm8bPzF1hQmhrDPsdLs28soUZQEUx7t9pBJ') {
          db.removeStatus(job.hash, (e) => {
            if (e) {
              console.log('DB removeStatus Error: ', e)
            }
          })
        }
      }
      callback(null, 1)
    })
  }

  /**
   * calculate job priority based on fee paid
   * @param  {Object}   job      job object.
   * @param  {Function} callback (err, priority)
   * @return {number}            returns priority
   */
  _calculatePriority (job, callback) {
    // TODO calculate priority
  }

  /**
   * adds a job the the pipeline queue
   * @param  {Object}   job      Job Object info.
   * @param  {Function} callback (err, status) callback
   * @return {Object}            returns a status object once the job is complete.
   */
  push (job, callback) {
    if (!job) {
      return callback(new Error('[pipeline] job is required job: ' + job))
    }

    callback = callback || noop

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
          job.pipfs = this.pipfs
          // grab file first from IPFS
          // this is useful so we can let the client close his/her window without
          // having to wait for ffmpeg.
          this.pipfs.grabFile(job.hash, (err) => {
            if (err) {
              console.error('grabfile ERROR : ', err)
            } else {
              // TODO
              // send user notification that he/she can close that window.
              console.log('file %s grabbed successfully', job.hash)
            }
          })

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
            // Check if it's actually being processed or not.
            // This happens if the transcoder crashes mid-job.
            let pipelineStats = this.stats()
            let actuallyRunning = pipelineStats.ongoing.filter((task) => { return (task.hash === job.hash) })
            if (actuallyRunning.length > 0) {
              console.log(`Job ${job.hash} is currently in progress.`)
            } else {
              // job isn't running.
              // remove it from the datastore and call this function again.
              db.removeStatus(job.hash, (err) => {
                if (err) {
                  return callback(err)
                }

                this.push(job, callback)
              })
            }
            break
          case 'finished':
            console.log(`Job ${job.hash} is already finished.`)
            db.getInfo(job.hash, (err, result) => {
              if (err) {
                if (err.type === 'NotFoundError') {
                  // how can status equal finished but no metadata available.
                  console.log('ERROR NOT FOUND::: ', err)
                }
              } else {
                // TODO
                // Send msg to client with metadata.
                // remove this job from queue.
                // signal paratii-protocol to client that job is done.
                if (job.peerId) {
                  let msg = this.pipfs.protocol.createCommand('transcoding:done',
                    { hash: job.hash,
                      author: job.peerId.id,
                      result: JSON.stringify(result.result)
                    })
                  this.pipfs.protocol.network.sendMessage(job.peerId, msg, (err) => {
                    if (err) return console.log('err: ', err)
                    console.log('paratii protocol msg sent: ', job.hash)
                  })
                }
              }
            })
            break
          default:
            console.log(`Job ${job.hash} is unknown ${status}`)
            // return callback(new Error('video status is unknown : ' + status))
        }
        return callback(null, status)
      }
    })
  }

  /**
   * get queue stats
   * @return {Object} returns number of stats from the queue.
   */
  stats () {
    return {
      running: this._queue.started,
      queued: this._queue.length(),
      inprogress: this._queue.running(),
      concurrency: this._queue.concurrency,
      workersList: this._queue.workersList(),
      ongoing: this._queue.workersList().map((task) => { return task.data })
    }
  }
}

module.exports = Pipeline
