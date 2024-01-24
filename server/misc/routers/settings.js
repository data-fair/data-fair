const crypto = require('crypto')
const express = require('express')
const ajv = require('../utils/ajv')
const { nanoid } = require('nanoid')
const slug = require('slugify')
const createError = require('http-errors')
const settingSchema = require('../../../contract/settings')
const permissions = require('../utils/permissions')
const asyncWrap = require('../utils/async-wrap')
const cacheHeaders = require('../utils/cache-headers')
const topicsUtils = require('../utils/topics')
const notifications = require('../utils/notifications')
const config = require('config')
const debugPublicationSites = require('debug')('publication-sites')

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
  } else {
    validateSettings(settings)
  }
}

// Middlewares
router.use('/:type/:id', (req, res, next) => {
  if (!allowedTypes.has(req.params.type)) {
    return res.status(400).type('text/plain').send('Invalid type, it must be one of the following : ' + Array.from(allowedTypes).join(', '))
  }
  const [id, department] = req.params.id.split(':')
  req.owner = { type: req.params.type, id }
  if (department) {
    req.department = department
    if (department !== '*') req.owner.department = department
  }
  req.ownerFilter = { ...req.owner }
  if (!department) req.ownerFilter.department = { $exists: false }
  next()
})

function isOwnerAdmin (req, res, next) {
  if (!req.user) return res.status(401).type('text/plain').send()
  if (req.user.adminMode) return next()
  if (permissions.getOwnerRole(req.owner, req.user) !== 'admin') {
    return res.sendStatus(403)
  }
  next()
}

function isOwnerMember (req, res, next) {
  if (!req.user) return res.status(401).type('text/plain').send()
  if (req.user.adminMode) return next()
  // do not check belonging to department, some settings are shared from top org to its departments
  if (!permissions.getOwnerRole(req.owner, req.user, true)) {
    return res.sendStatus(403)
  }
  next()
}

// read settings as owner
router.get('/:type/:id', isOwnerAdmin, cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const settings = req.app.get('db').collection('settings')
  const result = await settings
    .findOne(req.ownerFilter, { projection: { _id: 0, id: 0, type: 0 } })
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
  for (const apiKey of settings.apiKeys) {
    delete apiKey.clearKey
  }
  settings.publicationSites = settings.publicationSites || []
  delete settings.operationsPermissions // deprecated
}

// update settings as owner
router.put('/:type/:id', isOwnerAdmin, asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  fillSettings(req.owner, req.user, req.body)
  validate(req.body)
  const settings = db.collection('settings')

  const fullApiKeys = req.body.apiKeys.map(apiKey => ({ ...apiKey }))
  for (let i = 0; i < req.body.apiKeys.length; i++) {
    const apiKey = req.body.apiKeys[i]
    if (apiKey.adminMode && !req.user.adminMode) {
      throw createError(403, 'Only superadmin can manage api keys with adminMode=true')
    }
    if (!apiKey.id) fullApiKeys[i].id = apiKey.id = nanoid()

    if (!apiKey.key) {
      const clearKeyParts = [req.owner.type.slice(0, 1), req.owner.id]
      if (req.owner.department) clearKeyParts.push(req.owner.department)
      clearKeyParts.push(nanoid())
      fullApiKeys[i].clearKey = Buffer.from(clearKeyParts.join(':')).toString('base64url')
      const hash = crypto.createHash('sha512')
      hash.update(fullApiKeys[i].clearKey)
      fullApiKeys[i].key = apiKey.key = hash.digest('hex')
    }
  }

  if (req.body.privateVocabulary) {
    for (const concept of req.body.privateVocabulary) {
      if (!concept.id) concept.id = slug(concept.title, { lower: true, strict: true })
      if (!concept.identifiers || !concept.identifiers.length) concept.identifiers = [concept.id]
    }
  }

  if (req.body.topics) {
    for (const topic of req.body.topics) {
      if (!topic.id) topic.id = nanoid()
    }
  }

  const oldSettings = (await settings.findOneAndReplace(req.ownerFilter, req.body, { upsert: true })).value

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
  const result = await settings.findOne(req.ownerFilter)
  res.status(200).send((result && result.topics) || [])
}))

// Get licenses list as anyone
router.get('/:type/:id/licenses', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const settings = req.app.get('db').collection('settings')
  const result = await settings.findOne(req.ownerFilter)
  res.status(200).send([].concat(config.licenses, (result && result.licenses) || []))
}))

// Get datasets metadata settings as owner
router.get('/:type/:id/datasets-metadata', isOwnerMember, asyncWrap(async (req, res) => {
  const settings = req.app.get('db').collection('settings')
  const result = await settings.findOne(req.ownerFilter)
  res.status(200).send((result && result.datasetsMetadata) || {})
}))

// Get publication sites as owner
router.get('/:type/:id/publication-sites', isOwnerMember, asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  const filter = [req.ownerFilter]
  if (req.owner.department) {
    filter.push({ ...req.ownerFilter, department: { $exists: false } })
  } else if (req.department === '*') {
    filter[0] = { ...req.ownerFilter, department: undefined }
  }
  const settingsArray = await db.collection('settings').find({ $or: filter }, { projection: { _id: 0 } }).toArray()
  const publicationSites = []
  for (const settings of settingsArray) {
    for (const publicationSite of settings.publicationSites || []) {
      if (settings.department) publicationSite.department = settings.department
      publicationSites.push(publicationSite)
    }
  }
  if (!req.user) return res.status(401).type('text/plain').send()
  res.status(200).send(publicationSites)
}))
// create/update publication sites as owner (used by data-fair-portals to sync portals)
router.post('/:type/:id/publication-sites', isOwnerAdmin, asyncWrap(async (req, res) => {
  debugPublicationSites('post site', req.body)
  const db = req.app.get('db')
  let settings = await db.collection('settings').findOne(req.ownerFilter, { projection: { _id: 0 } })
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
      topic: {
        key: `data-fair:dataset-publication-requested:${req.body.type}:${req.body.id}`,
        title: `Un contributeur demande de publier un jeu de données sur ${req.body.title || req.body.url || req.body.id}`
      },
      urlTemplate: config.publicUrl + '/dataset/{id}'
    })
    notifications.subscribe(req, {
      ...baseSubscription,
      topic: {
        key: `data-fair:application-publication-requested:${req.body.type}:${req.body.id}`,
        title: `Un contributeur demande de publier une application sur ${req.body.title || req.body.url || req.body.id}`
      },
      urlTemplate: config.publicUrl + '/application/{id}'
    })
  } else {
    settings.publicationSites[index] = { ...req.body, settings: settings.publicationSites[index].settings || {} }
  }
  validate(settings, errors => debugPublicationSites('bad settings after site update', settings, errors))
  await db.collection('settings').replaceOne(req.owner, settings, { upsert: true })
  res.status(200).send(req.body)
}))
// delete publication sites as owner (used by data-fair-portals to sync portals)
router.delete('/:type/:id/publication-sites/:siteType/:siteId', isOwnerAdmin, asyncWrap(async (req, res) => {
  debugPublicationSites('delete site', req.params)
  const db = req.app.get('db')
  let settings = await db.collection('settings').findOne(req.ownerFilter, { projection: { _id: 0 } })
  if (!settings) {
    settings = {}
    fillSettings(req.owner, req.user, settings)
  }
  settings.publicationSites = settings.publicationSites || []
  settings.publicationSites = settings.publicationSites.filter(ps => ps.type !== req.params.siteType || ps.id !== req.params.siteId)
  validate(settings, errors => debugPublicationSites('bad settings after site deletion', settings, errors))
  await db.collection('settings').replaceOne(req.ownerFilter, settings, { upsert: true })
  const ref = `${req.params.siteType}:${req.params.siteId}`
  await db.collection('datasets').updateMany({ publicationSites: ref }, { $pull: { publicationSites: ref } })
  await db.collection('applications').updateMany({ publicationSites: ref }, { $pull: { publicationSites: ref } })
  res.status(200).send(req.body)
}))

module.exports = router
