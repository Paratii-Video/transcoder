'use strict'
var express = require('express')
var router = express.Router()

module.exports = (node) => {
  router.get('/', (req, res, next) => {
    res.json({test: 1})
  })

  router.get('/stats', (req, res, next) => {
    // TODO
    // res.json({Message: 'Not implemented yet', code: 0})
    res.json(node.pipeline.stats())
  })

  router.get('/status/:hash', (req, res, next) => {
    node.db.getStatus(req.params.hash, (err, status) => {
      if (err) {
        return res.json(err)
      }

      return res.json({hash: req.params.hash, status: status})
    })
  })

  router.get('/job/:id', (req, res, next) => {
    // res.json({Message: 'Not implemented yet', code: 0})
    node.db.getInfo(req.params.id, (err, info) => {
      if (err) {
        return res.json(err)
      }

      return res.json(info)
    })
  })

  router.post('/transcode', (req, res, next) => {
    res.json({Message: 'Not implemented yet', code: 0})
  })

  node.api.use('/api/v1', router)
}
