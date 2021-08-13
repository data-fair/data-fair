const express = require('express')

const status = require('../routers/status')
const apiDocs = require('../../contract/api-docs')
const vocabulary = require('../../contract/vocabulary')
const projections = require('../../contract/projections')
const asyncWrap = require('../utils/async-wrap')

const ajv = require('ajv')()
const openApiSchema = require('../../contract/openapi-3.1.json')
const validateApi = ajv.compile(openApiSchema)
const config = require('config')

const router = express.Router()

const remoteServices = config.remoteServices.map(s => ({ ...s }))

router.get('/status', status.status)
router.get('/ping', status.ping)

router.get('/api-docs.json', (req, res) => {
  res.json(apiDocs)
})

router.get('/vocabulary', asyncWrap(async (req, res) => {
  let privateVocabulary = []
  if (req.user && req.user.activeAccount) {
    const settings = await req.app.get('db').collection('settings')
      .findOne({ type: req.user.activeAccount.type, id: req.user.activeAccount.id }, { projection: { _id: 0, id: 0, type: 0 } })
    privateVocabulary = settings.privateVocabulary || []
  }

  res.json(vocabulary.concat(privateVocabulary.map(pv => ({ ...pv, private: true }))))
}))

router.get('/projections', (req, res) => {
  res.json(projections.map(p => ({ title: p.title, code: p.code })))
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
