const config = /** @type {any} */(require('config'))
const stableStringify = require('json-stable-stringify')
const moment = require('moment')
const CronJob = require('cron').CronJob
const geo = require('./geo')
const ajv = require('../../misc/utils/ajv')
const datasetUtils = require('./')
const extensions = require('./extensions')
const datasetPatchSchema = require('../../../contract/dataset-patch')
const virtualDatasetsUtils = require('./virtual')

exports.validatePatch = ajv.compile(datasetPatchSchema)

/**
 * @param {any} app
 * @param {any} patch
 * @param {any} dataset
 * @param {any} user
 * @param {string} locale
 * @param {any[]} [files]
 * @returns {Promise<{removedRestProps?: any[], attemptMappingUpdate?: boolean, isEmpty?: boolean}>}
 */
exports.preparePatch = async (app, patch, dataset, user, locale, files) => {
  const db = app.get('db')

  patch.id = dataset.id
  patch.slug = patch.slug || dataset.slug
  datasetUtils.setUniqueRefs(patch)
  datasetUtils.curateDataset(patch)

  // Changed a previously failed dataset, retry everything.
  // Except download.. We only try it again if the fetch failed.
  if (dataset.status === 'error') {
    if (dataset.isVirtual) patch.status = 'indexed'
    else if (dataset.isRest) patch.status = 'analyzed'
    else if (dataset.remoteFile && !dataset.originalFile) patch.status = 'imported'
    else patch.status = 'stored'
  }

  const datasetFile = files && files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')

  if (datasetFile) {
    patch.loadedFile = {
      name: datasetFile.originalname,
      size: datasetFile.size,
      mimetype: datasetFile.mimetype
    }
  }

  // Ignore patch that doesn't bring actual change
  for (const patchKey of Object.keys(patch)) {
    if (stableStringify(patch[patchKey]) === stableStringify(dataset[patchKey])) { delete patch[patchKey] }
  }
  if (Object.keys(patch).length === 0) return { isEmpty: true }

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: user.id, name: user.name }

  if (patch.extensions) extensions.prepareExtensions(locale, patch.extensions, dataset.extensions)
  if (patch.extensions || dataset.extensions) {
    patch.schema = await extensions.prepareSchema(db, patch.schema || dataset.schema, patch.extensions || dataset.extensions)
  }

  // manage automatic export of REST datasets into files
  if (patch.exports && patch.exports.restToCSV) {
    if (patch.exports.restToCSV.active) {
      const job = new CronJob(config.exportRestDatasets.cron, () => {})
      patch.exports.restToCSV.nextExport = job.nextDates().toISOString()
    } else {
      delete patch.exports.restToCSV.nextExport
    }
    patch.exports.restToCSV.lastExport = dataset?.exports?.restToCSV?.lastExport
  }

  const removedRestProps = (dataset.isRest && patch.schema && dataset.schema.filter(df => !df['x-calculated'] && !df['x-extension'] && !patch.schema.find(f => f.key === df.key))) ?? []
  if (dataset.isRest && dataset.rest?.storeUpdatedBy && patch.rest && !patch.rest.storeUpdatedBy) {
    removedRestProps.push({ key: '_updatedBy' })
    removedRestProps.push({ key: '_updatedByName' })
  }

  // Re-publish publications
  if (!patch.publications && dataset.publications && dataset.publications.length) {
    for (const p of dataset.publications) {
      if (p.status !== 'deleted') p.status = 'waiting'
    }
    patch.publications = dataset.publications
  }

  const coordXProp = dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#coordX')
  const coordYProp = dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#coordY')
  const projectGeomProp = dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#Geometry')

  let attemptMappingUpdate = false

  if (datasetFile) {
    patch.dataUpdatedBy = patch.updatedBy
    patch.dataUpdatedAt = patch.updatedAt
    patch.status = 'loaded'
  } else if (patch.remoteFile) {
    if (patch.remoteFile?.url !== dataset.remoteFile?.url) {
      delete patch.remoteFile.lastModified
      delete patch.remoteFile.etag
      patch.status = 'imported'
    } else {
      patch.remoteFile.lastModified = dataset.remoteFile.lastModified
      patch.remoteFile.etag = dataset.remoteFile.etag
    }
  } else if (dataset.isVirtual) {
    if (patch.schema || patch.virtual) {
      patch.schema = await virtualDatasetsUtils.prepareSchema(db, { ...dataset, ...patch })
      patch.status = 'indexed'
    }
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.ignoreDetection !== f.ignoreDetection))) {
    // some ignoreDetection param has changed on a field, trigger full analysis / re-indexing
    patch.status = 'loaded'
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.ignoreIntegerDetection !== f.ignoreIntegerDetection))) {
    // some ignoreIntegerDetection param has changed on a field, trigger full analysis / re-indexing
    patch.status = 'loaded'
  } else if (patch.extensions) {
    // extensions have changed, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (patch.projection && (!dataset.projection || patch.projection.code !== dataset.projection.code) && ((coordXProp && coordYProp) || projectGeomProp)) {
    // geo projection has changed, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (patch.schema && geo.geoFieldsKey(patch.schema) !== geo.geoFieldsKey(dataset.schema)) {
    // geo concepts haved changed, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.separator !== f.separator))) {
    // some separator has changed on a field, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.timeZone !== f.timeZone))) {
    // some timeZone has changed on a field, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (removedRestProps.length) {
    patch.status = 'analyzed'
  } else if (patch.schema && !datasetUtils.schemasFullyCompatible(patch.schema, dataset.schema)) {
    attemptMappingUpdate = true
    patch.status = 'analyzed'
  } else if (patch.thumbnails || patch.masterData) {
    // just change finalizedAt so that cache is invalidated, but the worker doesn't relly need to work on the dataset
    patch.finalizedAt = (new Date()).toISOString()
  } else if (patch.rest && dataset.rest && patch.rest.storeUpdatedBy !== dataset.rest.storeUpdatedBy) {
    // changes in rest history mode will be processed by the finalizer worker
    patch.status = 'analyzed'
  } else if (patch.rest) {
    // changes in rest history mode will be processed by the finalizer worker
    patch.status = 'indexed'
  }

  return { removedRestProps, attemptMappingUpdate }
}
