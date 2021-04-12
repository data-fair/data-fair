const crypto = require('crypto')
const express = require('express')
const ajv = require('ajv')()
const uuidv4 = require('uuid/v4')
const shortid = require('shortid')
const createError = require('http-errors')
const settingSchema = require('../../contract/settings')
const validate = ajv.compile(settingSchema)
const permissions = require('../utils/permissions')
const asyncWrap = require('../utils/async-wrap')
const cacheHeaders = require('../utils/cache-headers')
const topicsUtils = require('../utils/topics')

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

function isOwnerAdmin(req, res, next) {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode && permissions.getOwnerRole({ type: req.params.type, id: req.params.id }, req.user) !== 'admin') {
    return res.sendStatus(403)
  }
  next()
}

function isOwnerMember(req, res, next) {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode && !permissions.getOwnerRole({ type: req.params.type, id: req.params.id }, req.user)) {
    return res.sendStatus(403)
  }
  next()
}

// read settings as owner
router.get('/:type/:id', isOwnerAdmin, cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const settings = req.app.get('db').collection('settings')

  const result = await settings
    .findOne({ type: req.params.type, id: req.params.id }, { projection: { _id: 0, id: 0, type: 0 } })
  res.status(200).send(result || {})
}))

const fillSettings = (owner, user, settings) => {
  Object.assign(settings, owner)
  settings.name = owner.type === 'user' ? user.name : user.organizations.find(o => o.id === owner.id).name
  settings.apiKeys = settings.apiKeys || []
  settings.apiKeys.forEach(apiKey => delete apiKey.clearKey)
  settings.topics = settings.topics || []
  settings.publicationSites = settings.publicationSites || []
}

// update settings as owner
router.put('/:type/:id', isOwnerAdmin, asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  const owner = { type: req.params.type, id: req.params.id }
  fillSettings(owner, req.user, req.body)
  const valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)
  const settings = db.collection('settings')

  const fullApiKeys = req.body.apiKeys.map(apiKey => ({ ...apiKey }))
  req.body.apiKeys.forEach((apiKey, i) => {
    if (apiKey.adminMode && !req.user.adminMode) {
      throw createError(403, 'Only superadmin can manage api keys with adminMode=true')
    }
    if (!apiKey.id) apiKey.id = shortid.generate()

    if (!apiKey.key) {
      fullApiKeys[i].clearKey = uuidv4()
      const hash = crypto.createHash('sha512')
      hash.update(fullApiKeys[i].clearKey)
      fullApiKeys[i].key = apiKey.key = hash.digest('hex')
    }
  })

  req.body.topics.forEach((topic) => {
    if (!topic.id) topic.id = shortid.generate()
  })

  const oldSettings = (await settings.findOneAndReplace(owner, req.body, { upsert: true })).value

  await topicsUtils.updateTopics(db, owner, (oldSettings && oldSettings.topics) || [], req.body.topics)

  delete req.body.type
  delete req.body.id
  res.status(200).send({ ...req.body, apiKeys: fullApiKeys })
}))

// Get topics list as owner
router.get('/:type/:id/topics', isOwnerMember, asyncWrap(async(req, res) => {
  const settings = req.app.get('db').collection('settings')
  const result = await settings.findOne({
    type: req.params.type,
    id: req.params.id,
  })
  res.status(200).send((result && result.topics) || [])
}))

// Get publication sites as owner (see all) or other use (only private)
router.get('/:type/:id/publication-sites', isOwnerMember, asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  const owner = { type: req.params.type, id: req.params.id }
  const settings = await db.collection('settings').findOne(owner, { projection: { _id: 0 } })
  const publicationSites = (settings && settings.publicationSites) || []
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode && !permissions.getOwnerRole(owner, req.user)) {
    return res.status(200).send(publicationSites.filter(p => !p.private))
  }
  res.status(200).send(publicationSites)
}))
// create/update publication sites as owner (used by data-fair-portals to sync portals)
router.post('/:type/:id/publication-sites', isOwnerAdmin, asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  const owner = { type: req.params.type, id: req.params.id }
  let settings = await db.collection('settings').findOne(owner, { projection: { _id: 0 } })
  if (!settings) {
    settings = {}
    fillSettings(owner, req.user, settings)
  }
  settings.publicationSites = settings.publicationSites || []
  const index = settings.publicationSites.findIndex(ps => ps.type === req.body.type && ps.id === req.body.id)
  if (index === -1) {
    settings.publicationSites.push(req.body)
  } else {
    settings.publicationSites[index] = req.body
  }
  const valid = validate(settings)
  if (!valid) return res.status(400).send(validate.errors)
  await db.collection('settings').replaceOne(owner, settings, { upsert: true })
  res.status(200).send(req.body)
}))
// delete publication sites as owner (used by data-fair-portals to sync portals)
router.delete('/:type/:id/publication-sites/:siteType/:siteId', isOwnerAdmin, asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  const owner = { type: req.params.type, id: req.params.id }
  let settings = await db.collection('settings').findOne(owner, { projection: { _id: 0 } })
  if (!settings) {
    settings = {}
    fillSettings(owner, req.user, settings)
  }
  settings.publicationSites = settings.publicationSites || []
  settings.publicationSites = settings.publicationSites.filter(ps => ps.type !== req.params.siteType || ps.id !== req.params.siteId)
  const valid = validate(settings)
  if (!valid) return res.status(400).send(validate.errors)
  await db.collection('settings').replaceOne(owner, settings, { upsert: true })
  res.status(200).send(req.body)
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
