import crypto from 'crypto'
import express, { type Request as ExpressRequest, type Response, type NextFunction } from 'express'
import { nanoid } from 'nanoid'
import slug from 'slugify'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type Settings, assertValid as validateSettings } from '#types/settings/index.js'
import { type DepartmentSettings, assertValid as validateDepartmentSettings } from '#types/department-settings/index.js'
import * as permissions from '../utils/permissions.ts'
import * as cacheHeaders from '../utils/cache-headers.js'
import * as topicsUtils from '../utils/topics.ts'
import * as notifications from '../utils/notifications.ts'
import config from '#config'
import mongo from '#mongo'
import standardLicenses from '../../../contract/licenses.js'
import debugLib from 'debug'
import { type AccountKeys, reqSessionAuthenticated, reqUserAuthenticated, User } from '@data-fair/lib-express'
import { type Request } from '#types'

const debugPublicationSites = debugLib('publication-sites')

const router = express.Router()

const allowedTypes = new Set(['user', 'organization'])

function validate (settings: any): asserts settings is Settings | DepartmentSettings {
  if ((settings as DepartmentSettings).department) {
    validateDepartmentSettings(settings)
  } else {
    validateSettings(settings)
  }
}

type SettingsRequest = Request & { owner: AccountKeys, department?: string, ownerFilter: any }
function assertSettingsRequest (req: ExpressRequest): asserts req is SettingsRequest {
  if (!(req as SettingsRequest).owner) throw new Error('middleware not applied')
}

function isOrgSettings (settings: Settings | DepartmentSettings): settings is Settings {
  return !(settings as DepartmentSettings).department
}
function isDepartmentSettings (settings: Settings | DepartmentSettings): settings is DepartmentSettings {
  return !!(settings as DepartmentSettings).department
}

// @ts-ignore
router.use('/:type/:id', (req: ExpressRequest, res: Response, next: NextFunction) => {
  assertSettingsRequest(req)
  if (req.params.type !== 'user' && req.params.type !== 'organization') {
    res.status(400).type('text/plain').send('Invalid type, it must be one of the following : ' + Array.from(allowedTypes).join(', '))
    return
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

function isOwnerAdmin (req: ExpressRequest, res: Response, next: NextFunction) {
  assertSettingsRequest(req)
  const sessionState = reqSessionAuthenticated(req)
  if (sessionState.user.adminMode) {
    // ok
  } else if (permissions.getOwnerRole(req.owner, sessionState) !== 'admin') {
    res.sendStatus(403)
    return
  }
  next()
}

function isOwnerMember (req: ExpressRequest, res: Response, next: NextFunction) {
  assertSettingsRequest(req)
  const sessionState = reqSessionAuthenticated(req)
  if (sessionState.user.adminMode) {
    // ok
  } else if (!permissions.getOwnerRole(req.owner, sessionState, true)) {
    // do not check belonging to department, some settings are shared from top org to its departments
    res.sendStatus(403)
    return
  }
  next()
}

// read settings as owner
router.get('/:type/:id', isOwnerAdmin, cacheHeaders.noCache, async (req, res) => {
  assertSettingsRequest(req)
  const settings = mongo.settings
  const result = await settings
    .findOne(req.ownerFilter, { projection: { _id: 0, id: 0, type: 0 } })
  res.status(200).send(result || {})
})

const fillSettings = (owner: AccountKeys, user: User, settings: any): Settings | DepartmentSettings => {
  Object.assign(settings, owner)
  if (owner.type === 'user') settings.name = user.name
  else {
    const org = user.organizations.find(o => o.id === owner.id)
    if (!org) throw new Error('base org ref in user')
    settings.name = org.name
    if (owner.department) settings.name += ' - ' + owner.department
  }
  settings.apiKeys = settings.apiKeys || []
  for (const apiKey of settings.apiKeys) {
    delete apiKey.clearKey
  }
  settings.publicationSites = settings.publicationSites || []
  delete settings.operationsPermissions // deprecated
  return settings
}

// update settings as owner
router.put('/:type/:id', isOwnerAdmin, async (req, res) => {
  assertSettingsRequest(req)
  const settings = req.body
  const user = reqUserAuthenticated(req)
  fillSettings(req.owner, user, settings)
  validate(settings)

  const fullApiKeys = settings.apiKeys?.map(apiKey => ({ ...apiKey })) || []
  if (settings.apiKeys) {
    for (let i = 0; i < settings.apiKeys.length; i++) {
      const apiKey = settings.apiKeys[i]
      const fullApiKey = fullApiKeys[i]
      if (apiKey.adminMode && !user.adminMode) {
        throw httpError(403, 'Only superadmin can manage api keys with adminMode=true')
      }
      if (!apiKey.id) fullApiKey.id = apiKey.id = nanoid()

      if (!apiKey.key) {
        const clearKeyParts = [req.owner.type.slice(0, 1), req.owner.id]
        if (req.owner.department) clearKeyParts.push(req.owner.department)
        clearKeyParts.push(nanoid())
        fullApiKey.clearKey = Buffer.from(clearKeyParts.join(':')).toString('base64url')
        const hash = crypto.createHash('sha512')
        hash.update(fullApiKey.clearKey)
        fullApiKeys[i].key = apiKey.key = hash.digest('hex')
      }
    }
  }

  if (isOrgSettings(settings) && settings.privateVocabulary) {
    for (const concept of req.body.privateVocabulary) {
      if (!concept.id) concept.id = slug.default(concept.title, { lower: true, strict: true })
      if (!concept.identifiers || !concept.identifiers.length) concept.identifiers = [concept.id]
    }
  }

  if (isOrgSettings(settings) && settings.topics) {
    for (const topic of settings.topics) {
      if (!topic.id) topic.id = nanoid()
    }
  }
  const oldSettings = (await mongo.settings.findOneAndReplace(req.ownerFilter, settings, { upsert: true }))

  if (oldSettings && isOrgSettings(oldSettings) && isOrgSettings(settings) && settings.topics) {
    await topicsUtils.updateTopics(req.owner, oldSettings.topics || [], settings.topics)
  }
  res.status(200).send({ ...settings, apiKeys: fullApiKeys })
})

// Get topics list as owner
router.get('/:type/:id/topics', isOwnerMember, async (req, res) => {
  assertSettingsRequest(req)
  const settings = mongo.settings
  const result = await settings.findOne(req.ownerFilter)
  res.status(200).send(result && isOrgSettings(result) && result.topics ? result.topics : [])
})

// Get licenses list as anyone
router.get('/:type/:id/licenses', cacheHeaders.noCache, async (req, res) => {
  assertSettingsRequest(req)
  const settings = mongo.settings
  const result = await settings.findOne(req.ownerFilter)
  const licenses: { href: string, title: string }[] = []
  for (const l of standardLicenses) {
    licenses.push({ href: l.href, title: l.title })
  }
  if (result && isOrgSettings(result)) {
    for (const l of result.licenses ?? []) {
      licenses.push(l)
    }
  }

  res.status(200).send(licenses)
})

// Get datasets metadata settings as owner
router.get('/:type/:id/datasets-metadata', isOwnerMember, async (req, res) => {
  assertSettingsRequest(req)
  const settings = mongo.settings
  const result = await settings.findOne(req.ownerFilter)
  res.status(200).send(result && isOrgSettings(result) && result.datasetsMetadata ? result.datasetsMetadata : {})
})

// Get publication sites as owner
router.get('/:type/:id/publication-sites', isOwnerMember, async (req, res) => {
  assertSettingsRequest(req)
  reqSessionAuthenticated(req)
  const filter = [req.ownerFilter]
  if (req.owner.department) {
    filter.push({ ...req.ownerFilter, department: { $exists: false } })
  } else if (req.department === '*') {
    filter[0] = { ...req.ownerFilter }
    delete filter[0].department
  }
  const settingsArray = await mongo.settings.find({ $or: filter }, { projection: { _id: 0 } }).toArray()
  const publicationSites = []
  for (const settings of settingsArray) {
    for (const publicationSite of settings.publicationSites || []) {
      if (isDepartmentSettings(settings)) publicationSite.department = settings.department
      publicationSites.push(publicationSite)
    }
  }
  res.status(200).send(publicationSites)
})
// create/update publication sites as owner (used by data-fair-portals to sync portals)
router.post('/:type/:id/publication-sites', isOwnerAdmin, async (req, res) => {
  assertSettingsRequest(req)
  debugPublicationSites('post site', req.body)
  let settings = (await mongo.settings.findOne(req.ownerFilter, { projection: { _id: 0 } })) as Settings | DepartmentSettings
  if (!settings) {
    settings = fillSettings(req.owner, reqUserAuthenticated(req), {})
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
  validate(settings)
  await mongo.settings.replaceOne(req.owner, settings, { upsert: true })
  res.status(200).send(req.body)
})
// delete publication sites as owner (used by data-fair-portals to sync portals)
router.delete('/:type/:id/publication-sites/:siteType/:siteId', isOwnerAdmin, async (req, res) => {
  debugPublicationSites('delete site', req.params)
  assertSettingsRequest(req)

  let settings = (await mongo.settings.findOne(req.ownerFilter, { projection: { _id: 0 } })) as Settings | DepartmentSettings
  if (!settings) {
    settings = fillSettings(req.owner, reqUserAuthenticated(req), {})
  }
  settings.publicationSites = settings.publicationSites || []
  settings.publicationSites = settings.publicationSites.filter(ps => ps.type !== req.params.siteType || ps.id !== req.params.siteId)
  validate(settings)
  await mongo.settings.replaceOne(req.ownerFilter, settings, { upsert: true })
  const ref = `${req.params.siteType}:${req.params.siteId}`
  await mongo.datasets.updateMany({ publicationSites: ref }, { $pull: { publicationSites: ref } })
  await mongo.applications.updateMany({ publicationSites: ref }, { $pull: { publicationSites: ref } })
  res.status(200).send(req.body)
})

export default router
