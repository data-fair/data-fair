import { text as stream2text } from 'node:stream/consumers'
import express from 'express'
import * as ajv from '../misc/utils/ajv.ts'
import fs from 'fs-extra'
import path from 'path'
import moment from 'moment'
import { Counter } from 'prom-client'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import pump from '../misc/utils/pipe.ts'
import mongodb from 'mongodb'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import LinkHeader from 'http-link-header'
import equal from 'deep-equal'
import slug from 'slugify'
import * as journals from '../misc/utils/journals.ts'
import axios from '../misc/utils/axios.js'
import * as esUtils from './es/index.ts'
import { initDatasetIndex, switchAlias, datasetInfos } from '../datasets/es/manage-indices.js'
import * as uploadUtils from './utils/upload.js'
import datasetAPIDocs from '../../contract/dataset-api-docs.js'
import privateDatasetAPIDocs from '../../contract/dataset-private-api-docs.ts'
import * as permissions from '../misc/utils/permissions.ts'
import * as usersUtils from '../misc/utils/users.ts'
import * as datasetUtils from './utils/index.js'
import { updateStorage, updateTotalStorage } from './utils/storage.ts'
import * as restDatasetsUtils from './utils/rest.ts'
import * as findUtils from '../misc/utils/find.js'
import clone from '@data-fair/lib-utils/clone.js'
import * as attachments from '../misc/utils/attachments.js'
import * as geo from './utils/geo.js'
import * as tiles from './utils/tiles.ts'
import * as cache from '../misc/utils/cache.js'
import * as cacheHeaders from '../misc/utils/cache-headers.js'
import * as outputs from './utils/outputs.js'
import * as limits from '../misc/utils/limits.ts'
import { extend } from './utils/extensions.ts'
import * as notifications from '../misc/utils/notifications.ts'
import userNotificationSchema from '../../contract/user-notification.js'
import { getThumbnail } from '../misc/utils/thumbnails.js'
import { bulkSearchStreams } from './utils/master-data.js'
import applicationKey from '../misc/utils/application-key.ts'
import * as observe from '../misc/utils/observe.ts'
import * as publicationSites from '../misc/utils/publication-sites.ts'
import * as clamav from '../misc/utils/clamav.ts'
import * as apiKeyUtils from '../misc/utils/api-key.ts'
import { syncDataset as syncRemoteService } from '../remote-services/utils.ts'
import { findDatasets, applyPatch, deleteDataset, createDataset, memoizedGetDataset, cancelDraft } from './service.js'
import { tableSchema, jsonSchema, getSchemaBreakingChanges, filterSchema } from './utils/data-schema.ts'
import { dir, attachmentsDir } from './utils/files.ts'
import { preparePatch } from './utils/patch.js'
import { checkStorage, lockDataset, readDataset } from './middlewares.js'
import config from '#config'
import mongo from '#mongo'
import debugModule from 'debug'
import contentDisposition from 'content-disposition'
import { internalError } from '@data-fair/lib-node/observer.js'
import { reqAdminMode, reqSession, reqSessionAuthenticated, session } from '@data-fair/lib-express'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import eventsLog from '@data-fair/lib-express/events-log.js'
import { getFlatten } from './utils/flatten.ts'
import { can } from '../misc/utils/permissions.ts'
import { emit as workerPing } from '../workers/ping.ts'

const validateUserNotification = ajv.compile(userNotificationSchema)

const router = express.Router()

const clean = datasetUtils.clean

const debugFiles = debugModule('files')
const debugLimits = debugModule('limits')

export const apiKeyMiddlewareRead = apiKeyUtils.middleware(['datasets', 'datasets-read'])
const apiKeyMiddlewareWrite = apiKeyUtils.middleware(['datasets', 'datasets-write'])
const apiKeyMiddlewareAdmin = apiKeyUtils.middleware(['datasets', 'datasets-admin'])

router.use((req, res, next) => {
  // @ts-ignore
  req.resourceType = 'datasets'
  next()
})

// Get the list of datasets
router.get('', apiKeyMiddlewareRead, cacheHeaders.listBased, async (req, res) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl
  const reqQuery = /** @type {Record<string, string>} */(req.query)

  const response = await findDatasets(mongo.db, req.getLocale(), publicationSite, publicBaseUrl, reqQuery, reqSession(req))
  for (const r of response.results) {
    datasetUtils.clean(req, r)
  }
  res.json(response)
})

router.use('/:datasetId/permissions', readDataset({ noCache: true }), apiKeyMiddlewareAdmin, permissions.router('datasets', 'dataset', async (req, patchedDataset) => {
  // this callback function is called when the resource becomes public
  await publicationSites.onPublic(patchedDataset, 'datasets', reqSessionAuthenticated(req))
}))

// retrieve a dataset by its id
router.get('/:datasetId', readDataset({ acceptInitialDraft: true, noCache: true }), apiKeyMiddlewareRead, applicationKey, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  // @ts-ignore
  const dataset = clone(req.dataset)
  res.status(200).send(clean(req, dataset))
})

// retrieve only the schema.. Mostly useful for easy select fields
const sendSchema = (req, res, schema) => {
  schema = filterSchema(schema, req.query)
  if (req.query.mimeType === 'application/tableschema+json') {
    res.setHeader('content-disposition', contentDisposition(req.dataset.slug + '-tableschema.json'))
    schema = tableSchema(schema)
  } else if (req.query.mimeType === 'application/schema+json') {
    res.setHeader('content-disposition', contentDisposition(req.dataset.slug + '-schema.json'))
    schema = jsonSchema(schema, req.publicBaseUrl, req.query.arrays !== 'true')
  } else {
    for (const field of schema) {
      field.label = field.title || field['x-originalName'] || field.key
    }
  }
  res.status(200).send(schema)
}
router.get('/:datasetId/schema', readDataset(), apiKeyMiddlewareRead, applicationKey, permissions.middleware('readSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
  sendSchema(req, res, clone(req.dataset.schema))
})
// alternate read schema route that does not return clues about the data (cardinality and enums)
router.get('/:datasetId/safe-schema', readDataset(), apiKeyMiddlewareRead, applicationKey, permissions.middleware('readSafeSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
  const schema = clone(req.dataset.schema)
  for (const p of schema) {
    delete p['x-cardinality']
    delete p.enum
  }
  sendSchema(req, res, schema)
})

const permissionsWritePublications = permissions.middleware('writePublications', 'admin')
const permissionsWriteExports = permissions.middleware('writeExports', 'admin')
const permissionsSetReadApiKey = permissions.middleware('setReadApiKey', 'admin')
const permissionsWriteDescription = permissions.middleware('writeDescription', 'write')
const debugBreakingChanges = debugModule('breaking-changes')

const descriptionBreakingKeys = ['rest', 'virtual', 'lineOwnership', 'primaryKey', 'projection', 'attachmentsAsImage', 'extensions', 'timeZone', 'slug'] // a change in these properties is considered a breaking change
const descriptionHasBreakingChanges = (req) => {
  const breakingChangeKey = descriptionBreakingKeys.find(key => key in req.body)
  if (breakingChangeKey) {
    debugBreakingChanges('breaking change on key', breakingChangeKey)
    return true
  }
  if (!req.body.schema) return false
  // TODO: some change in calculated properties should also be rejected here ?
  const breakingChanges = getSchemaBreakingChanges(req.dataset.schema, req.body.schema, true, false)
  debugBreakingChanges('breaking changes in schema ? ', breakingChanges)
  return breakingChanges.length > 0
}
const permissionsWriteDescriptionBreaking = permissions.middleware('writeDescriptionBreaking', 'write')
const permissionsManageMasterData = permissions.canDoForOwnerMiddleware('manageMasterData', true)

// Update a dataset's metadata
router.patch('/:datasetId',
  readDataset({
    acceptedStatuses: (patch, dataset) => {
      // accept different statuses of the dataset depending on the content of the patch
      if (!dataset.isMetaOnly && (patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection)) {
        return ['finalized', 'error']
      } else {
        return null
      }
    }
  }),
  apiKeyMiddlewareWrite,
  lockDataset((/** @type {any} */ patch) => {
    return !!(patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection)
  }),
  (req, res, next) => req.body.masterData ? permissionsManageMasterData(req, res, next) : next(),
  (req, res, next) => descriptionHasBreakingChanges(req) ? permissionsWriteDescriptionBreaking(req, res, next) : permissionsWriteDescription(req, res, next),
  (req, res, next) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
  (req, res, next) => req.body.exports ? permissionsWriteExports(req, res, next) : next(),
  (req, res, next) => req.body.readApiKey ? permissionsSetReadApiKey(req, res, next) : next(),
  async (req, res) => {
    // @ts-ignore
    const dataset = req.dataset

    const locale = req.getLocale()
    const sessionState = reqSessionAuthenticated(req)

    const { body: patch } = (await import('#doc/datasets/patch-req/index.js')).returnValid(req)

    const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(req.app, patch, dataset, sessionState, locale)

    if (!isEmpty) {
      await publicationSites.applyPatch(dataset, { ...dataset, ...patch }, sessionState, 'datasets')
      await applyPatch(dataset, patch, removedRestProps, attemptMappingUpdate)
        .catch(err => {
          if (err.code !== 11000) throw err
          throw httpError(400, req.__('errors.dupSlug'))
        })

      if (patch.status && patch.status !== 'indexed' && patch.status !== 'finalized' && patch.status !== 'validation-updated') {
        await journals.log('datasets', dataset, { type: 'structure-updated' })
        await notifications.sendResourceEvent('datasets', dataset, sessionState, 'structure-updated', { extra: { patch: Object.keys(patch).join(', ') } })
      }

      eventsLog.info('df.datasets.patch', `patched dataset ${dataset.slug} (${dataset.id}), keys=${JSON.stringify(Object.keys(patch))}`, { req, account: dataset.owner })

      const draft = !!dataset.draftReason
      eventsQueue.pushEvent({
        title: `Propriétés modifiées sur un ${draft ? 'brouillon de ' : ''}jeu de données`,
        body: `${draft ? 'brouillon ' : ''}${dataset.title} (${dataset.slug}), ${Object.keys(patch)?.join(', ')}`,
        topic: {
          key: `data-fair:dataset${draft ? '-draft' : ''}-patched-properties:${dataset.id}`
        },
        sender: dataset.owner,
        resource: { type: 'dataset', title: dataset.title, id: dataset.id }
      }, sessionState)

      await syncRemoteService(dataset)
    }

    res.status(200).json(clean(req, dataset))
  })

// Change ownership of a dataset
router.put('/:datasetId/owner', readDataset({ noCache: true }), apiKeyMiddlewareAdmin, permissions.middleware('changeOwner', 'admin'), async (req, res) => {
  // @ts-ignore
  const dataset = req.dataset

  const sessionState = reqSessionAuthenticated(req)

  // Must be able to delete the current dataset, and to create a new one for the new owner to proceed
  if (!sessionState.user.adminMode) {
    if (req.body.type === 'user' && req.body.id !== sessionState.user.id) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
    if (req.body.type === 'organization') {
      const userOrg = sessionState.user.organizations.find(o => o.id === req.body.id)
      if (!userOrg) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
      if (![config.contribRole, config.adminRole].includes(userOrg.role)) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
    }
  }

  if (req.body.type !== req.dataset.owner.type && req.body.id !== req.dataset.owner.id) {
    const remaining = await limits.remaining(req.body)
    if (remaining.nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/changeOwner', { owner: req.body, remaining })
      return res.status(429).type('text/plain').send(req.__('errors.exceedLimitNbDatasets'))
    }
    if (req.dataset.storage) {
      if (remaining.storage !== -1 && remaining.storage < req.dataset.storage.size) {
        debugLimits('exceedLimitStorage/changeOwner', { owner: req.body, remaining, storage: req.dataset.storage })
        return res.status(429).type('text/plain').send(req.__('errors.exceedLimitStorage'))
      }
      if (remaining.indexed !== -1 && req.dataset.storage.indexed && remaining.indexed < req.dataset.storage.indexed.size) {
        debugLimits('exceedLimitIndexed/changeOwner', { owner: req.body, remaining, storage: req.dataset.storage })
        return res.status(429).type('text/plain').send(req.__('errors.exceedLimitIndexed'))
      }
    }
  }

  const patch = {
    owner: req.body,
    updatedBy: { id: sessionState.user.id, name: sessionState.user.name },
    updatedAt: moment().toISOString()
  }

  const sameOrg = dataset.owner.type === 'organization' && dataset.owner.type === req.body.type && dataset.owner.id === req.body.id
  if (sameOrg && !dataset.owner.department && req.body.department) {
    // moving from org root to a department, we keep the publicationSites
  } else {
    patch.publicationSites = []
  }
  if (!sameOrg && req.body.publications) {
    patch.publications = []
  }

  const preservePermissions = (dataset.permissions || []).filter(p => {
    // keep public permissions
    if (!p.type) return true
    if (sameOrg) {
      // keep individual user permissions (user partners)
      if (p.type === 'user') return true
      // keep permissions to external org (org partners)
      if (p.type === 'organization' && p.id !== dataset.owner.id) return true
    }
    return false
  })
  await permissions.initResourcePermissions(patch, preservePermissions)

  const patchedDataset = await mongo.db.collection('datasets')
    .findOneAndUpdate({ id: req.dataset.id }, { $set: patch }, { returnDocument: 'after' })

  // Move all files
  if (dir(req.dataset) !== dir(patchedDataset)) {
    try {
      await fs.move(dir(req.dataset), dir(patchedDataset))
    } catch (err) {
      console.warn('Error while moving dataset directory', err)
    }
  }

  const arrowStr = `${dataset.owner.name} (${dataset.owner.type}:${dataset.owner.id}) -> ${patch.owner.name} (${patch.owner.type}:${patch.owner.id})`
  const eventLogMessage = `changed dataset owner ${dataset.slug} (${dataset.id}), ${arrowStr}`

  eventsLog.info('df.datasets.changeOwnerFrom', eventLogMessage, { req, account: dataset.owner })
  eventsLog.info('df.datasets.changeOwnerTo', eventLogMessage, { req, account: patch.owner })
  const event = {
    title: 'Changement de propriétaire d\'un jeu de données',
    body: `${dataset.title} (${dataset.slug}), ${arrowStr}`,
    topic: {
      key: `data-fair:dataset-change-owner:${dataset.id}`
    },
    resource: { type: 'dataset', title: dataset.title, id: dataset.id },
    sender: { ...dataset.owner, role: 'admin' }
  }
  eventsQueue.pushEvent(event, sessionState)
  eventsQueue.pushEvent({ ...event, sender: { ...patch.owner, admin: true } }, sessionState)

  await syncRemoteService(patchedDataset)

  await updateTotalStorage(dataset.owner)
  await updateTotalStorage(patch.owner)

  res.status(200).json(clean(req, patchedDataset))
})

// Delete a dataset
router.delete('/:datasetId', readDataset({ acceptedStatuses: ['*'], alwaysDraft: true }), apiKeyMiddlewareAdmin, permissions.middleware('delete', 'admin'), async (req, res) => {
  // @ts-ignore
  const dataset = req.dataset
  // @ts-ignore
  const datasetFull = req.datasetFull

  await deleteDataset(req.app, dataset)
  if (dataset.draftReason && datasetFull.status !== 'draft') {
    await deleteDataset(req.app, datasetFull)
  }

  eventsLog.info('df.datasets.delete', `dataset deleted ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })
  const sessionState = await session.req(req)
  eventsQueue.pushEvent({
    title: 'Jeu de données supprimé',
    body: `${dataset.title} (${dataset.slug})`,
    topic: {
      key: `data-fair:dataset-delete:${dataset.id}`
    },
    sender: dataset.owner
  }, sessionState)

  await syncRemoteService({ ...datasetFull, masterData: null })
  await updateTotalStorage(datasetFull.owner)
  res.sendStatus(204)
})

// Create a dataset
const createDatasetRoute = async (req, res) => {
  const db = mongo.db
  const es = req.app.get('es')
  const locale = req.getLocale()
  const sessionState = reqSessionAuthenticated(req)
  const draft = req.query.draft === 'true'

  /** @type {undefined | any[]} */
  const files = await uploadUtils.getFiles(req, res)

  try {
    if (files) {
      await clamav.checkFiles(files, sessionState.user)
      debugFiles('POST datasets uploaded some files', files)
    }

    req.body = uploadUtils.getFormBody(req.body)
    const { body } = (await import('#doc/datasets/post-req/index.js')).returnValid(req)

    const owner = usersUtils.owner(req)
    if (!permissions.canDoForOwner(owner, 'datasets', 'post', sessionState)) {
      throw httpError(403, req.__('errors.missingPermission'))
    }
    if ((await limits.remaining(owner)).nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/beforeUpload', { owner })
      throw httpError(429, req.__('errors.exceedLimitNbDatasets'))
    }

    // this is kept for retro-compatibility, but we should think of deprecating it
    // self chosen ids are not a good idea
    // there is a reason why we use a unique id generator and a slug system)
    if (req.params.datasetId) {
      if (!req.params.datasetId.match(/^[a-z0-9_\\-]+$/)) {
        throw httpError(400, req.__('errors.urlFriendly', { value: req.params.datasetId, slug: slug(req.params.datasetId, { lower: true, strict: true }) }))
      }
      body.id = req.params.datasetId
    }

    /**
     * @param {() => void} callback
     */
    const onClose = (callback) => res.on('close', callback)
    res.setMaxListeners(100)

    const dataset = await createDataset(db, es, locale, sessionState, owner, body, files, draft, onClose)

    if (dataset.isRest && dataset.status === 'finalized') {
      // case where we simply initialize the empty dataset
      // being empty this is not costly and can be performed by the API
      await restDatasetsUtils.initDataset(dataset)
      const indexName = await initDatasetIndex(dataset)
      await switchAlias(dataset, indexName)
      await restDatasetsUtils.configureHistory(dataset)
      await updateStorage(dataset)
      onClose(() => {
        // this is only to maintain compatibilty, but clients should look for the status in the response
        // and not wait for an event if the dataset is created already finalized
        journals.log('datasets', dataset, { type: 'finalize-end' }).catch(err => {
          console.error('failure when send finalize-end to journal after rest dataset creation', err)
        })
      })
    }
    if (dataset.isMetaOnly) {
      await updateStorage(dataset)
    }

    eventsLog.info('df.datasets.create', `created a dataset ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })

    await journals.log('datasets', dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id })
    await notifications.sendResourceEvent('datasets', dataset, sessionState, 'dataset-created')
    await syncRemoteService(dataset)

    await workerPing('datasets', dataset.id)

    res.status(201).send(clean(req, dataset, draft))
  } catch (err) {
    if (files) {
      for (const file of files) await fs.remove(file.path)
    }
    throw err
  }
}
router.post('', apiKeyMiddlewareWrite, checkStorage(true, true), createDatasetRoute)

const updateDatasetRoute = async (req, res, next) => {
  // @ts-ignore
  const dataset = req.dataset

  if (!dataset) {
    await createDatasetRoute(req, res, next)
    return
  }

  // force the file upload middleware to write files in draft directory, as updated datasets always go into draft mode
  req._draft = true

  const locale = req.getLocale()
  const sessionState = reqSessionAuthenticated(req)

  const files = await uploadUtils.getFiles(req, res)

  try {
    if (files) {
      await clamav.checkFiles(files, sessionState.user)
    }

    req.body = uploadUtils.getFormBody(req.body)

    // this is also done inside preparePatch
    // but in the case of PUT we do it here to tolerate properties usually used at creation time
    for (const key of Object.keys(req.body)) {
      if (equal(req.body[key], dataset[key])) { delete req.body[key] }
    }
    if (req.body.owner && req.body.owner.type === dataset.owner.type && req.body.owner.id === dataset.owner.id) {
      delete req.body.owner
    }

    const { body: patch } = (await import('#doc/datasets/patch-req/index.js')).returnValid(req)

    // TODO: do not use always as default value when the dataset is public or published ?
    const canBreak = can('datasets', req.dataset, 'writeDescriptionBreaking', reqSession(req))
    let draftValidationMode
    if (req.datasetFull.status === 'draft') {
      draftValidationMode = 'never'
    } else {
      if (req.query.draft === 'true') {
        if ((patch.schema ?? dataset.schema).find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) draftValidationMode = 'never'
        else draftValidationMode = 'compatible'
      } else {
        draftValidationMode = req.query.draft ?? 'always'
      }
    }

    if (!['never', 'always', 'compatible', 'compatibleOrCancel'].includes(draftValidationMode)) throw httpError(400, `unknown value for draft validation mode ${draftValidationMode}`)
    if (!canBreak && draftValidationMode === 'always') throw httpError(403, 'draft mode "always" is not permitted')

    const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(req.app, patch, dataset, sessionState, locale, draftValidationMode, files)
      .catch(err => {
        if (err.code !== 11000) throw err
        throw httpError(400, req.__('errors.dupSlug'))
      })

    if (!isEmpty) {
      await publicationSites.applyPatch(dataset, { ...dataset, ...patch }, sessionState, 'datasets')
      await applyPatch(dataset, patch, removedRestProps, attemptMappingUpdate)

      eventsLog.info('df.datasets.update', `updated dataset ${dataset.slug} (${dataset.id}) keys ${JSON.stringify(Object.keys(patch))}`, { req, account: dataset.owner })

      const draft = !!dataset.draftReason
      eventsQueue.pushEvent({
        title: `Propriétés modifiées sur un ${draft ? 'brouillon de ' : ''}jeu de données`,
        body: `${draft ? 'brouillon ' : ''}${dataset.title} (${dataset.slug}), ${Object.keys(patch)?.join(', ')}`,
        topic: {
          key: `data-fair:dataset${draft ? '-draft' : ''}-patched-properties:${dataset.id}`
        },
        sender: dataset.owner,
        resource: { type: 'dataset', title: dataset.title, id: dataset.id }
      }, sessionState)

      if (files) {
        await journals.log('datasets', dataset, { type: 'data-updated' })
        await notifications.sendResourceEvent('datasets', dataset, sessionState, 'data-updated')
      }
      await syncRemoteService(dataset)
    }
  } catch (err) {
    if (files) {
      for (const file of files) await fs.remove(file.path)
    }
    throw err
  }

  res.status(200).json(clean(req, dataset))
}

router.post('/:datasetId', lockDataset(), readDataset({ acceptedStatuses: ['finalized', 'error'], acceptMissing: true }), apiKeyMiddlewareWrite, permissions.middleware('writeData', 'write', null, true), checkStorage(true, true), updateDatasetRoute)
router.put('/:datasetId', lockDataset(), readDataset({ acceptedStatuses: ['finalized', 'error'], acceptMissing: true }), apiKeyMiddlewareWrite, permissions.middleware('writeData', 'write', null, true), checkStorage(true, true), updateDatasetRoute)

// validate the draft
// TODO: apply different permission if draft has breaking changes or not
router.post('/:datasetId/draft', readDataset({ acceptedStatuses: ['finalized'], alwaysDraft: true }), apiKeyMiddlewareWrite, permissions.middleware('validateDraft', 'write'), lockDataset(), async (req, res, next) => {
  // @ts-ignore
  const dataset = req.dataset
  const sessionState = reqSession(req)

  if (!req.datasetFull.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }

  const patch = { status: 'validated', validateDraft: true }
  await applyPatch(dataset, patch)
  await journals.log('datasets', dataset, { type: 'draft-validated', data: 'validation manuelle' })
  await notifications.sendResourceEvent('datasets', dataset, sessionState, 'draft-validated', { localizedParams: { cause: { fr: 'validation manuelle', en: 'manual validation' } } })
  eventsLog.info('df.datasets.validateDraft', `validated dataset draft ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })

  return res.send(dataset)
})

// cancel the draft
router.delete('/:datasetId/draft', readDataset({ acceptedStatuses: ['draft', 'finalized', 'error'], alwaysDraft: true }), apiKeyMiddlewareWrite, permissions.middleware('cancelDraft', 'write'), lockDataset(), async (req, res, next) => {
  // @ts-ignore
  const dataset = req.dataset
  const sessionState = reqSession(req)
  // @ts-ignore
  const datasetFull = req.datasetFull

  if (datasetFull.status === 'draft') {
    return res.status(409).send('Impossible d\'annuler un brouillon si aucune version du jeu de données n\'a été validée.')
  }
  if (!datasetFull.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  const patch = { draft: null }
  await cancelDraft(dataset)
  await applyPatch(datasetFull, patch)
  await journals.log('datasets', dataset, { type: 'draft-cancelled' }, false, sessionState)

  eventsLog.info('df.datasets.cancelDraft', `cancelled dataset draft ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })
  await notifications.sendResourceEvent('datasets', dataset, sessionState, 'draft-cancelled')

  await updateStorage(datasetFull)

  return res.send(datasetFull)
})

// CRUD operations for REST datasets
function isRest (req, res, next) {
  if (!req.dataset.isRest) {
    return res.status(501)
      .send('Les opérations de modifications sur les lignes sont uniquement accessibles pour les jeux de données éditables.')
  }
  next()
}

const readWritableDataset = readDataset({ acceptedStatuses: ['finalized', 'indexed', 'error'] })
router.get('/:datasetId/lines/:lineId', readDataset(), isRest, apiKeyMiddlewareRead, permissions.middleware('readLine', 'read', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readLine)
router.post('/:datasetId/lines', readWritableDataset, isRest, applicationKey, apiKeyMiddlewareWrite, permissions.middleware('createLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, restDatasetsUtils.createOrUpdateLine)
router.put('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, permissions.middleware('updateLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, restDatasetsUtils.createOrUpdateLine)
router.patch('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, permissions.middleware('patchLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, restDatasetsUtils.patchLine)
router.post('/:datasetId/_bulk_lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), checkStorage(false), restDatasetsUtils.uploadBulk, restDatasetsUtils.bulkLines)
router.delete('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, permissions.middleware('deleteLine', 'write'), restDatasetsUtils.deleteLine)
router.get('/:datasetId/lines/:lineId/revisions', readWritableDataset, isRest, apiKeyMiddlewareRead, permissions.middleware('readLineRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readRevisions)
router.get('/:datasetId/revisions', readWritableDataset, isRest, apiKeyMiddlewareRead, permissions.middleware('readRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readRevisions)
router.delete('/:datasetId/lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, permissions.middleware('deleteAllLines', 'write'), restDatasetsUtils.deleteAllLines)
router.post('/:datasetId/_sync_attachments_lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), restDatasetsUtils.syncAttachmentsLines)

// specific routes with rest datasets with lineOwnership activated
router.use('/:datasetId/own/:owner', readWritableDataset, isRest, apiKeyUtils.middleware(['datasets']), (req, res, next) => {
  const sessionState = reqSessionAuthenticated(req)
  if (!req.dataset.rest?.lineOwnership) {
    return res.status(501)
      .send('Les opérations de gestion des lignes par propriétaires ne sont pas supportées pour ce jeu de données.')
  }
  const [type, id, department] = req.params.owner.split(':')
  req.linesOwner = { type, id, department }
  if (!['organization', 'user'].includes(req.linesOwner.type)) return res.status(400).type('text/plain').send('ownerType must be user or organization')
  if (req.linesOwner.type === 'organization' && sessionState.account.type === 'organization' && sessionState.account.id === req.linesOwner.id && (sessionState.account.department || null) === (req.linesOwner.department || null)) {
    req.linesOwner.name = sessionState.account.name
    return next()
  }
  if (req.linesOwner.type === 'user' && sessionState.user.id === req.linesOwner.id) {
    req.linesOwner.name = sessionState.user.name
    return next()
  }
  if (sessionState.user.adminMode) return next()
  res.status(403).type('text/plain').send('only owner can manage his own lines')
})
router.get('/:datasetId/own/:owner/lines/:lineId', readDataset(), isRest, applicationKey, permissions.middleware('readOwnLine', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readLine)
router.post('/:datasetId/own/:owner/lines', readWritableDataset, isRest, applicationKey, permissions.middleware('createOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, restDatasetsUtils.createOrUpdateLine)
router.put('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('updateOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, restDatasetsUtils.createOrUpdateLine)
router.patch('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('patchOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, restDatasetsUtils.patchLine)
router.post('/:datasetId/own/:owner/_bulk_lines', lockDataset((body, query) => query.lock === 'true'), readWritableDataset, isRest, applicationKey, permissions.middleware('bulkOwnLines', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadBulk, restDatasetsUtils.bulkLines)
router.delete('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('deleteOwnLine', 'manageOwnLines'), restDatasetsUtils.deleteLine)
router.get('/:datasetId/own/:owner/lines/:lineId/revisions', readWritableDataset, isRest, applicationKey, permissions.middleware('readOwnLineRevisions', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readRevisions)
router.get('/:datasetId/own/:owner/revisions', readWritableDataset, isRest, applicationKey, permissions.middleware('readOwnRevisions', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readRevisions)

// Specific routes for datasets with masterData functionalities enabled
router.get('/:datasetId/master-data/single-searchs/:singleSearchId', readDataset({ fillDescendants: true }), apiKeyMiddlewareRead, permissions.middleware('readLines', 'read', 'readDataAPI'), async (req, res) => {
  const singleSearch = req.dataset.masterData && req.dataset.masterData.singleSearchs && req.dataset.masterData.singleSearchs.find(ss => ss.id === req.params.singleSearchId)
  if (!singleSearch) return res.status(404).send(`Recherche unitaire "${req.params.singleSearchId}" inconnue`)

  let esResponse
  let select = singleSearch.output.key
  if (singleSearch.label) select += ',' + singleSearch.label.key
  const params = { q: req.query.q, size: req.query.size, q_mode: 'complete', select }
  const qs = []

  if (singleSearch.filters) {
    for (const f of singleSearch.filters) {
      if (f.property?.key && f.values?.length) {
        qs.push(f.values.map(value => `(${esUtils.escapeFilter(f.property.key)}:"${esUtils.escapeFilter(value)}")`).join(' OR '))
      }
    }
  }
  if (qs.length) params.qs = qs.map(f => `(${f})`).join(' AND ')
  try {
    esResponse = await esUtils.search(req.app.get('es'), req.dataset, params)
  } catch (err) {
    await manageESError(req, err)
  }
  const flatten = getFlatten(req.dataset)
  const result = {
    total: esResponse.hits.total.value,
    results: esResponse.hits.hits.map(hit => {
      const item = esUtils.prepareResultItem(hit, req.dataset, req.query, flatten, req.publicBaseUrl)
      let label = item[singleSearch.output.key]
      if (singleSearch.label && item[singleSearch.label.key]) label += ` (${item[singleSearch.label.key]})`
      return { output: item[singleSearch.output.key], label, score: item._score || undefined }
    })
  }
  res.send(result)
})
router.post('/:datasetId/master-data/bulk-searchs/:bulkSearchId', readDataset({ fillDescendants: true }), apiKeyMiddlewareRead, permissions.middleware('bulkSearch', 'read'), async (req, res) => {
  // no buffering of this response in the reverse proxy
  res.setHeader('X-Accel-Buffering', 'no')
  const flatten = getFlatten(req.dataset)
  await pump(
    req,
    ...await bulkSearchStreams(req.dataset, req.get('Content-Type'), req.params.bulkSearchId, req.query.select, flatten),
    res
  )
})

const esQueryErrorCounter = new Counter({
  name: 'df_es_query_error',
  help: 'Errors in elasticearch queries'
})

// Error from ES backend should be stored in the journal
async function manageESError (req, err) {
  const { message, status } = esUtils.extractError(err)
  if (status === 400) {
    // console.error(`(es-query-${status}) elasticsearch query error ${req.dataset.id}`, req.originalUrl, status, req.headers.referer || req.headers.referrer, message, err.stack)
    esQueryErrorCounter.inc()
  } else {
    internalError('es-query-' + status, err)
  }

  // We used to store an error on the data whenever a dataset encountered an elasticsearch error
  // but this can end up storing too many errors when the cluster is in a bad state
  // revert to simply logging
  // if (req.dataset.status === 'finalized' && err.statusCode >= 404 && errBody.type !== 'search_phase_execution_exception') {
  // await mongo.db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'error' } })
  // await journals.log(req.dataset, { type: 'error', data: message })
  // }
  throw httpError(status, message)
}

// used later to count items in a tile or tile's neighbor
async function countWithCache (req, db, query) {
  if (config.cache.disabled) return esUtils.count(req.dataset, query)
  return cache.getSet({
    type: 'tile-count',
    datasetId: req.dataset.id,
    finalizedAt: req.dataset.finalizedAt,
    query
  }, async () => {
    return esUtils.count(req.dataset, query)
  })
}

// Read/search data for a dataset
const readLines = async (req, res) => {
  observe.reqRouteName(req, `${req.route.path}?format=${req.query.format || 'json'}`)
  observe.reqStep(req, 'middlewares')
  const db = mongo.db
  res.throttleEnd()

  // if the output format is geo make sure geoshape is present
  // also manage a default content for geo tiles
  const query = { ...req.query }

  // case of own lines query
  if (req.params.owner) query.owner = req.params.owner

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(query.format)

  let xyz
  if (vectorTileRequested) {
    // sorting by rand provides more homogeneous distribution in tiles
    query.sort = query.sort || '_rand'
    if (!query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
    xyz = query.xyz.split(',').map(Number)
  }
  const defaultSampling = req.dataset.schema.find(p => p.key === '_geoshape')?.['x-capabilities']?.vtPrepare ? 'max' : 'neighbors'
  const sampling = query.sampling || defaultSampling
  if (!['max', 'neighbors'].includes(sampling)) return res.status(400).type('text/plain').send('Sampling can be "max" or "neighbors"')

  const geoshapeProp = req.dataset.schema.find(p => p.key === '_geoshape')
  const vtPrepared = vectorTileRequested && xyz[2] <= config.tiles.vtPrepareMaxZoom && geoshapeProp?.['x-capabilities']?.vtPrepare

  if (['geojson', 'mvt', 'vt', 'pbf'].includes(query.format)) {
    const select = (query.select ? query.select.split(',') : tiles.defaultSelect(req.dataset))
    if (!vtPrepared && !select.includes('_geoshape') && geoshapeProp) {
      select.push('_geoshape')
    }
    if (!select.includes('_geopoint')) select.push('_geopoint')
    query.select = select.join(',')
  }

  if (vectorTileRequested) {
    // default is smaller (see es/commons) for other format, but we want filled tiles by default
    if (!('size' in query)) query.size = config.elasticsearch.maxPageSize + ''
  }

  if (query.format === 'wkt') {
    if (geoshapeProp) query.select = '_geoshape'
    else query.select = '_geopoint'
  }

  observe.reqStep(req, 'prepare')

  // Is the tile cached ?
  let cacheHash
  const useVTCache = vectorTileRequested && !config.cache.disabled && !(config.cache.reverseProxyCache && req.publicOperation && req.query.finalizedAt)
  if (useVTCache) {
    const { hash, value } = await cache.get({
      type: 'tile',
      sampling,
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query
    })
    observe.reqStep(req, 'checkTileCache')
    if (value) {
      res.type('application/x-protobuf')
      res.setHeader('x-tilesmode', 'cache/' + sampling)
      res.throttleEnd('static')
      if (value.count && value.total) res.setHeader('x-tilesampling', value.count + '/' + value.total)
      return res.status(200).send(value.tile ? value.tile.buffer : value.buffer)
    }
    cacheHash = hash
  }

  let tilesMode = 'es/' + sampling
  if (vectorTileRequested) {
    const requestedSize = Number(query.size)
    if (sampling === 'neighbors') {
      // count docs in neighboring tiles to perform intelligent sampling
      try {
        const mainCount = await countWithCache(req, db, query)
        if (mainCount === 0) return res.status(204).send()
        if (mainCount <= requestedSize / 20) {
          // no sampling on low density tiles
          query.size = requestedSize
        } else {
          const neighborsCounts = await Promise.all([
            // the 4 that share an edge
            countWithCache(req, db, { ...query, xyz: [xyz[0] - 1, xyz[1], xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0] + 1, xyz[1], xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0], xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0], xyz[1] + 1, xyz[2]].join(',') }),
            // Using corners also yields better results
            countWithCache(req, db, { ...query, xyz: [xyz[0] - 1, xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0] + 1, xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0] - 1, xyz[1] + 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0] + 1, xyz[1] + 1, xyz[2]].join(',') })
          ])
          const maxCount = Math.max(mainCount, ...neighborsCounts)
          const sampleRate = requestedSize / Math.max(requestedSize, maxCount)
          const sizeFilter = mainCount * sampleRate
          query.size = Math.min(sizeFilter, requestedSize)
        }
      } catch (err) {
        await manageESError(req, err)
      }

      tilesMode += '/' + query.size
      observe.reqStep(req, 'neighborsSampling')
    }
  }

  // eslint-disable-next-line no-unused-vars
  const [_, size] = findUtils.pagination(query)

  let esResponse
  if (vectorTileRequested && sampling === 'max' && !query.collapse) {
    let previousEsResponse
    let totalLength = 0
    for (let i = 0; i < 4; i++) {
      if (previousEsResponse) {
        if (size && previousEsResponse.hits.hits.length === size && totalLength < 10000000) {
          const lastHit = previousEsResponse.hits.hits[previousEsResponse.hits.hits.length - 1]
          query.after = JSON.stringify(lastHit.sort).slice(1, -1)
        } else {
          break
        }
      }
      try {
        previousEsResponse = await esUtils.search(req.app.get('es'), req.dataset, query, req.publicBaseUrl, vtPrepared && xyz.join('-'))
      } catch (err) {
        await manageESError(req, err)
        break
      }
      totalLength += previousEsResponse.contentLength

      if (!esResponse) esResponse = previousEsResponse
      else esResponse.hits.hits = esResponse.hits.hits.concat(previousEsResponse.hits.hits)
    }
  } else {
    try {
      esResponse = await esUtils.search(req.app.get('es'), req.dataset, query, req.publicBaseUrl, vtPrepared && xyz.join('-'))
    } catch (err) {
      await manageESError(req, err)
    }
  }
  observe.reqStep(req, 'search')

  // manage pagination based on search_after, cd https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html

  let nextLinkURL
  if (size && esResponse.hits.hits.length === size) {
    nextLinkURL = new URL(`${req.publicBaseUrl}/api/v1/datasets/${req.dataset.id}/lines`)
    for (const key of Object.keys(query)) {
      if (key !== 'page') nextLinkURL.searchParams.set(key, query[key])
    }
    const lastHit = esResponse.hits.hits[esResponse.hits.hits.length - 1]
    nextLinkURL.searchParams.set('after', JSON.stringify(lastHit.sort).slice(1, -1))
    const link = new LinkHeader()
    link.set({ rel: 'next', uri: nextLinkURL.href })
    res.set('Link', link.toString())
  }

  if (query.format === 'geojson') {
    const flatten = getFlatten(req.dataset, true)
    const geojson = geo.result2geojson(esResponse, flatten)
    observe.reqStep(req, 'result2geojson')
    // geojson format benefits from bbox info
    geojson.bbox = (await esUtils.bboxAgg(req.dataset, { ...query })).bbox
    observe.reqStep(req, 'bboxAgg')
    res.setHeader('content-disposition', contentDisposition(req.dataset.slug + '.geojson'))
    return res.status(200).send(geojson)
  }

  if (query.format === 'wkt') {
    const wkt = geo.result2wkt(esResponse)
    observe.reqStep(req, 'result2wkt')
    res.setHeader('content-disposition', contentDisposition(req.dataset.slug + '.wkt'))
    return res.status(200).send(wkt)
  }

  if (vectorTileRequested) {
    if (!esResponse.hits.hits.length) return res.status(204).send()
    const flatten = getFlatten(req.dataset, true)
    const tile = await tiles.geojson2pbf(geo.result2geojson(esResponse, flatten), xyz, vtPrepared)
    if (vtPrepared) tilesMode += '/prepared'
    observe.reqStep(req, 'geojson2pbf')
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (useVTCache) cache.set(cacheHash, { tile: new mongodb.Binary(tile), count: esResponse.hits.hits.length, total: esResponse.hits.total.value })
    res.setHeader('x-tilesmode', tilesMode)
    res.setHeader('x-tilesampling', esResponse.hits.hits.length + '/' + esResponse.hits.total.value)
    return res.status(200).send(tile)
  }

  const result = { total: esResponse.hits.total.value }
  if (nextLinkURL) result.next = nextLinkURL.href
  if (query.collapse) result.totalCollapse = esResponse.aggregations.totalCollapse.value
  result.results = []
  const flatten = getFlatten(req.dataset, req.query.arrays === 'true')
  for (let i = 0; i < esResponse.hits.hits.length; i++) {
    // avoid blocking the event loop
    if (i % 500 === 499) await new Promise(resolve => setTimeout(resolve, 0))
    result.results.push(esUtils.prepareResultItem(esResponse.hits.hits[i], req.dataset, query, flatten, req.publicBaseUrl))
  }

  observe.reqStep(req, 'prepareResultItems')

  if (query.format === 'csv') {
    const csv = await outputs.results2csv(req, result.results)
    observe.reqStep(req, 'results2csv')
    res.setHeader('content-disposition', contentDisposition(req.dataset.slug + '.csv'))
    return res.status(200).send(csv)
  }

  if (query.format === 'xlsx') {
    JSON.stringify(result.results)
    observe.reqStep(req, 'stringify')
    const sheet = await outputs.results2sheet(req, result.results)
    observe.reqStep(req, 'results2xlsx')
    res.setHeader('content-disposition', contentDisposition(req.dataset.slug + '.xlsx'))
    return res.status(200).send(sheet)
  }
  if (query.format === 'ods') {
    const sheet = await outputs.results2sheet(req, result.results, 'ods')
    observe.reqStep(req, 'results2ods')
    res.setHeader('content-disposition', contentDisposition(req.dataset.slug + '.ods'))
    return res.status(200).send(sheet)
  }

  res.status(200).send(result)
}
router.get('/:datasetId/lines', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('readLines', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), readLines)
router.get('/:datasetId/own/:owner/lines', readDataset({ fillDescendants: true }), isRest, applicationKey, apiKeyMiddlewareRead, permissions.middleware('readOwnLines', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, readLines)

// Special geo aggregation
router.get('/:datasetId/geo_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getGeoAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  res.throttleEnd()

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(req.query.format)
  // Is the tile cached ?
  let cacheHash
  const useVTCache = vectorTileRequested && !config.cache.disabled && !(config.cache.reverseProxyCache && req.publicOperation && req.query.finalizedAt)
  if (useVTCache) {
    const { hash, value } = await cache.get({
      type: 'tile-geoagg',
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query: req.query
    })
    if (value) return res.status(200).send(value.buffer)
    cacheHash = hash
  }
  let result
  const flatten = getFlatten(req.dataset, req.query.arrays === 'true')
  try {
    result = await esUtils.geoAgg(req.app.get('es'), req.dataset, req.query, req.publicBaseUrl, flatten)
  } catch (err) {
    await manageESError(req, err)
  }

  if (req.query.format === 'geojson') {
    const geojson = geo.aggs2geojson(result)
    geojson.bbox = (await esUtils.bboxAgg(req.dataset, { ...req.query })).bbox
    return res.status(200).send(geojson)
  }

  if (vectorTileRequested) {
    if (!req.query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
    const tile = await tiles.geojson2pbf(geo.aggs2geojson(result), req.query.xyz.split(',').map(Number))
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (useVTCache) cache.set(cacheHash, new mongodb.Binary(tile))
    return res.status(200).send(tile)
  }

  res.status(200).send(result)
})

// Standard aggregation to group items by value and perform an optional metric calculation on each group
router.get('/:datasetId/values_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getValuesAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  res.throttleEnd()
  const sessionState = reqSession(req)

  /** @type {object | null} */
  const explain = req.query.explain === 'true' && sessionState.user && (sessionState.user.isAdmin || sessionState.user.asAdmin) ? {} : null

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(req.query.format)
  const useVTCache = vectorTileRequested && !config.cache.disabled && !(config.cache.reverseProxyCache && req.publicOperation && req.query.finalizedAt)
  // Is the tile cached ?
  let cacheHash
  if (vectorTileRequested && useVTCache) {
    const { hash, value } = await cache.get({
      type: 'tile-valuesagg',
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query: req.query
    })
    if (value) return res.status(200).send(value.buffer)
    cacheHash = hash
  }

  let result
  const flatten = getFlatten(req.dataset, req.query.arrays === 'true')
  try {
    result = await esUtils.valuesAgg(req.dataset, { ...req.query }, vectorTileRequested || req.query.format === 'geojson', req.publicBaseUrl, explain, flatten)
    if (result.next) {
      const nextLinkURL = new URL(`${req.publicBaseUrl}/api/v1/datasets/${req.dataset.id}/values_agg`)
      for (const key of Object.keys(req.query)) {
        nextLinkURL.searchParams.set(key, req.query[key])
      }
      for (const key of Object.keys(result.next)) {
        nextLinkURL.searchParams.set(key, result.next[key])
      }
      const link = new LinkHeader()
      link.set({ rel: 'next', uri: nextLinkURL.href })
      res.set('Link', link.toString())
      result.next = nextLinkURL.href
    }
  } catch (err) {
    await manageESError(req, err)
  }

  if (req.query.format === 'geojson') {
    const geojson = geo.aggs2geojson(result)
    geojson.bbox = (await esUtils.bboxAgg(req.dataset, { ...req.query })).bbox
    return res.status(200).send(geojson)
  }

  if (vectorTileRequested) {
    if (!req.query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
    const tile = await tiles.geojson2pbf(geo.aggs2geojson(result), req.query.xyz.split(',').map(Number))
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (useVTCache) cache.set(cacheHash, new mongodb.Binary(tile))
    return res.status(200).send(tile)
  }

  // @ts-ignore
  if (explain) result.explain = explain

  res.status(200).send(result)
})

// Simpler values list and filter (q is applied only to the selected field, not all fields)
// mostly useful for selects/autocompletes on values
router.get('/:datasetId/values/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getValues', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  res.throttleEnd()
  let result
  try {
    result = await esUtils.values(req.app.get('es'), req.dataset, req.params.fieldKey, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
})

// Same as previous, but also uses x-labels for a better experience
router.get('/:datasetId/values-labels/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getValues', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  res.throttleEnd()
  let result
  const field = req.dataset.schema.find(p => p.key === req.params.fieldKey)
  if (!field) throw httpError(400, `field "${req.params.fieldKey}" is unknown`)
  if (field['x-labels'] && field['x-labelsRestricted']) {
    result = Object.entries(field['x-labels']).map(([value, label]) => ({ value, label }))
  } else {
    req.query.size = req.query.size ?? '1000'
    try {
      const values = await esUtils.values(req.app.get('es'), req.dataset, req.params.fieldKey, req.query)
      result = values.map(value => ({ value, label: field['x-labels']?.[value] ?? value }))
    } catch (err) {
      await manageESError(req, err)
    }
  }
  res.status(200).send(result)
})

// Simple metric aggregation to calculate 1 value (sum, avg, etc.) about 1 column
router.get('/:datasetId/metric_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getMetricAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  res.throttleEnd()
  let result
  try {
    result = await esUtils.metricAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
})

// Simple metric aggregation to calculate some basic values about a list of columns
router.get('/:datasetId/simple_metrics_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getSimpleMetricsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  res.throttleEnd()
  let result
  try {
    result = await esUtils.simpleMetricsAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
})

// Simple words aggregation for significant terms extraction
router.get('/:datasetId/words_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getWordsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  res.throttleEnd()
  let result
  try {
    result = await esUtils.wordsAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
})

// DEPRECATED, replaced by metric_agg
// Get max value of a field
router.get('/:datasetId/max/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getMaxAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  let result
  try {
    result = await esUtils.maxAgg(req.dataset, req.params.fieldKey, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
})

// DEPRECATED, replaced by metric_agg
// Get min value of a field
router.get('/:datasetId/min/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('getMinAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
  let result
  try {
    result = await esUtils.minAgg(req.dataset, req.params.fieldKey, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
})

// For datasets with attached files
router.get('/:datasetId/attachments/*attachmentPath', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, permissions.middleware('downloadAttachment', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
  if (req.dataset.isVirtual) {
    const childDatasetId = req.params.attachmentPath[0]
    if (!req.dataset.descendants?.find(c => c === childDatasetId)) return res.status(404).send('Child dataset not found')
    const { dataset: childDataset } = await memoizedGetDataset(childDatasetId, req.publicationSite, req.mainPublicationSite, false, false, false, mongo.db, true, undefined, undefined)
    const documentProp = req.dataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
    const childDocumentProp = childDataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
    if (!documentProp || documentProp.key !== childDocumentProp.key) return res.status(404).send('No attachment column found')

    const relFilePath = path.join(...req.params.attachmentPath.slice(1))
    await new Promise((resolve, reject) => res.sendFile(
      relFilePath,
      {
        transformStream: res.throttle('static'),
        root: attachmentsDir(childDataset),
        headers: { 'Content-Disposition': contentDisposition(path.basename(relFilePath), { type: 'inline' }) }
      },
      (err) => err ? reject(err) : resolve(true)
    ))
  } else {
    // the transform stream option was patched into "send" module using patch-package
    const relFilePath = path.join(...req.params.attachmentPath)
    await new Promise((resolve, reject) => res.sendFile(
      relFilePath,
      {
        transformStream: res.throttle('static'),
        root: attachmentsDir(req.dataset),
        headers: { 'Content-Disposition': contentDisposition(path.basename(relFilePath), { type: 'inline' }) }
      },
      (err) => err ? reject(err) : resolve(true)
    ))
  }
})

// Direct access to data files
router.get('/:datasetId/data-files', readDataset(), apiKeyMiddlewareRead, permissions.middleware('listDataFiles', 'read'), cacheHeaders.noCache, async (req, res, next) => {
  res.send(await datasetUtils.dataFiles(req.dataset, req.publicBaseUrl))
})
router.get('/:datasetId/data-files/*filePath', readDataset(), apiKeyMiddlewareRead, permissions.middleware('downloadDataFile', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  res.download(path.join(...req.params.filePath), null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
})

// Special attachments referenced in dataset metadatas
router.post('/:datasetId/metadata-attachments', readDataset(), apiKeyMiddlewareWrite, permissions.middleware('postMetadataAttachment', 'write'), checkStorage(false), attachments.metadataUpload(), clamav.middleware, async (req, res, next) => {
  req.body.size = (await fs.promises.stat(req.file.path)).size
  req.body.updatedAt = moment().toISOString()
  await updateStorage(req.dataset)
  res.status(200).send(req.body)
})
router.get('/:datasetId/metadata-attachments/*attachmentPath', readDataset(), apiKeyMiddlewareRead, permissions.middleware('downloadMetadataAttachment', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  // res.set('content-disposition', `inline; filename="${req.params.attachmentPath}"`)
  const relFilePath = path.join(...req.params.attachmentPath)
  const attachmentsTargets = clone(req.dataset._attachmentsTargets || [])
  const attachmentTarget = attachmentsTargets.find(a => a.name === relFilePath)
  if (attachmentTarget) {
    // special case for remote attachments, we monitor them as if they were API call and not static files
    req.operation.track = 'readDataAPI'
    res.setHeader('x-operation', JSON.stringify(req.operation))
    if (attachmentTarget.fetchedAt && attachmentTarget.fetchedAt.getTime() + config.remoteAttachmentCacheDuration > Date.now()) {
      res.set('x-remote-status', 'CACHE')
    } else {
      const headers = {}
      if (attachmentTarget.etag) headers['If-None-Match'] = attachmentTarget.etag
      if (attachmentTarget.lastModified) headers['If-Modified-Since'] = attachmentTarget.lastModified
      const response = await axios.get(attachmentTarget.targetUrl, {
        responseType: 'stream',
        headers,
        validateStatus: function (status) {
          return status === 200 || status === 304
        }
      })
      if (response.status !== 200 && response.status !== 304) {
        let message = `${response.status} - ${response.statusText}`
        if (response.headers['content-type']?.startsWith('text/plain')) {
          const data = await stream2text(response.data)
          if (data) message = data
        }
        throw httpError(502, 'Échec de téléchargement du fichier : ' + message)
      }

      if (response.status === 304) {
        // nothing to do
        res.set('x-remote-status', 'NOTMODIFIED')
        await stream2text(response.data)
      } else {
        res.set('x-remote-status', 'DOWNLOAD')
        const attachmentPath = datasetUtils.metadataAttachmentPath(req.dataset, relFilePath)
        // creating empty file before streaming seems to fix some weird bugs with NFS
        await fs.ensureFile(attachmentPath)
        await pump(
          response.data,
          fs.createWriteStream(attachmentPath)
        )
        attachmentTarget.etag = response.headers.etag
        attachmentTarget.lastModified = response.headers['last-modified']
        attachmentTarget.fetchedAt = new Date()
        await mongo.db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { _attachmentsTargets: attachmentsTargets } })
      }
    }
  }

  const ranges = req.range(1000000)
  if (Array.isArray(ranges) && ranges.length === 1 && ranges.type === 'bytes') {
    const range = ranges[0]
    const filePath = datasetUtils.metadataAttachmentPath(req.dataset, relFilePath)
    if (!await fs.pathExists(filePath)) return res.status(404).send()
    const stats = await fs.stat(filePath)

    res.setHeader('content-type', 'application/octet-stream')
    res.setHeader('content-range', `bytes ${range.start}-${range.end}/${stats.size}`)
    res.setHeader('content-length', (range.end - range.start) + 1)
    res.status(206)
    await pump(
      fs.createReadStream(filePath, { start: range.start, end: range.end }),
      res.throttle('static'),
      res
    )
  }

  await new Promise((resolve, reject) => res.sendFile(
    relFilePath,
    {
      transformStream: res.throttle('static'),
      root: datasetUtils.metadataAttachmentsDir(req.dataset),
      headers: { 'Content-Disposition': contentDisposition(path.basename(relFilePath), { type: 'inline' }) }
    },
    (err) => err ? reject(err) : resolve(true)
  ))
  // res.sendFile(req.params.attachmentPath)
})

router.delete('/:datasetId/metadata-attachments/*attachmentPath', readDataset(), apiKeyMiddlewareWrite, permissions.middleware('deleteMetadataAttachment', 'write'), async (req, res, next) => {
  await fs.remove(datasetUtils.metadataAttachmentPath(req.dataset, path.join(...req.params.attachmentPath)))
  await updateStorage(req.dataset)
  res.status(204).send()
})

// Download the full dataset in its original form
router.get('/:datasetId/raw', readDataset(), apiKeyMiddlewareRead, permissions.middleware('downloadOriginalData', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
  const sessionState = reqSession(req)
  // a special case for superadmins.. handy but quite dangerous for the db load
  if (req.dataset.isRest && sessionState.user?.adminMode) {
    const query = { ...req.query }
    query.select = query.select || ['_id'].concat(req.dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)).join(',')
    res.setHeader('content-disposition', contentDisposition(req.dataset.slug + '.csv'))
    // add BOM for excel, cf https://stackoverflow.com/a/17879474
    await pump(
      ...await restDatasetsUtils.readStreams(req.dataset),
      ...outputs.csvStreams(req.dataset, query),
      res
    )
    return
  }
  if (!req.dataset.originalFile) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')
  // the transform stream option was patched into "send" module using patch-package
  res.download(req.dataset.originalFile.name, null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
})

// Download the dataset in various formats
router.get('/:datasetId/convert', readDataset(), apiKeyMiddlewareRead, permissions.middleware('downloadOriginalData', 'read', 'readDataFiles'), cacheHeaders.noCache, (req, res, next) => {
  if (!req.dataset.file) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')

  // the transform stream option was patched into "send" module using patch-package
  res.download(req.dataset.file.name, null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
})

// Download the full dataset with extensions
// TODO use ES scroll functionality instead of file read + extensions
router.get('/:datasetId/full', readDataset(), apiKeyMiddlewareRead, permissions.middleware('downloadFullData', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  if (await fs.pathExists(datasetUtils.fullFilePath(req.dataset))) {
    res.download(datasetUtils.fullFileName(req.dataset), null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
  } else {
    res.download(req.dataset.file.name, null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
  }
})

router.get('/:datasetId/api-docs.json', readDataset(), apiKeyMiddlewareRead, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type: req.dataset.owner.type, id: req.dataset.owner.id }, { projection: { info: 1, compatODS: 1 } })
  res.send(datasetAPIDocs(req.dataset, req.publicBaseUrl, settings, req.publicationSite).api)
})

router.get('/:datasetId/private-api-docs.json', readDataset(), apiKeyMiddlewareRead, permissions.middleware('readPrivateApiDoc', 'readAdvanced'), cacheHeaders.noCache, async (req, res) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type: req.dataset.owner.type, id: req.dataset.owner.id }, { projection: { info: 1, compatODS: 1 } })
  res.send(privateDatasetAPIDocs(req.dataset, req.publicBaseUrl, reqSessionAuthenticated(req), settings))
})

router.get('/:datasetId/journal', readDataset({ acceptInitialDraft: true }), apiKeyMiddlewareRead, permissions.middleware('readJournal', 'readAdvanced'), cacheHeaders.noCache, async (req, res) => {
  const journal = await mongo.db.collection('journals').findOne({
    type: 'dataset',
    id: req.dataset.id,
    'owner.type': req.dataset.owner.type,
    'owner.id': req.dataset.owner.id
  }, {
    projection: {
      // arbitrary limit at 1000 events
      events: { $slice: -1000 }
    }
  })
  if (!journal) return res.send([])
  delete journal.owner
  journal.events.reverse()
  for (const e of journal.events) {
    if (e.data) e.data = sanitizeHtml(e.data)
  }
  res.json(journal.events)
})

router.get('/:datasetId/task-progress', readDataset(), apiKeyMiddlewareRead, permissions.middleware('readJournal', 'readAdvanced'), cacheHeaders.noCache, async (req, res) => {
  const journal = await mongo.db.collection('journals').findOne({
    type: 'dataset',
    id: req.dataset.id,
    'owner.type': req.dataset.owner.type,
    'owner.id': req.dataset.owner.id
  })
  if (!journal) return res.send({})
  if (!journal.taskProgress) return res.send({})
  res.json(journal.taskProgress)
})

const sendUserNotificationPermissions = permissions.middleware('sendUserNotification', 'write')
const sendUserNotificationPublicPermissions = permissions.middleware('sendUserNotificationPublic', 'write')
router.post(
  '/:datasetId/user-notification',
  readDataset(),
  applicationKey,
  apiKeyMiddlewareWrite,
  (req, res, next) => req.body.visibility === 'public' ? sendUserNotificationPublicPermissions(req, res, next) : sendUserNotificationPermissions(req, res, next),
  async (req, res, next) => {
    const userNotification = req.body
    validateUserNotification(userNotification)
    const sessionState = reqSessionAuthenticated(req)
    const urlParams = userNotification.urlParams || {}
    userNotification.visibility = userNotification.visibility || 'private'
    if (userNotification.visibility !== 'private') {
      const ownerRole = permissions.getOwnerRole(req.dataset.owner, sessionState)
      if (!['admin', 'contrib'].includes(ownerRole)) return res.status(403).type('text/plain').send('User does not have permission to emit a public notification')
    }
    const notif = {
      sender: req.dataset.owner,
      topic: { key: `data-fair:dataset-user-notification:${req.dataset.slug}:${userNotification.topic}` },
      title: userNotification.title,
      body: userNotification.body,
      urlParams: { ...urlParams, datasetId: req.dataset.id, datasetSlug: req.dataset.slug, userId: sessionState.user.id },
      visibility: userNotification.visibility,
      recipient: userNotification.recipient,
      extra: { user: { id: sessionState.user.id, name: sessionState.user.name } },
      resource: { type: 'dataset', id: req.dataset.id }
    }
    await notifications.send(notif, true, sessionState)
    res.send(notif)
  }
)

router.get('/:datasetId/thumbnail', readDataset({ fillDescendants: true }), apiKeyMiddlewareRead, permissions.middleware('readDescription', 'read'), async (req, res, next) => {
  if (!req.dataset.image) return res.status(404).send("dataset doesn't have an image")
  await getThumbnail(req, res, req.dataset.image)
})
router.get('/:datasetId/thumbnail/:thumbnailId', readDataset({ fillDescendants: true }), apiKeyMiddlewareRead, permissions.middleware('readLines', 'read'), async (req, res, next) => {
  const url = Buffer.from(req.params.thumbnailId, 'hex').toString()
  if (req.dataset.attachmentsAsImage && url.startsWith('/attachments/')) {
    if (req.dataset.isVirtual) {
      const childDatasetId = url.split('/')[2]
      if (!req.dataset.descendants?.find(c => c === childDatasetId)) return res.status(404).send('Child dataset not found')
      const { dataset: childDataset } = await memoizedGetDataset(childDatasetId, req.publicationSite, req.mainPublicationSite, false, false, false, mongo.db, true, undefined, undefined)
      const documentProp = req.dataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
      const childDocumentProp = childDataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
      if (!documentProp || documentProp.key !== childDocumentProp.key) return res.status(404).send('No attachment column found')
      await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${req.dataset.id}${url}`, datasetUtils.attachmentPath(childDataset, url.replace(`/attachments/${childDatasetId}/`, '')), req.dataset.thumbnails)
    } else {
      await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${req.dataset.id}${url}`, datasetUtils.attachmentPath(req.dataset, url.replace('/attachments/', '')), req.dataset.thumbnails)
    }
  } else {
    const imageField = req.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    const count = await esUtils.count(req.dataset, {
      qs: `${esUtils.escapeFilter(imageField.key)}:${esUtils.escapeFilter(url)}`
    })
    if (!count) return res.status(404).send('thumbnail does not match a URL from this dataset')
    await getThumbnail(req, res, url, null, req.dataset.thumbnails)
  }
})

router.get('/:datasetId/read-api-key', readDataset(), permissions.middleware('getReadApiKey', 'read'), async (req, res, next) => {
  if (!req.dataset._readApiKey) return res.status(404).send("dataset doesn't have a read API key")
  res.send(req.dataset._readApiKey)
})

router.post('/:datasetId/_simulate-extension', readDataset(), apiKeyMiddlewareWrite, permissions.middleware('simulateExtension', 'write'), async (req, res, next) => {
  const line = req.body
  const dataset = clone(req.dataset)
  if (!dataset.extensions?.length) throw httpError(400, 'no extension to simulate')
  await extend(dataset, dataset.extensions, undefined, undefined, undefined, line)
  const flatten = getFlatten(req.dataset, req.query.arrays === 'true')
  res.send(flatten(line))
})

// Special route with very technical informations to help diagnose bugs, broken indices, etc.
router.get('/:datasetId/_diagnose', readDataset({ fillDescendants: true, acceptInitialDraft: true, noCache: true }), cacheHeaders.noCache, async (req, res) => {
  reqAdminMode(req)
  const esInfos = await datasetInfos(req.dataset)
  const filesInfos = await datasetUtils.lsFiles(req.dataset)
  const locks = [
    await mongo.db.collection('locks').findOne({ _id: `datasets:${req.dataset.id}` }),
    await mongo.db.collection('locks').findOne({ _id: `datasets:slug:${req.dataset.owner.type}:${req.dataset.owner.id}:${req.dataset.slug}` })
  ]
  res.json({ filesInfos, esInfos, locks })
})

// Special admin route to force reindexing a dataset
router.post('/:datasetId/_reindex', readDataset({ noCache: true }), async (req, res) => {
  reqAdminMode(req)
  const patchedDataset = await datasetUtils.reindex(mongo.db, req.dataset)
  res.status(200).send(patchedDataset)
})

// Special admin route to force refinalizing a dataset
router.post('/:datasetId/_refinalize', readDataset({ noCache: true }), async (req, res) => {
  reqAdminMode(req)
  const patchedDataset = await datasetUtils.refinalize(mongo.db, req.dataset)
  res.status(200).send(patchedDataset)
})

// Special admin route to clear all locks on a dataset
router.delete('/:datasetId/_lock', readDataset({ noCache: true }), async (req, res) => {
  reqAdminMode(req)
  const db = mongo.db
  await db.collection('locks').deleteOne({ _id: `datasets:${req.dataset.id}` })
  await db.collection('locks').deleteOne({ _id: `datasets:slug:${req.dataset.owner.type}:${req.dataset.owner.id}:${req.dataset.slug}` })
  res.status(204).send()
})

export default router
