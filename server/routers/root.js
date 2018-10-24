const express = require('express')

const status = require('../routers/status')
const apiDocs = require('../../contract/api-docs')
const vocabulary = require('../../contract/vocabulary')

const ajv = require('ajv')()
const openApiSchema = require('../../contract/openapi-3.0.json')
const validateApi = ajv.compile(openApiSchema)
const config = require('config')

const router = express.Router()

const remoteServices = config.remoteServices.map(s => ({ ...s }))

router.get('/status', status.status)
router.get('/ping', status.ping)

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

router.get('/configurable-catalogs', (req, res) => {
  res.json(config.catalogs)
})

module.exports = router
