const express = require('express')
const marked = require('marked')

const router = express.Router()

const apiDocs = require('../../contract/api-docs')
const vocabulary = require('../../contract/vocabulary')

const ajv = require('ajv')()
const openApiSchema = require('../../contract/openapi-3.0.json')
const validateApi = ajv.compile(openApiSchema)
const config = require('config')

const remoteServices = config.remoteServices.map(s => ({...s, description: marked(s.description)}))

router.get('/api-docs.json', (req, res) => {
  res.json(apiDocs)
})

router.get('/vocabulary', (req, res) => {
  res.json(vocabulary)
})

// Check an Api documentation format
router.post('/_check-api', (req, res, next) => {
  var valid = validateApi(req.body)
  if (!valid) return res.status(400).send(validateApi.errors)
  res.sendStatus(200)
})

router.get('/configurable-remote-services', (req, res) => {
  res.json(remoteServices)
})

router.get('/configurable-applications', (req, res) => {
  res.json(config.applications)
})

module.exports = router
