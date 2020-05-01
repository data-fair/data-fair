const crypto = require('crypto')
const express = require('express')
const ajv = require('ajv')()
const uuidv4 = require('uuid/v4')
const createError = require('http-errors')
const settingSchema = require('../../contract/settings.json')
const validate = ajv.compile(settingSchema)
const permissions = require('../utils/permissions')
const asyncWrap = require('../utils/async-wrap')
const cacheHeaders = require('../utils/cache-headers')

const config = require('config')

const router = express.Router()

const allowedTypes = new Set(['user', 'organization'])

// Middlewares
router.use('/:type/:id', (req, res, next) => {
  if (!allowedTypes.has(req.params.type)) {
    return res.status(400).send('Invalid type, it must be one of the following : ' + Array.from(allowedTypes).join(', '))
  }
  next()
})

function isOwner(req, res, next) {
  if (!req.user) return res.status(401).send()
  if (!permissions.isOwner({ type: req.params.type, id: req.params.id, role: config.adminRole }, req.user)) {
    return res.sendStatus(403)
  }
  next()
}

// read settings as owner
router.get('/:type/:id', isOwner, cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const settings = req.app.get('db').collection('settings')

  const result = await settings
    .findOne({ type: req.params.type, id: req.params.id }, { projection: { _id: 0, id: 0, type: 0 } })
  res.status(200).send(result || {})
}))

// update settings as owner
router.put('/:type/:id', isOwner, asyncWrap(async(req, res) => {
  req.body.type = req.params.type
  req.body.id = req.params.id
  req.body.name = req.params.type === 'user' ? req.user.name : req.user.organizations.find(o => o.id === req.params.id).name
  req.body.apiKeys = req.body.apiKeys || []
  req.body.apiKeys.forEach(apiKey => delete apiKey.clearKey)
  const valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)
  const settings = req.app.get('db').collection('settings')

  const fullApiKeys = req.body.apiKeys.map(apiKey => ({ ...apiKey }))
  req.body.apiKeys.forEach((apiKey, i) => {
    if (apiKey.adminMode && !req.user.adminMode) {
      throw createError(403, 'Only superadmin can manage api keys with adminMode=true')
    }
    if (!apiKey.key) {
      fullApiKeys[i].clearKey = uuidv4()
      const hash = crypto.createHash('sha512')
      hash.update(fullApiKeys[i].clearKey)
      fullApiKeys[i].key = apiKey.key = hash.digest('hex')
    }
  })

  await settings.replaceOne({
    type: req.params.type,
    id: req.params.id,
  }, req.body, { upsert: true })
  delete req.body.type
  delete req.body.id
  res.status(200).send({ ...req.body, apiKeys: fullApiKeys })
}))

// Get licenses list as anyone
router.get('/:type/:id/licenses', cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const settings = req.app.get('db').collection('settings')
  const result = await settings.findOne({
    type: req.params.type,
    id: req.params.id,
  })
  res.status(200).send([].concat(config.licenses, (result && result.licenses) || []))
}))

module.exports = router
