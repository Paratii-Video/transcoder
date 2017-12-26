/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const assert = chai.assert
// const expect = chai.expect
chai.use(dirtyChai)
const { each, setImmediate } = require('async')

const Pipeline = require('../src/pipeline')

describe('# Pipeline Spec', function () {
  // this.timeout(12000)

  let pipeline
  before((done) => {
    pipeline = new Pipeline({})
    pipeline.on('job:status', (job, status) => {
      console.log(`Job ${job.hash} : ${status}`)
    })
    done()
  })

  it('run a single job, get done back', (done) => {
    pipeline.push({hash: String(Math.random() * 100), priority: 1}, (err, status) => {
      if (err) {
        return done(err)
      }

      assert.equal(status, 'done')
      return done()
    })
    // console.log('pipeline waiting list length: ', pipeline._queue.length())
  }).timeout(20000)

  it('run multiple jobs, remove one from queue', (done) => {
    let jobs = [
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.floor(Math.random() * 1000)), priority: 1},
      {hash: String(Math.random() * 100), priority: 1}
    ]

    each(jobs, pipeline.push.bind(pipeline), (err) => {
      if (err) return done(err)
      // done()
    })

    pipeline.once('drained', () => {
      console.log('all jobs are done')
      done()
    })

    setImmediate(() => {
      console.log('pipeline waiting list length: ', pipeline._queue.length())
      setTimeout(() => {
        console.log('removing job #', jobs[7].hash)
        pipeline._queue.remove((task, priority) => { return (task.data.hash === jobs[7].hash) })
      }, 1000)
    })
  }).timeout(25000)
})
