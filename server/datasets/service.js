const config = /** @type {any} */(require('config'))
const fs = require('fs-extra')
const path = require('path')
const createError = require('http-errors')
const findUtils = require('../misc/utils/find')
const permissions = require('../misc/utils/permissions')
const datasetUtils = require('./utils')
const restDatasetsUtils = require('./utils/rest')
const esUtils = require('./es')
const webhooks = require('../misc/utils/webhooks')
const journals = require('../misc/utils/journals')
const { updateStorage } = require('./utils/storage')
const { dir, filePath, fullFilePath, originalFilePath, attachmentsDir, exportedFilePath } = require('./utils/files')
const { schemasFullyCompatible, getSchemaBreakingChanges } = require('./utils/schema')
const { getExtensionKey, prepareExtensions, prepareExtensionsSchema } = require('./utils/extensions')
const { validateURLFriendly } = require('../misc/utils/validation')
const { curateDataset, titleFromFileName } = require('./utils')
const virtualDatasetsUtils = require('./utils/virtual')
const { prepareInitFrom } = require('./utils/init-from')

const debugMasterData = require('debug')('master-data')

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
 * @param {any} user
 */
exports.findDatasets = async (db, locale, publicationSite, publicBaseUrl, reqQuery, user) => {
  const explain = reqQuery.explain === 'true' && user && (user.isAdmin || user.asAdmin) && {}
  const datasets = db.collection('datasets')

  const tolerateStale = !!publicationSite

  /** @type {import('mongodb').AggregateOptions} */
  const options = tolerateStale ? { readPreference: 'nearest' } : {}

  const extraFilters = []
  if (reqQuery.bbox === 'true') {
    extraFilters.push({ bbox: { $ne: null } })
  }
  if (reqQuery.queryable === 'true') {
    extraFilters.push({ isMetaOnly: { $ne: true } })
    extraFilters.push({ finalizedAt: { $ne: null } })
  }

  if (reqQuery.file === 'true') extraFilters.push({ file: { $exists: true } })

  // the api exposed on a secondary domain should not be able to access resources outside of the owner account
  if (publicationSite) {
    extraFilters.push({ 'owner.type': publicationSite.owner.type, 'owner.id': publicationSite.owner.id })
  }

  const query = findUtils.query(reqQuery, locale, user, 'datasets', fieldsMap, false, extraFilters)
  const sort = findUtils.sort(reqQuery.sort)
  const project = findUtils.project(reqQuery.select, [], reqQuery.raw === 'true')
  const [skip, size] = findUtils.pagination(reqQuery)

  const t0 = Date.now()
  const countPromise = reqQuery.count !== 'false' && datasets.countDocuments(query, options).then(res => {
    if (explain) explain.countMS = Date.now() - t0
    return res
  })
  const resultsPromise = size > 0 && datasets.find(query, options).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray().then(res => {
    if (explain) explain.resultsMS = Date.now() - t0
    return res
  })
  const facetsPromise = reqQuery.facets && datasets.aggregate(findUtils.facetsQuery(reqQuery, user, 'datasets', facetFields, filterFields, nullFacetFields, extraFilters), options).toArray().then(res => {
    if (explain) explain.facetsMS = Date.now() - t0
    return res
  })
  const sumsPromise = reqQuery.sums && datasets
    .aggregate(findUtils.sumsQuery(reqQuery, user, 'datasets', sumsFields, filterFields, extraFilters), options).toArray()
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
  for (const r of response.results) {
    if (reqQuery.raw !== 'true') r.userPermissions = permissions.list('datasets', r, user)
    datasetUtils.clean(publicBaseUrl, publicationSite, r, reqQuery)
  }
  if (explain) {
    explain.cleanMS = Date.now() - t1
    response.explain = explain
  }
  return response
}

/**
 *
 * @param {import('mongodb').Db} db
 * @param {string} locale
 * @param {any} user
 * @param {any} owner
 * @param {any} body
 * @param {any[]} files
 * @param {boolean} draft
 * @param {(callback) => void} onClose
 * @returns {Promise<any>}
 */
exports.createDataset = async (db, locale, user, owner, body, files, draft, onClose) => {
  validateURLFriendly(locale, body.id)
  validateURLFriendly(locale, body.slug)

  const datasetFile = files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
  const attachmentsFile = files.find(f => f.fieldname === 'attachments')

  if ([!!datasetFile, !!body.remoteFile, body.isVirtual, body.isRest, body.isMetaOnly].filter(b => b).length > 1) {
    throw createError(400, 'Un jeu de données ne peut pas être de plusieurs types à la fois')
  }

  const dataset = { ...body }
  dataset.owner = owner
  const date = new Date().toISOString()
  dataset.createdAt = dataset.updatedAt = date
  dataset.createdBy = dataset.updatedBy = { id: user.id, name: user.name }
  dataset.permissions = []
  dataset.schema = dataset.schema || []
  if (dataset.extensions) {
    prepareExtensions(locale, dataset.extensions)
    dataset.schema = await prepareExtensionsSchema(db, dataset.schema, dataset.extensions)
  }
  curateDataset(dataset)
  permissions.initResourcePermissions(dataset)

  if (datasetFile) {
    dataset.title = dataset.title || titleFromFileName(datasetFile.originalname)
    const filePatch = {
      status: 'loaded',
      dataUpdatedBy: dataset.updatedBy,
      dataUpdatedAt: dataset.updatedAt,
      loadedFile: {
        name: datasetFile.originalname,
        size: datasetFile.size,
        mimetype: datasetFile.mimetype
      }
    }
    if (draft) {
      dataset.status = 'draft'
      filePatch.draftReason = { key: 'file-new', message: 'Nouveau jeu de données chargé en mode brouillon' }
      dataset.draft = filePatch
    } else {
      Object.assign(dataset, filePatch)
    }
  } else if (body.isVirtual) {
    if (!body.title) throw createError(400, 'Un jeu de données virtuel doit être créé avec un titre')
    if (attachmentsFile) throw createError(400, 'Un jeu de données virtuel ne peut pas avoir de pièces jointes')
    dataset.virtual = dataset.virtual || { children: [] }
    dataset.schema = await virtualDatasetsUtils.prepareSchema(db, dataset)
    dataset.status = 'indexed'
  } else if (body.isRest) {
    if (!body.title) throw createError(400, 'Un jeu de données éditable doit être créé avec un titre')
    if (attachmentsFile) throw createError(400, 'Un jeu de données éditable ne peut pas être créé avec des pièces jointes')
    dataset.rest = dataset.rest || {}
    dataset.schema = dataset.schema || []
    dataset.status = 'created'
    if (dataset.initFrom) prepareInitFrom(dataset, user)
  } else if (body.isMetaOnly) {
    if (!body.title) throw createError(400, 'Un jeu de données métadonnées doit être créé avec un titre')
    if (attachmentsFile) throw createError(400, 'Un jeu de données virtuel ne peut pas avoir de pièces jointes')
  } else if (body.remoteFile) {
    dataset.title = dataset.title || titleFromFileName(body.remoteFile.name || path.basename(new URL(body.remoteFile.url).pathname))
    dataset.status = 'imported'
  } else {
    throw createError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel" ou "éditable" ou "métadonnées"')
  }

  const insertedDatasetFull = await datasetUtils.insertWithId(db, dataset, onClose)
  const insertedDataset = datasetUtils.mergeDraft(insertedDatasetFull)

  if (datasetFile) {
    await fs.emptyDir(datasetUtils.loadingDir(insertedDataset))
    await fs.move(datasetFile.path, datasetUtils.loadedFilePath(insertedDataset))
    if (attachmentsFile) {
      await fs.move(attachmentsFile.path, datasetUtils.loadingDattachmentsFilePath(insertedDataset))
    }
  }
  if (dataset.extensions) debugMasterData(`POST dataset ${dataset.id} (${insertedDataset.slug}) with extensions by ${user?.name} (${user?.id})`, insertedDataset.extensions)
  if (dataset.masterData) debugMasterData(`POST dataset ${dataset.id} (${insertedDataset.slug}) with masterData by ${user?.name} (${user?.id})`, insertedDataset.masterData)

  return insertedDataset
}

exports.deleteDataset = async (app, dataset) => {
  const db = app.get('db')
  const es = app.get('es')
  try {
    await fs.remove(dir(dataset))
  } catch (err) {
    console.warn('Error while deleting dataset draft directory', err)
  }
  if (dataset.isRest) {
    try {
      await restDatasetsUtils.deleteDataset(db, dataset)
    } catch (err) {
      console.warn('Error while removing mongodb collection for REST dataset', err)
    }
  }

  await db.collection('datasets').deleteOne({ id: dataset.id })
  await db.collection('journals').deleteOne({ type: 'dataset', id: dataset.id })

  if (!dataset.isVirtual) {
    try {
      await esUtils.delete(es, dataset)
    } catch (err) {
      console.warn('Error while deleting dataset indexes and alias', err)
    }
    if (!dataset.draftReason) {
      await updateStorage(app, dataset, true)
    }
  }
}

/**
 *
 * @param {any} app
 * @param {any} dataset
 * @param {any} patch
 * @param {any[]} [removedRestProps]
 * @param {boolean} [attemptMappingUpdate]
 */
exports.applyPatch = async (app, dataset, patch, removedRestProps, attemptMappingUpdate) => {
  if (patch.extensions) debugMasterData(`PATCH dataset ${dataset.id} (${dataset.slug}) extensions`, dataset.extensions, patch.extensions)
  if (patch.masterData) debugMasterData(`PATCH dataset ${dataset.id} (${dataset.slug}) masterData`, dataset.masterData, patch.masterData)

  const db = app.get('db')

  // manage automatic export of REST datasets into files
  if (patch.exports && patch.exports.restToCSV) {
    if (!patch.exports.restToCSV.active && await fs.pathExists(exportedFilePath(dataset, '.csv'))) {
      await fs.remove(exportedFilePath(dataset, '.csv'))
    }
  }

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
      await restDatasetsUtils.collection(db, dataset).updateMany({},
        { $unset: unset }
      )
    }
  }

  if (removedRestProps && removedRestProps.length) {
    // some property was removed in rest dataset, trigger full re-indexing
    await restDatasetsUtils.collection(db, dataset).updateMany({},
      { $unset: removedRestProps.reduce((a, df) => { a[df.key] = ''; return a }, {}) }
    )
  }

  if (attemptMappingUpdate) {
    try {
      // this method will routinely throw errors
      // we just try in case elasticsearch considers the new mapping compatible
      // so that we might optimize and reindex only when necessary
      await esUtils.updateDatasetMapping(app.get('es'), { id: dataset.id, schema: patch.schema }, dataset)
      patch.status = 'indexed'
    } catch (err) {
      // generated ES mappings are not compatible, trigger full re-indexing
    }
  }

  Object.assign(dataset, patch)

  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)

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
}

// synchronize the list of application references stored in dataset.extras.applications
// used for quick access to capture, and default sorting in dataset pages
exports.syncApplications = async (db, datasetId) => {
  const dataset = await db.collection('datasets').findOne({ id: datasetId }, { projection: { owner: 1, extras: 1 } })
  if (!dataset) return
  const applications = await db.collection('applications')
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
  await db.collection('datasets')
    .updateOne({ id: datasetId }, { $set: { 'extras.applications': applicationsExtras } })
}

exports.validateDraft = async (app, datasetFull, datasetDraft, user, req) => {
  const db = app.get('db')
  const patch = { ...datasetFull.draft }
  if (user) {
    patch.updatedAt = (new Date()).toISOString()
    patch.updatedBy = { id: user.id, name: user.name }
  }
  if (datasetFull.draft.dataUpdatedAt) {
    patch.dataUpdatedAt = patch.updatedAt
    patch.dataUpdatedBy = patch.updatedBy
  }
  delete patch.status
  delete patch.finalizedAt
  delete patch.draftReason
  delete patch.count
  delete patch.bbox
  delete patch.storage
  const patchedDataset = (await db.collection('datasets').findOneAndUpdate({ id: datasetFull.id },
    { $set: patch, $unset: { draft: '' } },
    { returnDocument: 'after' }
  )).value
  if (datasetFull.originalFile) await fs.remove(originalFilePath(datasetFull))
  if (datasetFull.file) {
    await fs.remove(filePath(datasetFull))
    await fs.remove(fullFilePath(datasetFull))
    webhooks.trigger(db, 'dataset', patchedDataset, { type: 'data-updated' })

    if (req) {
      const breakingChanges = getSchemaBreakingChanges(datasetFull.schema, patchedDataset.schema)
      for (const breakingChange of breakingChanges) {
        webhooks.trigger(db, 'dataset', patchedDataset, {
          type: 'breaking-change',
          body: require('i18n').getLocales().reduce((a, locale) => {
            a[locale] = req.__({ phrase: 'breakingChanges.' + breakingChange.type, locale }, { title: patchedDataset.title, key: breakingChange.key })
            return a
          }, {})
        })
      }
    }
  }
  await fs.ensureDir(dir(patchedDataset))
  await fs.remove(originalFilePath(patchedDataset))
  await fs.move(originalFilePath(datasetDraft), originalFilePath(patchedDataset))
  if (await fs.pathExists(attachmentsDir(datasetDraft))) {
    await fs.remove(attachmentsDir(patchedDataset))
    await fs.move(attachmentsDir(datasetDraft), attachmentsDir(patchedDataset))
  }

  const statusPatch = { status: 'analyzed' }
  const statusPatchedDataset = (await db.collection('datasets').findOneAndUpdate({ id: datasetFull.id },
    { $set: statusPatch },
    { returnDocument: 'after' }
  )).value
  await journals.log(app, statusPatchedDataset, { type: 'draft-validated' }, 'dataset')
  try {
    await esUtils.delete(app.get('es'), datasetDraft)
  } catch (err) {
    if (err.statusCode !== 404) throw err
  }
  await fs.remove(dir(datasetDraft))
  await updateStorage(app, statusPatchedDataset)
  return statusPatchedDataset
}

exports.validateCompatibleDraft = async (app, dataset) => {
  if (dataset.draftReason && dataset.draftReason.key === 'file-updated') {
    const datasetFull = await app.get('db').collection('datasets').findOne({ id: dataset.id })
    if (!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument') && schemasFullyCompatible(datasetFull.schema, dataset.schema, true)) {
      return await exports.validateDraft(app, datasetFull, dataset)
    }
  }
  return null
}
