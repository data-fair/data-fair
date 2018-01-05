const express = require('express')

const router = express.Router()

const apiDocs = require('../contract/api-docs')
const vocabulary = require('../contract/vocabulary')

const ajv = require('ajv')()
const openApiSchema = require('../contract/openapi-3.0.json')
const validateApi = ajv.compile(openApiSchema)
const normalise = require('ajv-error-messages')

router.get('/api-docs.json', (req, res) => {
  res.json(apiDocs)
})

router.get('/vocabulary', (req, res) => {
  res.json(vocabulary)
})

// Check an Api documentation format
router.post('/_check-api', async(req, res, next) => {
  var valid = validateApi(req.body)
  if (!valid) return res.status(400).send(normalise(validateApi.errors))
  res.sendStatus(200)
})

module.exports = router
