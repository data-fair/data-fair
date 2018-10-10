const express = require('express')

const asyncWrap = require('../utils/async-wrap')
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

// Used by the users' directory to notify name updates
router.post('/owner-names', asyncWrap(async (req, res) => {
  const key = req.query.key
  const owner = req.body
  if (!config.secretKeys.ownerNames || config.secretKeys.ownerNames !== key) {
    return res.status(403).send('Bad secret in "key" parameter')
  }
  const collectionNames = ['remote-services', 'applications', 'datasets']
  for (let c of collectionNames) {
    const collection = req.app.get('db').collection(c)

    // owners
    await collection.updateMany({ 'owner.type': owner.type, 'owner.id': owner.id }, { $set: { 'owner.name': owner.name } })

    // permissions
    const cursor = collection.find({ permissions: { $elemMatch: { type: owner.type, id: owner.id } } })
    while (await cursor.hasNext()) {
      const doc = await cursor.next()
      doc.permissions
        .filter(permission => permission.type === owner.type && permission.id === owner.id)
        .forEach(permission => {
          permission.name = owner.name
        })
      await collection.updateOne({ id: doc.id }, { $set: { permissions: doc.permissions } })
    }

    // created/updated events
    if (owner.type === 'user') {
      await collection.updateMany({ 'createdBy': owner.id }, { $set: { 'createdBy': { id: owner.id, name: owner.name } } })
      await collection.updateMany({ 'createdBy.id': owner.id }, { $set: { 'createdBy': { id: owner.id, name: owner.name } } })
      await collection.updateMany({ 'updatedBy': owner.id }, { $set: { 'updatedBy': { id: owner.id, name: owner.name } } })
      await collection.updateMany({ 'updatedBy.id': owner.id }, { $set: { 'updatedBy': { id: owner.id, name: owner.name } } })
    }
  }
  res.send()
}))

module.exports = router
