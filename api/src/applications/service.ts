import mongo from '#mongo'
import config from '#config'
import moment from 'moment'
import slug from 'slugify'
import { nanoid } from 'nanoid'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type AccountKeys, type SessionState, type SessionStateAuthenticated } from '@data-fair/lib-express'
import eventsLog from '@data-fair/lib-express/events-log.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import * as findUtils from '../misc/utils/find.ts'
import * as permissions from '../misc/utils/permissions.ts'
import * as journals from '../misc/utils/journals.ts'
import * as capture from '../misc/utils/capture.ts'
import * as publicationSites from '../misc/utils/publication-sites.ts'
import { clearApplicationKeysCaches } from '../misc/utils/application-key.ts'
import { sendResourceEvent } from '../misc/utils/notifications.ts'
import { type LogContext } from '../misc/utils/req-context.ts'
import { clean, dir, attachmentPath } from './utils.ts'
import { setUniqueRefs } from './operations.ts'
import filesStorage from '#files-storage'
import { syncApplications } from '../datasets/service.ts'
import type { Application, Event } from '#types'
import { patchKeys } from '#doc/applications/patch-req/schema.js'

// applications-keys only needs the owner parts used by the application-key middleware
// filter (type/id/department) — see api/src/misc/utils/application-key.ts
const applicationKeyOwner = (owner: { type: string, id: string, department?: string }) => {
  const keyOwner: { type: string, id: string, department?: string } = { type: owner.type, id: owner.id }
  if (owner.department) keyOwner.department = owner.department
  return keyOwner
}

const filterFields = {
  url: 'url',
  'base-application': 'url',
  dataset: 'configuration.datasets.id',
  application: 'configuration.applications.id',
  topics: 'topics.id',
  publicationSites: 'publicationSites',
  requestedPublicationSites: 'requestedPublicationSites'
}
const facetFields = {
  ...filterFields,
  topics: 'topics'
}
const nullFacetFields = ['publicationSites']
const fieldsMap = {
  ids: 'id',
  id: 'id',
  status: 'status',
  ...filterFields
}

export type ApplicationWriteContext = {
  sessionState: SessionStateAuthenticated
  logCtx: LogContext
}

export const findApplications = async (locale: string, publicationSite: any, publicBaseUrl: string, reqQuery: Record<string, string>, sessionState: SessionState) => {
  if (reqQuery.service &&
      !reqQuery.service.startsWith('http://') &&
      !reqQuery.service.startsWith('https://')) {
    reqQuery.service = config.publicUrl + '/api/v1/remote-services/' + reqQuery.service
  }

  const extraFilters = []

  // the api exposed on a secondary domain should not be able to access resources outside of the owner account
  if (publicationSite) {
    extraFilters.push({ 'owner.type': publicationSite.owner.type, 'owner.id': publicationSite.owner.id })
  }

  if (reqQuery.filterConcepts === 'true') {
    extraFilters.push({ 'baseApp.meta.df:filter-concepts': 'true' })
  }
  if (reqQuery.syncState === 'true') {
    extraFilters.push({ 'baseApp.meta.df:sync-state': 'true' })
  }
  if (reqQuery.overflow === 'true') {
    extraFilters.push({ 'baseApp.meta.df:overflow': 'true' })
  }

  const query = findUtils.query(reqQuery, locale, sessionState, 'applications', fieldsMap, false, extraFilters)

  const sort = findUtils.sort(reqQuery.sort || (!reqQuery.q && '-createdAt') || '', reqQuery.q)
  const project = findUtils.project(reqQuery.select, ['configuration', 'configurationDraft'], reqQuery.raw === 'true')
  const [skip, size] = findUtils.pagination(reqQuery)

  const countPromise = reqQuery.count !== 'false' && mongo.applications.countDocuments(query)
  const resultsPromise = size > 0 && mongo.applications.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray()
  const facetsPromise = reqQuery.facets && mongo.applications.aggregate(findUtils.facetsQuery(reqQuery, sessionState, 'applications', facetFields, filterFields, nullFacetFields)).toArray()
  const [count, results, facets] = await Promise.all([countPromise, resultsPromise, facetsPromise])
  /** @type {any} */
  const response: any = {}
  if (countPromise) response.count = count
  if (resultsPromise) response.results = results
  else response.results = []
  if (facetsPromise) response.facets = findUtils.parseFacets(facets, nullFacetFields)

  for (const r of response.results) {
    if (reqQuery.raw !== 'true') r.userPermissions = permissions.list('applications', r, sessionState)
    clean(r, publicBaseUrl, publicationSite, reqQuery)
  }

  return response
}

export const curateApplication = async (application: Application) => {
  if (application.title) application.title = application.title.trim()
  const projection = { id: 1, url: 1, meta: 1, datasetsFilters: 1 }
  if (application.url) {
    application.baseApp = await mongo.baseApplications.findOne({ url: application.url }, { projection }) as any
    if (!application.baseApp) {
      throw httpError(400, 'Base application not found')
    }
  } else {
    delete application.baseApp
  }
  if (application.urlDraft) {
    application.baseAppDraft = await mongo.baseApplications.findOne({ url: application.urlDraft }, { projection }) as any
    if (!application.baseAppDraft) {
      throw httpError(400, 'Base draft application not found')
    }
  } else {
    delete application.baseAppDraft
  }
  setUniqueRefs(application)
}

// update references to an application into the datasets it references (or used to reference before a patch)
export const syncDatasets = async (newApp: any, oldApp: any = {}) => {
  const ids = [...(newApp?.configuration?.datasets || []), ...(oldApp?.configuration?.datasets || [])]
    .map((dataset: any) => dataset.id ?? dataset.href.replace(config.publicUrl + '/api/v1/datasets/', ''))
  for (const id of [...new Set(ids)]) {
    await syncApplications(id as string)
  }
}

export const initNewApplication = async (body: any, owner: AccountKeys, user: { id: string, name: string }, id?: string) => {
  const application = { ...body }
  if (id) application.id = id
  application.owner = owner
  const date = moment().toISOString()
  application.createdAt = application.updatedAt = date
  application.createdBy = application.updatedBy = { id: user.id }
  application.permissions = []
  await curateApplication(application)
  return application
}

export const createApplication = async (ctx: ApplicationWriteContext, application: any) => {
  application.id = nanoid()

  if (application.initFrom) {
    const parentApplication = await mongo.applications.findOne({ id: application.initFrom.application })
    if (!parentApplication) throw new Error('[noretry] application d\'initialisation inconnue ' + application.initFrom.application)
    // mongo findOne returns WithId<Application>, not Resource — cast bridges the gap
    const parentApplicationPermissions = permissions.list('applications', parentApplication as any, ctx.sessionState)
    if (!parentApplicationPermissions.includes('readDescription')) {
      throw new Error(`[noretry] permission manquante sur l'application d'initialisation "${parentApplication.slug}" (${parentApplication.id})`)
    }
    if (parentApplication.url !== application.url) throw httpError(400, 'application.url and initFrom application do not match')
    application.configuration = parentApplication.configuration
    if (parentApplication.summary) application.summary = parentApplication.summary
    if (parentApplication.description) application.description = parentApplication.description
    if (parentApplication.attachments?.length) {
      for (const attachment of parentApplication.attachments) {
        const newPath = attachmentPath(application, attachment.name)
        await filesStorage.copyFile(attachmentPath(parentApplication as any, attachment.name), newPath)
      }
      application.attachments = parentApplication.attachments
    }
  }

  // Generate ids and try insertion until there is no conflict on id
  const toks = application.url.split('/').filter((part: string) => !!part)
  const lastUrlPart = toks[toks.length - 1]
  application.title = application.title || application.applicationName || lastUrlPart
  const baseslug = application.slug || slug(application.title, { lower: true, strict: true })
  application.slug = baseslug
  setUniqueRefs(application)
  permissions.initResourcePermissions(application)
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await mongo.db.collection('applications').insertOne(application)
      insertOk = true
    } catch (err: any) {
      if (err.code !== 11000) throw err
      i += 1
      application.slug = `${baseslug}-${i}`
      setUniqueRefs(application)
    }
  }
  application.status = 'created'

  eventsLog.info('df.applications.create', `created application ${application.slug} (${application.id})`, { ...ctx.logCtx, account: application.owner })

  await journals.log('applications', application, { type: 'application-created', href: config.publicUrl + '/application/' + application.id } as Event)
  await sendResourceEvent('applications', application, ctx.sessionState, 'application-created')
  return application
}

export const tryInsertApplication = async (ctx: ApplicationWriteContext, newApplication: any): Promise<boolean> => {
  try {
    await mongo.db.collection('applications').insertOne(newApplication)

    eventsLog.info('df.applications.create', `created application ${newApplication.slug} (${newApplication.id})`, { ...ctx.logCtx, account: newApplication.owner })

    await journals.log('applications', newApplication, { type: 'application-created', href: config.publicUrl + '/application/' + newApplication.id } as Event)
    await sendResourceEvent('applications', newApplication, ctx.sessionState, 'application-created')

    return true
  } catch (err: any) {
    if (err.code !== 11000) throw err
    return false
  }
}

export const replaceApplication = async (ctx: ApplicationWriteContext, existingApplication: Application, newApplication: any, isNew: boolean) => {
  // preserve all readonly properties, the rest is overwritten
  for (const key of Object.keys(existingApplication)) {
    if (!(patchKeys as string[]).includes(key)) {
      newApplication[key] = (existingApplication as any)[key]
    }
  }
  newApplication.updatedAt = moment().toISOString()
  newApplication.updatedBy = { id: ctx.sessionState.user.id }
  newApplication.created = true

  if (!isNew) {
    eventsLog.info('df.applications.update', `updated application ${newApplication.slug} (${newApplication.id})`, { ...ctx.logCtx, account: newApplication.owner })
    const sessionState = ctx.sessionState
    eventsQueue.pushEvent({
      title: 'Application entièrement modifiée',
      body: `${newApplication.title} (${newApplication.slug})`,
      topic: {
        key: `data-fair:application-updated:${newApplication.id}`
      },
      sender: newApplication.owner,
      resource: { type: 'application', title: newApplication.title, id: newApplication.id }
    }, sessionState)
  }

  await mongo.db.collection('applications').replaceOne({ id: existingApplication.id }, newApplication)
  return newApplication
}

export const patchApplication = async (ctx: ApplicationWriteContext, application: Application, patch: any) => {
  // Retry previously failed publications
  if (!patch.publications) {
    const failedPublications = (application.publications || []).filter((p: any) => p.status === 'error')
    if (failedPublications.length) {
      for (const p of failedPublications) {
        p.status = 'waiting'
      }
      patch.publications = application.publications
    }
  }

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: ctx.sessionState.user.id }
  patch.id = application.id
  patch.slug = patch.slug || application.slug
  await curateApplication(patch)

  // Application is not structurally assignable to Resource (Pick<Dataset>); cast until Resource is widened (Phase 5)
  await publicationSites.applyPatch(application as any, { ...application, ...patch }, ctx.sessionState, 'applications')

  let patchedApplication
  try {
    patchedApplication = await mongo.applications
      .findOneAndUpdate({ id: application.id }, { $set: patch }, { returnDocument: 'after' })
  } catch (err: any) {
    if (err.code !== 11000) throw err
    throw httpError(400, 'errors.dupSlug')
  }
  // configuration.datasets changes affect the application-key middleware matching
  clearApplicationKeysCaches()

  eventsLog.info('df.applications.patch', `patched application ${patchedApplication!.slug} (${patchedApplication!.id}), keys=${JSON.stringify(Object.keys(patch))}`, { ...ctx.logCtx, account: patchedApplication!.owner })

  const sessionState = ctx.sessionState
  eventsQueue.pushEvent({
    title: 'Propriétés modifiées sur une application',
    body: `${application.title} (${application.slug}), ${Object.keys(patch)?.join(', ')}`,
    topic: {
      key: `data-fair:application-patched-properties:${application.id}`
    },
    sender: application.owner,
    resource: { type: 'application', title: application.title, id: application.id }
  }, sessionState)

  await syncDatasets(patchedApplication!, application)
  return patchedApplication! as Application
}

export const changeApplicationOwner = async (ctx: ApplicationWriteContext, application: Application, newOwner: any) => {
  const sessionState = ctx.sessionState

  const patch: any = {
    owner: newOwner,
    updatedBy: { id: sessionState.user.id },
    updatedAt: moment().toISOString()
  }
  const sameOrg = application.owner.type === 'organization' && application.owner.type === newOwner.type && application.owner.id === newOwner.id
  if (sameOrg && !application.owner.department && newOwner.department) {
    // moving from org root to a department, we keep the publicationSites
  } else {
    patch.publicationSites = []
  }
  if (!sameOrg && newOwner.publications) {
    patch.publications = []
  }

  const preservePermissions = (application.permissions || []).filter((p: any) => {
    // keep public permissions
    if (!p.type) return true
    if (sameOrg) {
      // keep individual user permissions (user partners)
      if (p.type === 'user') return true
      // keep permissions to external org (org partners)
      if (p.type === 'organization' && p.id !== application.owner.id) return true
    }
    return false
  })
  await permissions.initResourcePermissions(patch, preservePermissions)

  const patchedApp = await mongo.applications
    .findOneAndUpdate({ id: application.id }, { $set: patch }, { returnDocument: 'after' })

  // keep applications-keys.owner in sync — the application-key middleware queries this collection
  // with an ownerFilter built from the dataset's owner, so a stale owner here silently breaks
  // existing protected links after an ownership transfer
  await mongo.applicationsKeys
    .updateOne({ _id: application.id }, { $set: { owner: applicationKeyOwner(patch.owner) } })
  clearApplicationKeysCaches()

  const arrowStr = `${application.owner.name} (${application.owner.type}:${application.owner.id}) -> ${patch.owner.name} (${patch.owner.type}:${patch.owner.id})`
  const eventLogMessage = `changed owner of application ${application.slug} (${application.id}), ${arrowStr}`
  eventsLog.info('df.applications.changeOwnerFrom', eventLogMessage, { ...ctx.logCtx, account: application.owner })
  eventsLog.info('df.applications.changeOwnerTo', eventLogMessage, { ...ctx.logCtx, account: newOwner })

  const event = {
    title: 'Changement de propriétaire d\'une application',
    body: `${application.title} (${application.slug}), ${arrowStr}`,
    topic: {
      key: `data-fair:application-change-owner:${application.id}`
    },
    resource: { type: 'application', title: application.title, id: application.id },
    sender: { ...application.owner, role: 'admin' }
  }
  eventsQueue.pushEvent(event, sessionState)
  eventsQueue.pushEvent({ ...event, sender: { ...patch.owner, role: 'admin' } }, sessionState)

  await syncDatasets(patchedApp)
  return patchedApp! as Application
}

export const deleteApplication = async (ctx: ApplicationWriteContext, application: Application) => {
  const db = mongo.db
  await db.collection('applications').deleteOne({ id: application.id })
  await db.collection('journals').deleteOne({ type: 'application', id: application.id })
  await mongo.applicationsKeys.deleteOne({ _id: application.id })
  clearApplicationKeysCaches()
  try {
    await filesStorage.removeFile(capture.captureFilePath(application))
  } catch (err) {
    console.warn('Failure to remove capture file')
  }
  try {
    await filesStorage.removeDir(dir(application))
  } catch (err) {
    console.warn('Failure to remove application directory')
  }

  eventsLog.info('df.applications.delete', `deleted application ${application.slug} (${application.id})`, { ...ctx.logCtx, account: application.owner })

  const sessionState = ctx.sessionState
  eventsQueue.pushEvent({
    title: "Suppression d'une application",
    body: `${application.title} (${application.slug})`,
    topic: {
      key: `data-fair:application-delete:${application.id}`
    },
    sender: application.owner
  }, sessionState)

  await syncDatasets(application)
}

export const writeApplicationConfig = async (ctx: ApplicationWriteContext, application: Application, appConfig: any) => {
  const db = mongo.db
  await db.collection('applications').updateOne(
    { id: application.id },
    {
      $unset: {
        errorMessage: '',
        configurationDraft: '',
        errorMessageDraft: ''
      },
      $set: {
        configuration: appConfig,
        updatedAt: moment().toISOString(),
        updatedBy: { id: ctx.sessionState.user.id },
        lastConfigured: moment().toISOString(),
        status: 'configured'
      }
    }
  )

  eventsLog.info('df.applications.writeConfig', `wrote application config ${application.slug} (${application.id})`, { ...ctx.logCtx, account: application.owner })

  await journals.log('applications', application, { type: 'config-updated' } as Event)
  // sync the validated config and reconcile back-references against the previous configuration
  await syncDatasets({ configuration: appConfig }, application)
}

export const writeConfigDraft = async (ctx: ApplicationWriteContext, application: Application, appConfig: any) => {
  await mongo.db.collection('applications').updateOne(
    { id: application.id },
    {
      $unset: {
        errorMessageDraft: ''
      },
      $set: {
        configurationDraft: appConfig,
        updatedAt: moment().toISOString(),
        updatedBy: { id: ctx.sessionState.user.id },
        status: 'configured-draft'
      }
    }
  )
  eventsLog.info('df.applications.validateDraft', `vaidated application config draft ${application.slug} (${application.id})`, { ...ctx.logCtx, account: application.owner })

  await journals.log('applications', application, { type: 'config-draft-updated' } as Event)
}

export const deleteConfigDraft = async (ctx: ApplicationWriteContext, application: Application) => {
  await mongo.db.collection('applications').updateOne(
    { id: application.id },
    {
      $unset: {
        configurationDraft: '',
        errorMessageDraft: ''
      },
      $set: {
        updatedAt: moment().toISOString(),
        updatedBy: { id: ctx.sessionState.user.id },
        status: application.configuration ? 'configured' : 'created'
      }
    }
  )

  eventsLog.info('df.applications.cancelDraft', `cancelled application config draft ${application.slug} (${application.id})`, { ...ctx.logCtx, account: application.owner })

  await journals.log('applications', application, { type: 'config-draft-cancelled' } as Event)
}

export const getApplicationJournal = async (application: Application) => {
  const journal = await mongo.db.collection('journals').findOne({
    type: 'application',
    id: application.id,
    'owner.type': application.owner.type,
    'owner.id': application.owner.id
  })
  if (!journal) return []
  delete journal.owner
  journal.events.reverse()
  return journal.events
}

export const declareApplicationError = async (application: Application, message: string, draftMode: boolean, rawBody: any) => {
  if (draftMode) {
    // websocket notifications of draft mode errors
    await mongo.db.collection('applications').updateOne({ id: application.id }, { $set: { errorMessageDraft: message } })
    await wsEmitter.emit(`applications/${application.id}/draft-error`, rawBody)
  } else if (application.configuration) {
    await mongo.db.collection('applications').updateOne({ id: application.id }, { $set: { status: 'error', errorMessage: message } })
    await journals.log('applications', application, { type: 'error', data: rawBody.message } as Event)
  }
}

export const getApplicationKeys = async (applicationId: string) => {
  const applicationKeys = await mongo.applicationsKeys.findOne({ _id: applicationId })
  return (applicationKeys && applicationKeys.keys) || []
}

export const writeApplicationKeys = async (ctx: ApplicationWriteContext, application: Application, keys: any[]) => {
  for (const key of keys) {
    if (!key.id) key.id = nanoid()
  }
  // replaceOne with custom schema shape — the runtime doc has {_id, keys, owner} which doesn't match ApplicationKey's id/title fields
  await mongo.db.collection<{ _id: string }>('applications-keys').replaceOne({ _id: application.id }, { _id: application.id, keys, owner: applicationKeyOwner(application.owner) } as any, { upsert: true })
  clearApplicationKeysCaches()

  eventsLog.info('df.applications.writeKeys', `wrote application keys ${application.slug} (${application.id})`, { ...ctx.logCtx, account: application.owner })

  const sessionState = ctx.sessionState
  eventsQueue.pushEvent({
    title: "Définition d'une clé de protection d'application",
    body: `${application.title} (${application.slug})`,
    topic: {
      key: `data-fair:application-write-keys:${application.id}`
    },
    sender: { ...application.owner, role: 'admin' },
    resource: { type: 'application', title: application.title, id: application.id }
  }, sessionState)
}
