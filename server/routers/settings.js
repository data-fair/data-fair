const crypto = require('crypto')
const express = require('express')
const ajv = require('ajv')()
const { nanoid } = require('nanoid')
const createError = require('http-errors')
const settingSchema = require('../../contract/settings')
const permissions = require('../utils/permissions')
const asyncWrap = require('../utils/async-wrap')
const cacheHeaders = require('../utils/cache-headers')
const topicsUtils = require('../utils/topics')
const notifications = require('../utils/notifications')
const config = require('config')

const router = express.Router()

const allowedTypes = new Set(['user', 'organization'])

// only some settings are managed at the department levels
const departmentSettingsSchema = {
  ...settingSchema,
  properties: {
    id: settingSchema.properties.id,
    type: settingSchema.properties.id,
    name: settingSchema.properties.name,
    department: { type: 'string' },
    apiKeys: settingSchema.properties.apiKeys,
    publicationSites: settingSchema.properties.publicationSites,
    webhooks: settingSchema.properties.webhooks
  }
}
const validateSettings = ajv.compile(settingSchema)
const validateDepartmentSettings = ajv.compile(departmentSettingsSchema)

const validate = (settings) => {
  if (settings.department) {
    validateDepartmentSettings(settings)
    return validateDepartmentSettings.errors
  } else {
    validateSettings(settings)
    return validateSettings.errors
  }
}

// Middlewares
router.use('/:type/:id', (req, res, next) => {
  if (!allowedTypes.has(req.params.type)) {
    return res.status(400).send('Invalid type, it must be one of the following : ' + Array.from(allowedTypes).join(', '))
  }
  const [id, department] = req.params.id.split(':')
  req.owner = { type: req.params.type, id }
  if (department) req.owner.department = department
  next()
})

function isOwnerAdmin (req, res, next) {
  if (!req.user) return res.status(401).send()
  if (req.user.adminMode) return next()
  if (permissions.getOwnerRole(req.owner, req.user) !== 'admin') {
    return res.sendStatus(403)
  }
  next()
}

function isOwnerMember (req, res, next) {
  if (!req.user) return res.status(401).send()
  if (req.user.adminMode) return next()
  if (req.user.activeAccount.type !== req.owner.type || req.user.activeAccount.id !== req.owner.id) {
    return res.sendStatus(403)
  }
  next()
}

// read settings as owner
router.get('/:type/:id', isOwnerAdmin, cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const settings = req.app.get('db').collection('settings')
  const result = await settings
    .findOne(req.owner, { projection: { _id: 0, id: 0, type: 0 } })
  res.status(200).send(result || {})
}))

const fillSettings = (owner, user, settings) => {
  Object.assign(settings, owner)
  if (owner.type === 'user') settings.name = user.name
  else {
    const org = user.organizations.find(o => o.id === owner.id)
    settings.name = org.name
    if (owner.department) settings.name += ' - ' + owner.department
  }
  settings.apiKeys = settings.apiKeys || []
  settings.apiKeys.forEach(apiKey => delete apiKey.clearKey)
  settings.publicationSites = settings.publicationSites || []
}

// update settings as owner
router.put('/:type/:id', isOwnerAdmin, asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  fillSettings(req.owner, req.user, req.body)
  const errors = validate(req.body)
  if (errors) return res.status(400).send(errors)
  const settings = db.collection('settings')

  const fullApiKeys = req.body.apiKeys.map(apiKey => ({ ...apiKey }))
  req.body.apiKeys.forEach((apiKey, i) => {
    if (apiKey.adminMode && !req.user.adminMode) {
      throw createError(403, 'Only superadmin can manage api keys with adminMode=true')
    }
    if (!apiKey.id) apiKey.id = nanoid()

    if (!apiKey.key) {
      const clearKeyParts = [req.owner.type.slice(0, 1), req.owner.id]
      if (req.owner.department) clearKeyParts.push(req.owner.department)
      clearKeyParts.push(nanoid())
      fullApiKeys[i].clearKey = Buffer.from(clearKeyParts.join(':')).toString('base64url')
      const hash = crypto.createHash('sha512')
      hash.update(fullApiKeys[i].clearKey)
      fullApiKeys[i].key = apiKey.key = hash.digest('hex')
    }
  })

  if (req.body.topics) {
    req.body.topics.forEach((topic) => {
      if (!topic.id) topic.id = nanoid()
    })
  }

  const oldSettings = (await settings.findOneAndReplace(req.owner, req.body, { upsert: true })).value

  if (req.body.topics) {
    await topicsUtils.updateTopics(db, req.owner, (oldSettings && oldSettings.topics) || [], req.body.topics)
  }

  delete req.body.type
  delete req.body.id
  res.status(200).send({ ...req.body, apiKeys: fullApiKeys })
}))

// Get topics list as owner
router.get('/:type/:id/topics', isOwnerMember, asyncWrap(async (req, res) => {
  const settings = req.app.get('db').collection('settings')
  const result = await settings.findOne({ type: req.params.type, id: req.params.id })
  res.status(200).send((result && result.topics) || [])
}))

// Get licenses list as anyone
router.get('/:type/:id/licenses', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const settings = req.app.get('db').collection('settings')
  const result = await settings.findOne({ type: req.params.type, id: req.params.id })
  res.status(200).send([].concat(config.licenses, (result && result.licenses) || []))
}))

// Get publication sites as owner (see all) or other use (only public)
router.get('/:type/:id/publication-sites', isOwnerMember, asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  const settings = await db.collection('settings').findOne(req.owner, { projection: { _id: 0 } })
  let publicationSites = (settings && settings.publicationSites) || []
  if (req.owner.department) {
    for (const publicationSite of publicationSites) publicationSite.department = req.owner.department
    const orgSettings = await db.collection('settings').findOne({ type: req.owner.type, id: req.owner.id }, { projection: { _id: 0 } })
    publicationSites = publicationSites.concat((orgSettings && orgSettings.publicationSites) || [])
  }
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode && !permissions.getOwnerRole(req.owner, req.user)) {
    return res.status(200).send(publicationSites.filter(p => !p.private))
  }
  res.status(200).send(publicationSites)
}))
// create/update publication sites as owner (used by data-fair-portals to sync portals)
router.post('/:type/:id/publication-sites', isOwnerAdmin, asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  let settings = await db.collection('settings').findOne(req.owner, { projection: { _id: 0 } })
  if (!settings) {
    settings = {}
    fillSettings(req.owner, req.user, settings)
  }
  settings.publicationSites = settings.publicationSites || []
  const index = settings.publicationSites.findIndex(ps => ps.type === req.body.type && ps.id === req.body.id)
  if (index === -1) {
    settings.publicationSites.push(req.body)
    const baseSubscription = {
      outputs: ['devices', 'email'],
      locale: 'fr',
      sender: req.owner,
      visibility: 'private'
    }
    notifications.subscribe(req, {
      ...baseSubscription,
      topic: { key: `data-fair:dataset-publication-requested:${req.body.type}:${req.body.id}` },
      urlTemplate: config.publicUrl + '/dataset/{id}'
    })
    notifications.subscribe(req, {
      ...baseSubscription,
      topic: { key: `data-fair:app-publication-requested:${req.body.type}:${req.body.id}` },
      urlTemplate: config.publicUrl + '/application/{id}'
    })
  } else {
    settings.publicationSites[index] = req.body
  }
  const errors = validate(settings)
  if (errors) return res.status(400).send(errors)
  await db.collection('settings').replaceOne(req.owner, settings, { upsert: true })
  res.status(200).send(req.body)
}))
// delete publication sites as owner (used by data-fair-portals to sync portals)
router.delete('/:type/:id/publication-sites/:siteType/:siteId', isOwnerAdmin, asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  const [id, department] = req.params.id.split(':')
  const owner = { type: req.params.type, id, department }
  let settings = await db.collection('settings').findOne(owner, { projection: { _id: 0 } })
  if (!settings) {
    settings = {}
    fillSettings(owner, req.user, settings)
  }
  settings.publicationSites = settings.publicationSites || []
  settings.publicationSites = settings.publicationSites.filter(ps => ps.type !== req.params.siteType || ps.id !== req.params.siteId)
  const errors = validate(req.body)
  if (errors) return res.status(400).send(errors)
  await db.collection('settings').replaceOne(owner, settings, { upsert: true })
  const ref = `${req.params.siteType}:${req.params.siteId}`
  await db.collection('datasets').updateMany({ publicationSites: ref }, { $pull: { publicationSites: ref } })
  await db.collection('applications').updateMany({ publicationSites: ref }, { $pull: { publicationSites: ref } })
  res.status(200).send(req.body)
}))

module.exports = router
