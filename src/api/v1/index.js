'use strict'
var express = require('express')
var router = express.Router()

module.exports = (node) => {
  router.get('/', (req, res, next) => {
    res.json({test: 1})
  })

  router.get('/stats', (req, res, next) => {
    // TODO
  })

  router.get('/job/:id', (req, res, next) => {

  })

  router.post('/transcode', (req, res, next) => {

  })

  node.api.use('/api/v1', router)
}
