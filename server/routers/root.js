const express = require('express')
const marked = require('marked')

const asyncWrap = require('../utils/async-wrap')
const status = require('../routers/status')
const apiDocs = require('../../contract/api-docs')
const vocabulary = require('../../contract/vocabulary')

const ajv = require('ajv')()
const openApiSchema = require('../../contract/openapi-3.0.json')
const validateApi = ajv.compile(openApiSchema)
const config = require('config')

const router = express.Router()

const remoteServices = config.remoteServices.map(s => ({...s, description: marked(s.description)}))

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

router.get('/configurable-applications', (req, res) => {
  res.json(config.applications)
})

// Used by the users' directory to notify name updates
router.post('/owner-names', asyncWrap(async (req, res) => {
  const key = req.query.key
  if (!config.secretKeys.ownerNames || config.secretKeys.ownerNames !== key) {
    return res.status(403).send('Bad secret in "key" parameter')
  }
  const collectionNames = ['remote-services', 'applications', 'datasets']
  for (let c of collectionNames) {
    const collection = req.app.get('db').collection(c)
    for (let owner of req.body) {
      await collection.updateMany({'owner.type': owner.type, 'owner.id': owner.id}, {$set: {'owner.name': owner.name}})
    }
  }
  res.send()
}))

module.exports = router
