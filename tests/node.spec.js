/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const assert = chai.assert
const expect = chai.expect
chai.use(dirtyChai)
// const { each, setImmediate } = require('async')
const request = require('request')
const Node = require('../src/node')

describe('# Publisher Node', function () {
  let node
  before((done) => {
    node = new Node({})
    assert.isOk(node)
    node.on('ready', () => {
      done()
    })
  })

  it('pipeline should be available', (done) => {
    assert.isOk(node.pipeline)
    assert.isOk(node.pipeline.push)
    done()
  })

  it('PIPFS should be available', (done) => {
    assert.isOk(node.ipfs)
    assert.isOk(node.ipfs.ipfs)
    done()
  })

  it('API should be listening on 3000', (done) => {
    request('http://localhost:3000/api/v1', {json: true}, (err, resp, body) => {
      if (err) return done(err)
      assert.isOk(resp)
      expect(resp.statusCode).to.equal(200)
      expect(body.test).to.exist()
      expect(body.test).to.equal(1)
      done()
    })
  })

  it('IPFS gateway should be up and listening on 9090', (done) => {
    request('http://localhost:9090/ipfs/bad_hash', {json: true}, (err, resp, body) => {
      if (err) return done(err)
      assert.isOk(resp)
      expect(resp.statusCode).to.equal(400)
      expect(body.Message).to.exist()
      expect(body.code).to.exist()
      expect(body.code).to.equal(0)
      done()
    })
  })

  after((done) => {
    node.stop(() => {
      done()
    })
  })
})
