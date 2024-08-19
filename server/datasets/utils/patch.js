const config = /** @type {any} */(require('config'))
const path = require('node:path')
const equal = require('deep-equal')
const moment = require('moment')
const createError = require('http-errors')
const mime = require('mime-types')
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

  // changed a previously failed dataset, retry the previous update (dataset._currentUpdate should be preserved)
  if (dataset.status === 'error') {
    patch.status = 'updated'
    patch._currentUpdate = dataset._currentUpdate ?? { reindex: true }
  } else {
    patch._currentUpdate = {}
  }

  const datasetFile = files && files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
  const attachmentsFile = files?.find(f => f.fieldname === 'attachments')

  if (datasetFile) {
    patch.status = 'updated'
    patch._currentUpdate.dataFile = {
      name: datasetFile.originalname,
      size: datasetFile.size,
      mimetype: datasetFile.mimetype
    }
  }
  if (attachmentsFile) {
    patch.status = 'updated'
    patch._currentUpdate.attachments = true
  }

  if (patch.attachments) {
    patch._attachmentsTargets = []
    for (const attachment of patch.attachments) {
      if (['file', 'remoteFile'].includes(attachment.type) && attachment.name && !attachment.mimetype) {
        if (!path.extname(attachment.name)) throw createError(400, `Le nom de fichier de la pièce jointe ${attachment.name} ne contient pas d'extension.`)
        const mimetype = mime.lookup(attachment.name)
        if (mimetype) attachment.mimetype = mimetype
      }
      if (attachment.type === 'remoteFile') {
        if (attachment.targetUrl) {
          patch._attachmentsTargets.push({ ...attachment })
          delete attachment.targetUrl
        } else {
          const existingAttachmentTarget = dataset._attachmentsTargets?.find(a => a.name === attachment.name)
          if (!existingAttachmentTarget) {
            throw createError(400, `Impossible de créer la pièce jointe ${attachment.name} sans URL cible`)
          }
          const attachmentTarget = { ...existingAttachmentTarget, ...attachment }
          patch._attachmentsTargets.push(attachmentTarget)
        }
      }
    }
  }

  // Ignore patch that doesn't bring actual change
  for (const patchKey of Object.keys(patch)) {
    if (equal(patch[patchKey], dataset[patchKey])) { delete patch[patchKey] }
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

  if (patch.rest) {
    // be extra sure that primaryKeyMode is preserved
    patch.rest.primaryKeyMode = patch.rest.primaryKeyMode || dataset.rest.primaryKeyMode
    if (patch.rest.primaryKeyMode !== dataset.rest.primaryKeyMode) {
      throw createError(400, 'Impossible de changer le mode de clé primaire')
    }
  }

  if (patch.readApiKey && (patch.readApiKey.active !== dataset.readApiKey?.active || patch.readApiKey?.interval !== dataset.readApiKey?.interval)) {
    patch._readApiKey = datasetUtils.createReadApiKey(dataset.owner, patch.readApiKey)
  }
  if (patch.readApiKey === null) {
    patch._readApiKey = null
  }

  const coordXProp = dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#coordX')
  const coordYProp = dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#coordY')
  const projectGeomProp = dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#Geometry')

  let attemptMappingUpdate = false

  if (datasetFile || attachmentsFile) {
    patch.dataUpdatedBy = patch.updatedBy
    patch.dataUpdatedAt = patch.updatedAt
  } else if (patch.remoteFile) {
    if (patch.remoteFile?.url !== dataset.remoteFile?.url || patch.remoteFile?.name !== dataset.remoteFile?.name || patch.remoteFile.forceUpdate) {
      delete patch.remoteFile.lastModified
      delete patch.remoteFile.etag
      delete patch.remoteFile.forceUpdate
      patch.status = 'updated'
      patch._currentUpdate.downloadRemoteFile = true
    } else {
      patch.remoteFile.lastModified = dataset.remoteFile.lastModified
      patch.remoteFile.etag = dataset.remoteFile.etag
    }
  } else if (dataset.isVirtual) {
    if (patch.schema || patch.virtual) {
      patch.schema = await virtualDatasetsUtils.prepareSchema(db, { ...dataset, ...patch })
      patch.status = 'updated'
    }
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.ignoreDetection !== f.ignoreDetection))) {
    // some ignoreDetection param has changed on a field, trigger full re-indexing
    patch.status = 'updated'
    // TODO: also re-analysis ?
    patch._currentUpdate.reindex = true
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.ignoreIntegerDetection !== f.ignoreIntegerDetection))) {
    // some ignoreIntegerDetection param has changed on a field, trigger full analysis / re-indexing
    patch.status = 'updated'
    // TODO: also re-analysis ?
    patch._currentUpdate.reindex = true
  } else if (patch.extensions && !dataset.isRest) {
    // extensions have changed, trigger full re-indexing
    // in "rest" dataset no need for full reindexing if the schema is still compatible, extension-updater worker will suffice
    patch.status = 'updated'
    patch._currentUpdate.reindex = true
    for (const e of patch.extensions) delete e.needsUpdate
  } else if (patch.projection && (!dataset.projection || patch.projection.code !== dataset.projection.code) && ((coordXProp && coordYProp) || projectGeomProp)) {
    // geo projection has changed, trigger full re-indexing
    patch.status = 'updated'
    patch._currentUpdate.reindex = true
  } else if (patch.schema && geo.geoFieldsKey(patch.schema) !== geo.geoFieldsKey(dataset.schema)) {
    // geo concepts haved changed, trigger full re-indexing
    patch.status = 'updated'
    patch._currentUpdate.reindex = true
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.separator !== f.separator))) {
    // some separator has changed on a field, trigger full re-indexing
    patch.status = 'updated'
    patch._currentUpdate.reindex = true
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.timeZone !== f.timeZone))) {
    // some timeZone has changed on a field, trigger full re-indexing
    patch.status = 'updated'
    patch._currentUpdate.reindex = true
  } else if (removedRestProps.length) {
    patch.status = 'updated'
    patch._currentUpdate.reindex = true
  } else if (dataset.file && patch.schema && ['validation-updated', 'finalized'].includes(dataset.status) && datasetUtils.schemasFullyCompatible(patch.schema, dataset.schema, true) && datasetUtils.schemaHasValidationRules(patch.schema) && !datasetUtils.schemasValidationCompatible(patch.schema, dataset.schema)) {
    patch.status = 'updated'
    patch._currentUpdate.reValidate = true
  } else if (patch.schema && !datasetUtils.schemasFullyCompatible(patch.schema, dataset.schema, true)) {
    attemptMappingUpdate = true
    patch.status = 'updated'
    // reindex will be removed later on if the mapping is successfully updated
    patch._currentUpdate.reindex = true
  } else if (patch.thumbnails || patch.masterData) {
    // just change finalizedAt so that cache is invalidated, but the worker doesn't relly need to work on the dataset
    patch.finalizedAt = (new Date()).toISOString()
  } else if (patch.rest && dataset.rest && patch.rest.storeUpdatedBy !== dataset.rest.storeUpdatedBy) {
    patch.status = 'updated'
    patch._currentUpdate.reindex = true
  } else if (patch.rest) {
    // changes in rest history mode will be processed by the finalizer task, no need to reindex
    patch.status = 'updated'
  }

  return { removedRestProps, attemptMappingUpdate }
}
