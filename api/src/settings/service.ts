import crypto from 'crypto'
import nanoid from '../misc/utils/nanoid.ts'
import slug from 'slugify'
import dayjs from 'dayjs'
import equal from 'fast-deep-equal'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type OptionsDesMetadonneesDeJeuxDeDonnees, type Settings } from '#types/settings/index.js'
import { type DepartmentSettings } from '#types/department-settings/index.js'
import * as topicsUtils from '../misc/utils/topics.ts'
import config from '#config'
import mongo from '#mongo'
import standardLicenses from '../../contract/licenses.js'
import debugLib from 'debug'
import { type AccountKeys, type SessionStateAuthenticated } from '@data-fair/lib-express'
import eventsLog from '@data-fair/lib-express/events-log.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import clone from '@data-fair/lib-utils/clone.js'
import { type LogContext } from '../misc/utils/req-context.ts'
import { clearApiKeysCache } from '../misc/utils/api-key.ts'
import { validateSettings, cleanSettings, fillSettings, cleanDatasetsMetadata, isMainSettings, isDepartmentSettings, type SettingsParams } from './operations.ts'
import { stampHistorizeMany } from '../integrity/outbox.ts'
import { computeSearchText, type CatalogSearchSettings } from '../datasets/operations.ts'
import { datasetsTextSearch } from '../misc/utils/text-search/collections.ts'
import type { AnyBulkWriteOperation } from 'mongodb'
import type { DatasetInternal } from '#types'

const debugPublicationSites = debugLib('publication-sites')

export type SettingsWriteContext = SettingsParams & {
  sessionState: SessionStateAuthenticated
  host: string
  logCtx: LogContext
}

export const getSettings = async (params: SettingsParams) => {
  const { ownerFilter } = params
  const settings = mongo.settings
  const result = await settings
    .findOne(ownerFilter, { projection: { _id: 0, id: 0, type: 0 } })
  return result ? cleanSettings(result) : {}
}

const writeSettings = async (ctx: SettingsWriteContext, existingSettings: Settings | DepartmentSettings | null, settings: any) => {
  const { owner, ownerFilter } = ctx
  const user = ctx.sessionState.user
  fillSettings(owner, user, settings)
  validateSettings(settings)

  settings.apiKeys = settings.apiKeys ?? []
  const existingApiKeys = existingSettings?.apiKeys ?? []

  // a copy of the api keys where the clearKey is returned for the user that created a new key
  const returnedApiKeys = settings.apiKeys?.map(apiKey => ({ ...apiKey })) || []

  for (let i = 0; i < settings.apiKeys.length; i++) {
    const apiKey = settings.apiKeys[i]

    // this check should not be necessary as later on we check adminMode at creation then immutability
    // this is just here as an extra safety
    if (apiKey.adminMode && !user.isAdmin) {
      eventsLog.alert('df.apikeys.manageadmin', 'a non-admin user attempted to manage settings that include an adminMode api key', { ...ctx.logCtx, account: owner })
      throw httpError(403, 'Only superadmin can manage api keys with adminMode=true')
    }

    if (apiKey.key) {
      eventsLog.alert('df.apikeys.writesecret', 'a user attempted to write an api key internal secret', { ...ctx.logCtx, account: owner })
      throw httpError(403, 'Attempt to write an api key secret')
    }

    if (apiKey.notifiedJ3At !== undefined || apiKey.notifiedJAt !== undefined) {
      eventsLog.alert('df.apikeys.writeflag', 'a user attempted to write an api key internal notification flag', { ...ctx.logCtx, account: owner })
      throw httpError(400, 'API key notification flags are internal and not user-writable')
    }

    if (!apiKey.id) {
      // creating a new key

      const returnedApiKey = returnedApiKeys[i]
      if (apiKey.adminMode && !user.adminMode) {
        eventsLog.alert('df.apikeys.createadmin', 'a user attempted to create an adminMode api key', { ...ctx.logCtx, account: owner })
        throw httpError(403, 'Only superadmin can create api keys with adminMode=true')
      }
      if (apiKey.email) {
        eventsLog.alert('df.apikeys.setemail', 'a user attempted to define the email address of an api key', { ...ctx.logCtx, account: owner })
        throw httpError(403, 'API key email is readonly')
      }
      if (apiKey.expireAt && apiKey.expireAt > dayjs().add(config.apiKeysMaxDuration + 1, 'day').format('YYYY-MM-DD')) {
        throw httpError(400, 'API key expiration is too far in the future')
      }
      returnedApiKey.id = apiKey.id = nanoid()

      const clearKeyParts = [owner.type.slice(0, 1), owner.id]
      if (owner.department) clearKeyParts.push(owner.department)
      clearKeyParts.push(nanoid())
      returnedApiKey.clearKey = Buffer.from(clearKeyParts.join(':')).toString('base64url')
      const hash = crypto.createHash('sha512')
      hash.update(returnedApiKey.clearKey)
      returnedApiKey.key = apiKey.key = hash.digest('hex')

      if (settings.type === 'user' && apiKey.scopes.length) {
        returnedApiKey.email = apiKey.email = (settings as Settings).email
      } else {
        returnedApiKey.email = apiKey.email = `${slug.default(apiKey.title, { lower: true, strict: true })}-${apiKey.id}@api-key.${ctx.host}`
      }

      eventsLog.info('df.apikeys.create', `a user created an api key ${apiKey.title} (${apiKey.id}), scopes=${apiKey.scopes.join(', ')}`, { ...ctx.logCtx, account: owner })
      eventsQueue.pushEvent({
        title: 'Création d\'une clé d\'API',
        body: `${apiKey.title} (${apiKey.id}), scopes=${apiKey.scopes.join(', ')}`,
        topic: {
          key: 'data-fair:settings:api-key-created'
        },
        sender: owner
      }, ctx.sessionState)
    } else {
      // re-sending an existing key

      const existingApiKey = existingApiKeys.find(k => k.id === apiKey.id)
      if (!existingApiKey) {
        eventsLog.alert('df.apikeys.setid', 'a user tried to create an api key with id', { ...ctx.logCtx, account: owner })
        throw httpError(400, 'API key cannot be created with an id')
      }
      // should be covered by next general immutability check, but double check to be sure
      if (apiKey.adminMode && !existingApiKey.adminMode && !user.adminMode) {
        eventsLog.alert('df.apikeys.setadmin', 'a user attempted to mutate an api key and make it admin', { ...ctx.logCtx, account: owner })
        throw httpError(403, 'Only superadmin can delete api keys with adminMode=true')
      }
      if (existingApiKey.key) {
        apiKey.key = existingApiKey.key
      } else {
        eventsLog.warn('df.apikeys.missingKey', `an API ${apiKey.id} key seems to be missing its internal secret`, { ...ctx.logCtx, account: owner })
      }
      // notifiedJ3At / notifiedJAt are internal flags set by the expiration worker; they are
      // stripped from API responses and never sent back by the user, so exclude them from the
      // immutability comparison (otherwise any key the worker has notified becomes un-resavable).
      const { notifiedJ3At: _nj3, notifiedJAt: _nj, ...comparableExistingApiKey } = existingApiKey as any
      if (!equal(comparableExistingApiKey, apiKey)) {
        eventsLog.alert('df.apikeys.mutate', `a user tried to mutate an existing api key ${existingApiKey.title} (${existingApiKey.id})`, { ...ctx.logCtx, account: owner })
        throw httpError(400, 'existing API keys are immutable')
      }
    }
  }

  // deleting an api key
  for (const existingApiKey of existingApiKeys) {
    if (!settings.apiKeys.some(k => k.id === existingApiKey.id)) {
      if (existingApiKey.adminMode && !user.adminMode) {
        eventsLog.alert('df.apikeys.deleteadmin', 'a user attempted to delete an admin api key', { ...ctx.logCtx, account: owner })
        throw httpError(403, 'Only superadmin can delete api keys with adminMode=true')
      }
      eventsQueue.pushEvent({
        title: 'Suppression d\'une clé d\'API',
        body: `${existingApiKey.title} (${existingApiKey.id}), scopes=${existingApiKey.scopes.join(', ')}`,
        topic: {
          key: 'data-fair:settings:api-key-deleted'
        },
        sender: owner
      }, ctx.sessionState)
    }
  }

  if (isMainSettings(settings) && settings.privateVocabulary) {
    for (const concept of settings.privateVocabulary) {
      if (!concept.id) concept.id = slug.default(concept.title, { lower: true, strict: true })
      if (!concept.identifiers || !concept.identifiers.length) concept.identifiers = [concept.id]
    }
  }

  if (isMainSettings(settings) && settings.topics) {
    const seenIds = new Map<string, string>()
    for (const topic of settings.topics) {
      if (!topic.id) topic.id = nanoid()
      const existing = seenIds.get(topic.id)
      if (existing) throw httpError(400, `Les thématiques "${existing}" et "${topic.title}" ont le même identifiant`)
      seenIds.set(topic.id, topic.title)
    }
  }

  if (isMainSettings(settings) && settings.datasetsMetadata) {
    cleanDatasetsMetadata(settings.datasetsMetadata)
  }

  // sweep BEFORE the settings document is replaced: a crash mid-sweep then leaves old settings +
  // old _searchText (consistent), and a retried save re-detects the same difference and completes.
  // Sweeping after the replace (as this used to) let an interrupted opt-out become permanent: the
  // settings document already says the switch is off, so updateCatalogSearch's equal() short-circuit
  // would skip the sweep on every later save and the unswept half of the catalog would keep
  // enum-bearing _searchText forever — the exact direction the settings disclaimer promises to honour.
  // No truthy guard on existingSettings here: it is null on the owner's very first settings write,
  // but existing datasets may already have been indexed under the implicit default catalogSearch,
  // so that first write can still be a real change to recompute.
  if (isMainSettings(settings)) {
    await updateCatalogSearch(owner, existingSettings && isMainSettings(existingSettings) ? existingSettings.catalogSearch : undefined, settings.catalogSearch)
  }

  const oldSettings = (await mongo.settings.findOneAndReplace(ownerFilter, settings, { upsert: true }))

  // api key creation/revocation must apply immediately on this node
  clearApiKeysCache()

  if (oldSettings && isMainSettings(oldSettings) && isMainSettings(settings) && settings.topics) {
    await topicsUtils.updateTopics(owner, oldSettings.topics || [], settings.topics)
  }

  if (oldSettings && isMainSettings(oldSettings) && isMainSettings(settings) && settings.datasetsMetadata) {
    await updateDatasetsMetadata(owner, oldSettings.datasetsMetadata || {}, settings.datasetsMetadata)
  }

  return cleanSettings({ ...settings, apiKeys: returnedApiKeys })
}

const updateDatasetsMetadata = async (owner: AccountKeys, oldDatasetsMetadata: OptionsDesMetadonneesDeJeuxDeDonnees, newDatasetsMetadata: OptionsDesMetadonneesDeJeuxDeDonnees) => {
  if (equal(oldDatasetsMetadata, newDatasetsMetadata)) return
  for (const oldMeta of oldDatasetsMetadata.custom ?? []) {
    // clean up the metadata off datasets when its definition was removed from the settings
    if (!newDatasetsMetadata.custom?.some(nc => nc.key === oldMeta.key)) {
      const customMetadataFilter = { 'owner.type': owner.type, 'owner.id': owner.id, [`customMetadata.${oldMeta.key}`]: { $exists: true } }
      // stamp BEFORE the $unset: the unset removes the very key this filter's $exists checks,
      // so stamping after would match nothing (over-stamping here is harmless, the relay dedupes)
      await stampHistorizeMany(customMetadataFilter)
      await mongo.datasets.updateMany(customMetadataFilter, { $unset: { [`customMetadata.${oldMeta.key}`]: 1 } })
      await mongo.datasets.updateMany(
        { 'owner.type': owner.type, 'owner.id': owner.id, [`draft.customMetadata.${oldMeta.key}`]: { $exists: true } },
        { $unset: { [`draft.customMetadata.${oldMeta.key}`]: 1 } })
    }
  }
}

// the schema-derived search text of every dataset of the owner depends on these switches
const updateCatalogSearch = async (owner: AccountKeys, oldCatalogSearch: CatalogSearchSettings | undefined, newCatalogSearch: CatalogSearchSettings | undefined) => {
  if (equal(oldCatalogSearch ?? {}, newCatalogSearch ?? {})) return
  // no draftReason filter here: a stored dataset document never carries a top-level `draftReason`
  // (it only ever lives at `draft.draftReason`), so that clause would match every document and do
  // nothing. The real non-draft-only effect: a file-new draft's top-level `schema` is `[]` (its
  // real schema sits under `draft.schema`), and computeSearchText returns undefined for an empty
  // schema — a file-updated draft's top-level schema is the still-published one, correctly swept.
  // the projection (and therefore the document buildIndexFields sees) must carry every field the
  // index derives from, not just the schema-derived _searchText — derived from the definition
  // itself rather than hardcoded, for the same reason as the applyPatch trigger above: a
  // hardcoded list would silently go stale the next time the definition gains a field.
  const projection: Record<string, 1> = { id: 1, schema: 1, permissions: 1 }
  for (const path of Object.keys(datasetsTextSearch.definition.fields)) projection[path.split('.')[0]] = 1
  const cursor = mongo.datasets.find(
    { 'owner.type': owner.type, 'owner.id': owner.id },
    { projection }
  )
  const ops: AnyBulkWriteOperation<DatasetInternal & { _id: string }>[] = []
  const flush = async () => {
    if (ops.length) await mongo.datasets.bulkWrite(ops, { ordered: false })
    ops.length = 0
  }
  for await (const dataset of cursor) {
    const _searchText = computeSearchText(dataset, newCatalogSearch) ?? null
    if ((_searchText ?? null) === (dataset._searchText ?? null)) continue
    // _searchText is itself one of the indexed fields, so the index must be rebuilt from the NEW
    // value computed above, not the stale one still sitting on `dataset`
    const fields = datasetsTextSearch.buildIndexFields({ ...dataset, _searchText })
    const indexPatch: Record<string, any> = {
      _searchText,
      _terms: fields?._terms ?? null,
      _pos: fields?._pos ?? null,
      _len: fields?._len ?? null,
      _searchIndex: { v: datasetsTextSearch.definition.version, at: new Date().toISOString() }
    }
    const $set: Record<string, any> = {}
    const $unset: Record<string, any> = {}
    for (const [key, value] of Object.entries(indexPatch)) {
      if (value === null) $unset[key] = true
      else $set[key] = value
    }
    const update: Record<string, any> = {}
    if (Object.keys($set).length) update.$set = $set
    if (Object.keys($unset).length) update.$unset = $unset
    ops.push({ updateOne: { filter: { id: dataset.id }, update } })
    if (ops.length >= 200) await flush()
  }
  await flush()
  // recomputed inline above, not deferred via markStale: this sweep already visits every one of
  // the owner's datasets to decide whether _searchText changed, so marking them stale for the
  // worker to revisit would only add a staleness window (and a UX regression against the old
  // $text behaviour, where a settings toggle took effect immediately) for no saving.
}

export const updateSettings = async (ctx: SettingsWriteContext, settings: any) => {
  const existingSettings = await mongo.settings.findOne(ctx.ownerFilter)
  return writeSettings(ctx, existingSettings, settings)
}

export const patchSettings = async (ctx: SettingsWriteContext, partialSettings: any) => {
  const existingSettings = await mongo.settings.findOne(ctx.ownerFilter, { projection: { _id: 0 } })
  const settings = cleanSettings({ ...(clone(existingSettings ?? {})), ...partialSettings })
  return writeSettings(ctx, existingSettings, settings)
}

export const getTopics = async (params: SettingsParams) => {
  const { ownerFilter } = params
  const settings = mongo.settings
  const result = await settings.findOne(ownerFilter)
  const topics = result && isMainSettings(result) && result.topics ? result.topics : []
  for (const topic of topics) {
    if (topic.icon) topic.icon = { name: topic.icon.name, svgPath: topic.icon.svgPath }
  }
  return topics
}

export const getLicenses = async (params: SettingsParams) => {
  const { ownerFilter } = params
  const settings = mongo.settings
  const result = await settings.findOne(ownerFilter)
  const licenses: { href: string, title: string }[] = []
  for (const l of standardLicenses) {
    licenses.push({ href: l.href, title: l.title })
  }
  if (result && isMainSettings(result)) {
    for (const l of result.licenses ?? []) {
      licenses.push(l)
    }
  }

  return licenses
}

export const getDatasetsMetadata = async (params: SettingsParams) => {
  const { ownerFilter } = params
  const settings = mongo.settings
  const result = await settings.findOne(ownerFilter)
  return result && isMainSettings(result) && result.datasetsMetadata ? result.datasetsMetadata : {}
}

export const getAgentChat = async (params: SettingsParams) => {
  const { ownerFilter } = params
  const result = await mongo.settings.findOne(ownerFilter, { projection: { _id: 0, agentChat: 1 } })
  return { agentChat: !!(result && isMainSettings(result) && result.agentChat) }
}

export const getPublicationSites = async (params: SettingsParams) => {
  const { owner, ownerFilter, department } = params
  const filter = [ownerFilter]
  if (owner.department) {
    filter.push({ ...ownerFilter, department: { $exists: false } })
  } else if (department === '*') {
    filter[0] = { ...ownerFilter }
    delete filter[0].department
  }
  const settingsArray = await mongo.settings.find({ $or: filter }, { projection: { _id: 0 } }).toArray()
  const publicationSites = []
  for (const settings of settingsArray) {
    for (const publicationSite of settings.publicationSites || []) {
      if (isDepartmentSettings(settings)) publicationSite.department = settings.department
      if (owner.department && publicationSite.settings?.contributorDepartments?.includes(owner.department)) {
        (publicationSite as any).canContributeAsDepartment = true
      }
      publicationSites.push(publicationSite)
    }
  }
  return publicationSites
}

export const upsertPublicationSite = async (ctx: SettingsWriteContext, body: any): Promise<{ created: boolean }> => {
  const { owner, ownerFilter } = ctx
  debugPublicationSites('post site', body)
  if (owner.department && body.settings?.contributorDepartments && body.settings.contributorDepartments.length) {
    throw httpError(400, 'contributorDepartments is only allowed on org-root publication sites')
  }
  let settings = (await mongo.settings.findOne(ownerFilter, { projection: { _id: 0 } })) as Settings | DepartmentSettings
  if (!settings) {
    settings = fillSettings(owner, ctx.sessionState.user, {})
  }
  settings.publicationSites = settings.publicationSites || []
  const index = settings.publicationSites.findIndex(ps => ps.type === body.type && ps.id === body.id)
  if (index === -1) {
    settings.publicationSites.push(body)
  } else {
    settings.publicationSites[index] = { ...body, settings: { ...(settings.publicationSites[index].settings || {}), ...(body.settings || {}) } }
  }
  validateSettings(settings)
  await mongo.settings.replaceOne(ownerFilter, settings, { upsert: true })
  return { created: index === -1 }
}

export const deletePublicationSite = async (ctx: SettingsWriteContext, siteType: string, siteId: string) => {
  debugPublicationSites('delete site', { siteType, siteId })
  const { owner, ownerFilter } = ctx

  let settings = (await mongo.settings.findOne(ownerFilter, { projection: { _id: 0 } })) as Settings | DepartmentSettings
  if (!settings) {
    settings = fillSettings(owner, ctx.sessionState.user, {})
  }
  settings.publicationSites = settings.publicationSites || []
  settings.publicationSites = settings.publicationSites.filter(ps => ps.type !== siteType || ps.id !== siteId)
  validateSettings(settings)
  await mongo.settings.replaceOne(ownerFilter, settings, { upsert: true })
  const ref = `${siteType}:${siteId}`
  // a pending publication request points at the site too, it becomes dangling if left behind
  const publicationSitesFilter = { $or: [{ publicationSites: ref }, { requestedPublicationSites: ref }] }
  const pullRef = { $pull: { publicationSites: ref, requestedPublicationSites: ref } }
  // stamp BEFORE the $pull: the pull removes the very element this filter matches, so stamping
  // after would match nothing (over-stamping here is harmless, the relay dedupes)
  await stampHistorizeMany(publicationSitesFilter)
  await mongo.datasets.updateMany(publicationSitesFilter, pullRef)
  await mongo.applications.updateMany(publicationSitesFilter, pullRef)
}
