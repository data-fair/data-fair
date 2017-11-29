const express = require('express')

const router = express.Router()

const apiDocs = require('../contract/api-docs')
const terms = require('../contract/terms')

router.get('/api-docs.json', (req, res) => {
  res.json(apiDocs)
})

router.get('/terms', (req, res) => {
  res.json(terms)
})

module.exports = router
