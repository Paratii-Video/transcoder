'use strict'
var express = require('express')
var router = express.Router()

module.exports = (node) => {
  router.get('/', (req, res, next) => {
    res.json({test: 1})
  })

  router.get('/stats', (req, res, next) => {
    // TODO
    res.json({Message: 'Not implemented yet', code: 0})
  })

  router.get('/job/:id', (req, res, next) => {
    res.json({Message: 'Not implemented yet', code: 0})
  })

  router.post('/transcode', (req, res, next) => {
    res.json({Message: 'Not implemented yet', code: 0})
  })

  node.api.use('/api/v1', router)
}
