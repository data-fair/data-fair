const express = require('express')

const router = express.Router()

const apiDocs = require('../contract/api-docs')

router.get('/api-docs.json', (req, res) => {
  res.json(apiDocs)
})

module.exports = router
