import config from '#config'
import mongo from '#mongo'
import debugLib from 'debug'
import fs from 'fs-extra'
import path from 'path'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import memoize from 'memoizee'
import equal from 'deep-equal'
import * as findUtils from '../misc/utils/find.js'
import * as permissions from '../misc/utils/permissions.ts'
import * as datasetUtils from './utils/index.js'
import * as restDatasetsUtils from './utils/rest.ts'
import { validateDraftAlias, deleteIndex, updateDatasetMapping } from './es/manage-indices.js'
import * as webhooks from '../misc/utils/webhooks.ts'
import { sendResourceEvent } from '../misc/utils/notifications.ts'
import catalogsPublicationQueue from '../misc/utils/catalogs-publication-queue.ts'
import { updateStorage } from './utils/storage.ts'
import { dir, filePath, fullFilePath, originalFilePath, attachmentsDir, fsyncFile, metadataAttachmentsDir } from './utils/files.ts'
import { getSchemaBreakingChanges } from './utils/data-schema.ts'
import { getExtensionKey, prepareExtensions, prepareExtensionsSchema, checkExtensions } from './utils/extensions.ts'
import assertImmutable from '../misc/utils/assert-immutable.js'
import { curateDataset, titleFromFileName } from './utils/index.js'
import * as virtualDatasetsUtils from './utils/virtual.ts'
import i18n from 'i18n'

const debugMasterData = debugLib('master-data')

const filterFields = {
  concepts: 'schema.x-refersTo',
  'short-concept': 'schema.x-concept.id',
  'field-type': 'schema.type',
  'field-format': 'schema.format',
  children: 'virtual.children',
  services: 'extensions.remoteService',
  status: 'status',
  draftStatus: 'draft.status',
  topics: 'topics.id',
  publicationSites: 'publicationSites',
  requestedPublicationSites: 'requestedPublicationSites',
  spatial: 'spatial',
  keywords: 'keywords',
  title: 'title'
}
const facetFields = {
  ...filterFields,
  topics: 'topics'
}
const sumsFields = { count: 'count' }
const nullFacetFields = ['publicationSites']
const fieldsMap = {
  filename: 'originalFile.name',
  ids: 'id',
  id: 'id',
  slugs: 'slug',
  slug: 'slug',
  rest: 'isRest',
  virtual: 'isVirtual',
  metaOnly: 'isMetaOnly',
  ...filterFields
}

/**
 *
 * @param {import('mongodb').Db} db
 * @param {string} locale
 * @param {any} publicationSite
 * @param {string} publicBaseUrl
 * @param {Record<string, string>} reqQuery
 * @param {import('@data-fair/lib-express').SessionState} sessionState
 */
export const findDatasets = async (db, locale, publicationSite, publicBaseUrl, reqQuery, sessionState) => {
  const explain = reqQuery.explain === 'true' && sessionState.user && (sessionState.user.isAdmin || sessionState.user.asAdmin) && {}
  const datasets = db.collection('datasets')

  const extraFilters = []
  if (reqQuery.bbox === 'true') {
    extraFilters.push({ bbox: { $ne: null } })
  }
  if (reqQuery.queryable === 'true') {
    extraFilters.push({ isMetaOnly: { $ne: true } })
    extraFilters.push({ finalizedAt: { $ne: null } })
  }

  if (reqQuery.file === 'true') extraFilters.push({ file: { $exists: true } })
  if (reqQuery.type) {
    const typeFilters = []
    for (const type of reqQuery.type.split(',')) {
      if (type === 'file') typeFilters.push({ file: { $exists: true } })
      if (type === 'rest') typeFilters.push({ isRest: true })
      if (type === 'virtual') typeFilters.push({ isVirtual: true })
      if (type === 'metaOnly') typeFilters.push({ isMetaOnly: true })
    }
    extraFilters.push({ $or: typeFilters })
  }

  // the api exposed on a secondary domain should not be able to access resources outside of the owner account
  if (publicationSite) {
    extraFilters.push({ 'owner.type': publicationSite.owner.type, 'owner.id': publicationSite.owner.id })
  }

  const query = findUtils.query(reqQuery, locale, sessionState, 'datasets', fieldsMap, false, extraFilters)
  const sort = findUtils.sort(reqQuery.sort)
  const project = findUtils.project(reqQuery.select, [], reqQuery.raw === 'true')
  const [skip, size] = findUtils.pagination(reqQuery)

  const t0 = Date.now()
  const countPromise = reqQuery.count !== 'false' && datasets.countDocuments(query).then(res => {
    if (explain) explain.countMS = Date.now() - t0
    return res
  })
  const resultsPromise = size > 0 && datasets.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray().then(res => {
    if (explain) explain.resultsMS = Date.now() - t0
    return res
  })
  const facetsPromise = reqQuery.facets && datasets.aggregate(findUtils.facetsQuery(reqQuery, sessionState, 'datasets', facetFields, filterFields, nullFacetFields, extraFilters)).toArray().then(res => {
    if (explain) explain.facetsMS = Date.now() - t0
    return res
  })
  const sumsPromise = reqQuery.sums && datasets
    .aggregate(findUtils.sumsQuery(reqQuery, sessionState, 'datasets', sumsFields, filterFields, extraFilters)).toArray()
    .then(sumsResponse => {
      const res = sumsResponse[0] || {}
      for (const field of reqQuery.sums.split(',')) {
        res[field] = res[field] || 0
      }
      if (explain) explain.sumsMS = Date.now() - t0
      return res
    })
  const [count, results, facets, sums] = await Promise.all([countPromise, resultsPromise, facetsPromise, sumsPromise])
  /** @type {any} */
  const response = {}
  if (countPromise) response.count = count
  if (resultsPromise) response.results = results
  else response.results = []
  if (facetsPromise) response.facets = findUtils.parseFacets(facets, nullFacetFields)
  if (sumsPromise) response.sums = sums
  const t1 = Date.now()
  if (explain) {
    explain.cleanMS = Date.now() - t1
    response.explain = explain
  }
  return response
}

/**
 * @param {string} datasetId
 * @param {string} publicationSite
 * @param {string} mainPublicationSite
 * @param {boolean | undefined} useDraft
 * @param {boolean | undefined} fillDescendants
 * @param {boolean | undefined} acceptInitialDraft
 * @param {import('mongodb').Db} db
 * @param {string[] | ((body: any, dataset: any) => string[] | null)} [_acceptedStatuses]
 * @param {any} [reqBody]
 * @returns {Promise<{dataset?: any, datasetFull?: any}>}
 */
export const getDataset = async (datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, db, _acceptedStatuses, reqBody) => {
  let dataset, datasetFull
  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    dataset = await findUtils.getByUniqueRef(publicationSite, mainPublicationSite, {}, 'dataset', datasetId)
    if (!dataset) return { }
    datasetFull = { ...dataset }

    // in draft mode the draft is automatically merged and all following operations use dataset.draftReason to adapt
    if (useDraft && dataset.draft) {
      Object.assign(dataset, dataset.draft)
      if (!dataset.draft.finalizedAt) delete dataset.finalizedAt
      if (!dataset.draft.bbox) delete dataset.bbox
    }
    delete dataset.draft

    const acceptedStatuses = typeof _acceptedStatuses === 'function' ? _acceptedStatuses(reqBody, dataset) : _acceptedStatuses

    let isStatusOk = false
    if (acceptedStatuses) isStatusOk = acceptedStatuses.includes('*') || acceptedStatuses.includes(dataset.status)
    else isStatusOk = acceptInitialDraft || dataset.status !== 'draft'

    if (isStatusOk) {
      if (fillDescendants && dataset.isVirtual) {
        dataset.descendants = await virtualDatasetsUtils.descendants(dataset)
      }
      if (dataset.schema) {
        for (const prop of dataset.schema) {
          if (prop['x-refersTo'] === null) delete prop['x-refersTo']
          if (prop.separator === null) delete prop.separator
        }
      }
      return !_acceptedStatuses ? assertImmutable({ dataset, datasetFull }, `dataset ${dataset.id}`) : { dataset, datasetFull }
    }

    // dataset found but not in proper state.. wait a little while
    await new Promise(resolve => setTimeout(resolve, config.datasetStateRetries.interval))
  }
  throw httpError(409, `Le jeu de données n'est pas dans un état permettant l'opération demandée. État courant : ${dataset?.status}.`)
}

export const memoizedGetDataset = memoize(getDataset, {
  profileName: 'getDataset',
  promise: true,
  primitive: true,
  max: 10000,
  maxAge: 1000 * 60, // 1 minute
  length: 6 // in memoized mode ignore db, acceptedStatuses and reqBody
})

/**
 *
 * @param {import('mongodb').Db} db
 * @param {import('@elastic/elasticsearch').Client} es
 * @param {string} locale
 * @param {import('@data-fair/lib-express').SessionStateAuthenticated} sessionState
 * @param {any} owner
 * @param {any} body
 * @param {undefined | any[]} files
 * @param {boolean} draft
 * @param {(callback: () => void) => void} onClose
 * @returns {Promise<any>}
 */
export const createDataset = async (db, es, locale, sessionState, owner, body, files, draft, onClose) => {
  const datasetFile = files?.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
  const attachmentsFile = files?.find(f => f.fieldname === 'attachments')

  if ([!!datasetFile, !!body.remoteFile, body.isVirtual, body.isRest, body.isMetaOnly].filter(b => b).length > 1) {
    throw httpError(400, 'Un jeu de données ne peut pas être de plusieurs types à la fois')
  }

  const dataset = { ...body }
  dataset.owner = owner
  const date = new Date().toISOString()
  dataset.createdAt = dataset.updatedAt = date
  dataset.createdBy = dataset.updatedBy = { id: sessionState.user.id, name: sessionState.user.name }
  dataset.permissions = []
  dataset.schema = dataset.schema || []
  if (dataset.extensions) {
    prepareExtensions(locale, dataset.extensions)
    await checkExtensions(await datasetUtils.extendedSchema(db, dataset), dataset.extensions)
    dataset.schema = await prepareExtensionsSchema(dataset.schema, dataset.extensions)
  }
  curateDataset(dataset)
  permissions.initResourcePermissions(dataset)

  if (dataset.initFrom) {
    dataset.initFrom.role = permissions.getOwnerRole(dataset.owner, sessionState)
    if (dataset.initFrom.role && dataset.owner.department) {
      dataset.initFrom.department = sessionState.account.department ?? '-'
    }
  }

  if (datasetFile) {
    dataset.title = dataset.title || titleFromFileName(datasetFile.originalname)
    /** @type {any} */
    const filePatch = {
      status: 'created',
      dataUpdatedBy: dataset.updatedBy,
      dataUpdatedAt: dataset.updatedAt,
      loaded: {
        dataset: {
          name: datasetFile.originalname,
          size: datasetFile.size,
          mimetype: datasetFile.mimetype,
          explicitEncoding: datasetFile.explicitEncoding
        },
        attachments: !!attachmentsFile
      }
    }
    if (draft) {
      dataset.status = 'draft'
      filePatch.draftReason = { key: 'file-new', message: 'Nouveau jeu de données chargé en mode brouillon', validationMode: 'never' }
      dataset.draft = filePatch
    } else {
      Object.assign(dataset, filePatch)
    }
  } else if (body.isVirtual) {
    if (!body.title) throw httpError(400, 'Un jeu de données virtuel doit être créé avec un titre')
    if (attachmentsFile) throw httpError(400, 'Un jeu de données virtuel ne peut pas avoir de pièces jointes')
    dataset.virtual = dataset.virtual || { children: [] }
    dataset.schema = await virtualDatasetsUtils.prepareSchema(dataset)
    if (dataset.initFrom) {
      dataset.status = 'created'
    } else {
      dataset.status = 'indexed'
    }
  } else if (body.isRest) {
    if (!body.title) throw httpError(400, 'Un jeu de données éditable doit être créé avec un titre')
    if (attachmentsFile) throw httpError(400, 'Un jeu de données éditable ne peut pas être créé avec des pièces jointes')
    dataset.rest = dataset.rest || {}
    dataset.rest.primaryKeyMode = dataset.rest.primaryKeyMode || 'sha256'
    dataset.rest.indiceMode = dataset.rest.indiceMode || 'timestamp3'
    dataset.schema = dataset.schema || []
    if (dataset.initFrom) {
      // case where we go through the full workers sequence
      dataset.status = 'created'
    } else {
      // case where we simply initialize the empty dataset
      // being empty this is not costly and can be performed by the API
      dataset.schema = await datasetUtils.extendedSchema(db, dataset)
      dataset.finalizedAt = (new Date()).toISOString()
      dataset.status = 'finalized'
    }
  } else if (body.isMetaOnly) {
    if (!body.title) throw httpError(400, 'Un jeu de données métadonnées doit être créé avec un titre')
    if (attachmentsFile) throw httpError(400, 'Un jeu de données virtuel ne peut pas avoir de pièces jointes')
  } else if (body.remoteFile) {
    dataset.title = dataset.title || titleFromFileName(body.remoteFile.name || path.basename(new URL(body.remoteFile.url).pathname))
    const filePatch = { status: 'created' }
    if (dataset.initFrom && dataset.initFrom.parts.includes('data')) {
      throw httpError(400, 'Un jeu de données basé sur fichier distant ne peut être initialisé ave la donnée d\'un jeu de données de référence')
    }
    if (draft) {
      dataset.status = 'draft'
      filePatch.draftReason = { key: 'file-new', message: 'Nouveau jeu de données chargé en mode brouillon', validationMode: 'never' }
      dataset.draft = filePatch
    } else {
      Object.assign(dataset, filePatch)
    }
  } else if (dataset.initFrom && dataset.initFrom.parts.includes('data')) {
    // case of a file dataset initialized from master data
    if (draft) {
      dataset.status = 'draft'
      dataset.draft = {
        status: 'created',
        draftReason: { key: 'file-new', message: 'Nouveau jeu de données chargé en mode brouillon', validationMode: 'never' }
      }
    } else {
      dataset.status = 'created'
    }
  } else {
    throw httpError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel" ou "éditable" ou "métadonnées"')
  }

  const insertedDatasetFull = await datasetUtils.insertWithId(db, dataset, onClose)
  const insertedDataset = datasetUtils.mergeDraft(insertedDatasetFull)

  if (datasetFile) {
    await fs.emptyDir(datasetUtils.loadingDir(insertedDataset))
    await fs.move(datasetFile.path, datasetUtils.loadedFilePath(insertedDataset))
    await fsyncFile(datasetUtils.loadedFilePath(insertedDataset))
    if (attachmentsFile) {
      await fs.move(attachmentsFile.path, datasetUtils.loadedAttachmentsFilePath(insertedDataset))
      await fsyncFile(datasetUtils.loadedAttachmentsFilePath(insertedDataset))
    }
  }
  if (dataset.extensions) debugMasterData(`POST dataset ${dataset.id} (${insertedDataset.slug}) with extensions by ${sessionState.user.name} (${sessionState.user.id})`, insertedDataset.extensions)
  if (dataset.masterData) debugMasterData(`POST dataset ${dataset.id} (${insertedDataset.slug}) with masterData by ${sessionState.user.name} (${sessionState.user.id})`, insertedDataset.masterData)

  return insertedDataset
}

export const deleteDataset = async (app, dataset) => {
  const db = mongo.db
  try {
    await fs.remove(dir(dataset))
  } catch (err) {
    console.warn('Error while deleting dataset draft directory', err)
  }
  if (dataset.isRest) {
    try {
      await restDatasetsUtils.deleteDataset(dataset)
    } catch (err) {
      console.warn('Error while removing mongodb collection for REST dataset', err)
    }
  }

  await db.collection('datasets').deleteOne({ id: dataset.id })
  await db.collection('journals').deleteOne({ type: 'dataset', id: dataset.id })

  // notify catalogs that the dataset has been deleted
  catalogsPublicationQueue.deletePublication(dataset.id)

  if (!dataset.isVirtual) {
    try {
      await deleteIndex(dataset)
    } catch (err) {
      console.warn('Error while deleting dataset indexes and alias', err)
    }
    if (!dataset.draftReason) {
      await updateStorage(dataset, true)
    }
  }
}

/**
 *
 * @param {any} dataset
 * @param {any} patch
 * @param {any[]} [removedRestProps]
 * @param {boolean} [attemptMappingUpdate]
 */
export const applyPatch = async (dataset, patch, removedRestProps, attemptMappingUpdate) => {
  if (patch.extensions) debugMasterData(`PATCH dataset ${dataset.id} (${dataset.slug}) extensions`, dataset.extensions, patch.extensions)
  if (patch.masterData) debugMasterData(`PATCH dataset ${dataset.id} (${dataset.slug}) masterData`, dataset.masterData, patch.masterData)

  const db = mongo.db

  if (patch.extensions && dataset.isRest && dataset.extensions) {
    // TODO: check extension type (remoteService or exprEval)
    const removedExtensions = dataset.extensions.filter(e => {
      if (e.type === 'remoteService') return !patch.extensions.find(pe => pe.type === 'remoteService' && e.remoteService === pe.remoteService && e.action === pe.action)
      if (e.type === 'exprEval') return !patch.extensions.find(pe => pe.type === 'exprEval' && e.property?.key === pe.property?.key)
      return false
    })
    if (removedExtensions.length) {
      debugMasterData(`PATCH on dataset removed some extensions ${dataset.id} (${dataset.slug})`, removedExtensions)
      const unset = {}
      for (const e of removedExtensions) {
        if (e.type === 'remoteService') unset[getExtensionKey(e)] = ''
        if (e.type === 'exprEval') unset[e.property?.key] = ''
      }
      await restDatasetsUtils.collection(dataset).updateMany({},
        { $unset: unset }
      )
    }
  }

  if (removedRestProps && removedRestProps.length) {
    // some property was removed in rest dataset, trigger full re-indexing
    await restDatasetsUtils.collection(dataset).updateMany({},
      { $unset: removedRestProps.reduce((a, df) => { a[df.key] = ''; return a }, {}) }
    )
  }

  if (attemptMappingUpdate) {
    try {
      // this method will routinely throw errors
      // we just try in case elasticsearch considers the new mapping compatible
      // so that we might optimize and reindex only when necessary
      await updateDatasetMapping({ id: dataset.id, schema: patch.schema }, dataset)
      patch.status = 'indexed'
    } catch (err) {
      // generated ES mappings are not compatible, trigger full re-indexing
    }
  }

  // no need to update individual extensions, dataset will be reindexed entirely
  if (patch.status && patch.status !== 'indexed' && patch.status !== 'finalized' && patch.extensions) {
    for (const e of patch.extensions) {
      delete e.needsUpdate
    }
  }

  if (patch.status && patch.status !== 'error') {
    patch.errorStatus = null
    patch.errorRetry = null
  }

  Object.assign(dataset, patch)

  // if (!dataset.draftReason) await datasetUtils.updateStorage(dataset)

  // if the dataset is in draft mode all patched values are stored in the draft state
  if (dataset.draftReason) {
    const draftPatch = {}
    for (const key of Object.keys(patch)) {
      draftPatch['draft.' + key] = patch[key]
    }
    patch = draftPatch
  }

  const mongoPatch = {}
  for (const key of Object.keys(patch)) {
    if (patch[key] === null) {
      mongoPatch.$unset = mongoPatch.$unset || {}
      mongoPatch.$unset[key] = true
    } else {
      mongoPatch.$set = mongoPatch.$set || {}
      mongoPatch.$set[key] = patch[key]
    }
  }
  await db.collection('datasets').updateOne({ id: dataset.id }, mongoPatch)

  if (!dataset.draftReason && !patch.status && patch.schema) {
    // if the schema changed without triggering a worker we might need to actualize virtual datasets schemas too
    for await (const virtualDataset of db.collection('datasets').find({ 'virtual.children': dataset.id })) {
      const virtualDatasetSchema = await virtualDatasetsUtils.prepareSchema(virtualDataset)
      if (!equal(virtualDatasetSchema, virtualDataset.schema)) {
        await applyPatch(virtualDataset, { schema: virtualDatasetSchema, updatedAt: patch.updatedAt })
      }
    }
  }
}

// synchronize the list of application references stored in dataset.extras.applications
// used for quick access to capture, and default sorting in dataset pages
export const syncApplications = async (datasetId) => {
  const dataset = await mongo.datasets.findOne({ id: datasetId }, { projection: { owner: 1, extras: 1 } })
  if (!dataset) return
  const applications = await mongo.applications
    .find({
      'owner.type': dataset.owner.type,
      'owner.id': dataset.owner.id,
      'configuration.datasets.href': config.publicUrl + '/api/v1/datasets/' + datasetId
    })
    .project({ id: 1, slug: 1, updatedAt: 1, publicationSites: 1, _id: 0 })
    .toArray()
  const applicationsExtras = ((dataset.extras && dataset.extras.applications) || [])
    .map(appExtra => applications.find(app => app.id === appExtra.id))
    .filter(appExtra => !!appExtra)
  for (const app of applications) {
    if (!applicationsExtras.find(appExtra => appExtra.id === app.id)) {
      applicationsExtras.push(app)
    }
  }
  await mongo.datasets
    .updateOne({ id: datasetId }, { $set: { 'extras.applications': applicationsExtras } })
}

export const validateDraft = async (dataset, datasetFull, patch) => {
  Object.assign(datasetFull.draft, patch)
  const datasetDraft = datasetUtils.mergeDraft({ ...datasetFull })

  const draftPatch = { ...datasetFull.draft }
  if (datasetFull.draft.dataUpdatedAt) {
    draftPatch.dataUpdatedAt = draftPatch.updatedAt
    draftPatch.dataUpdatedBy = draftPatch.updatedBy ?? draftPatch.dataUpdatedBy
  }
  delete draftPatch.status
  delete draftPatch.finalizedAt
  delete draftPatch.draftReason
  delete draftPatch.bbox
  delete draftPatch.storage
  delete draftPatch.validateDraft
  Object.assign(patch, draftPatch)
  patch.draft = null
  const patchedDataset = { ...datasetFull, ...patch }

  if (datasetFull.file) {
    webhooks.trigger('datasets', patchedDataset, { type: 'data-updated' }, null)
    await sendResourceEvent('datasets', patchedDataset, 'data-fair-worker', 'data-updated')
    const breakingChanges = getSchemaBreakingChanges(datasetFull.schema, patchedDataset.schema, false, false)
    if (breakingChanges.length) {
      const breakingChangesDesc = i18n.getLocales().reduce((a, locale) => {
        let msg = i18n.__({ phrase: 'hasBreakingChanges', locale }, { title: patchedDataset.title })
        for (const breakingChange of breakingChanges) {
          msg += '\n' + i18n.__({ phrase: 'breakingChanges.' + breakingChange.type, locale }, { key: breakingChange.key })
        }
        a[locale] = { breakingChanges: msg }
        return a
      }, {})
      webhooks.trigger('datasets', patchedDataset, {
        type: 'breaking-change',
        body: breakingChangesDesc
      })
      await sendResourceEvent('datasets', patchedDataset, 'data-fair-worker', 'breaking-change', { localizedParams: breakingChangesDesc })
    }
  }

  await fs.ensureDir(dir(patchedDataset))

  if (await fs.pathExists(attachmentsDir(datasetDraft))) {
    await fs.remove(attachmentsDir(patchedDataset))
    await fs.move(attachmentsDir(datasetDraft), attachmentsDir(patchedDataset))
  }

  if (await fs.pathExists(metadataAttachmentsDir(datasetDraft))) {
    await fs.remove(metadataAttachmentsDir(patchedDataset))
    await fs.move(metadataAttachmentsDir(datasetDraft), metadataAttachmentsDir(patchedDataset))
  }

  // replace originalFile
  const draftOriginalFilePath = originalFilePath(datasetDraft)
  const newOriginalFilePath = originalFilePath(patchedDataset)
  const oldOriginalFilePath = datasetFull.originalFile && originalFilePath(datasetFull)
  if (patchedDataset.originalFile && patchedDataset.originalFile.name !== patchedDataset.file?.name) {
    await fs.move(draftOriginalFilePath, newOriginalFilePath, { overwrite: true })
    await fsyncFile(newOriginalFilePath)
  }
  if (oldOriginalFilePath && datasetFull.originalFile.name !== datasetFull.file?.name && newOriginalFilePath !== oldOriginalFilePath) {
    await fs.remove(oldOriginalFilePath)
  }

  // replace extended file
  const draftFullFilePath = fullFilePath(datasetDraft)
  const newFullFilePath = fullFilePath(patchedDataset)
  const oldFullFilePath = datasetFull.file && fullFilePath(datasetFull)
  const hasFullFile = await fs.exists(draftFullFilePath)
  if (hasFullFile) {
    await fs.move(draftFullFilePath, newFullFilePath, { overwrite: true })
    await fsyncFile(newFullFilePath)
  }
  if (oldFullFilePath && (!hasFullFile || newFullFilePath !== oldFullFilePath)) {
    await fs.remove(oldFullFilePath)
  }

  // replace file
  const draftFilePath = filePath(datasetDraft)
  const newFilePath = filePath(patchedDataset)
  const oldFilePath = datasetFull.file && filePath(datasetFull)
  await fs.move(draftFilePath, newFilePath, { overwrite: true })
  await fsyncFile(newFilePath)
  if (oldFilePath && newFilePath !== oldFilePath) {
    await fs.remove(oldFilePath)
  }

  await validateDraftAlias(dataset)
  await fs.remove(dir(datasetDraft))
}

export const cancelDraft = async (dataset) => {
  await fs.remove(dir(dataset))
  await deleteIndex(dataset)
}
