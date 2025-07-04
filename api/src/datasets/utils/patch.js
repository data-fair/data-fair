import config from '#config'
import mongo from '#mongo'
import path from 'node:path'
import equal from 'deep-equal'
import moment from 'moment'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mime from 'mime-types'
import { CronJob } from 'cron'
import * as geo from './geo.js'
import * as datasetUtils from './index.js'
import * as extensions from './extensions.ts'
import * as schemaUtils from './data-schema.js'
import * as virtualDatasetsUtils from './virtual.ts'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import catalogsPublicationQueue from '../../misc/utils/catalogs-publication-queue.ts'

/**
 * @param {any} app
 * @param {any} patch
 * @param {any} dataset
 * @param {import('@data-fair/lib-express').SessionStateAuthenticated} sessionState
 * @param {string} locale
 * @param {string} draftValidationMode
 * @param {any[]} [files]
 * @returns {Promise<{removedRestProps?: any[], attemptMappingUpdate?: boolean, isEmpty?: boolean}>}
 */
export const preparePatch = async (app, patch, dataset, sessionState, locale, draftValidationMode, files) => {
  const db = mongo.db

  patch.id = dataset.id
  patch.slug = patch.slug || dataset.slug
  datasetUtils.setUniqueRefs(patch)
  datasetUtils.curateDataset(patch)

  // Changed a previously failed dataset, retry the previous step
  if (dataset.status === 'error') {
    if (dataset.errorStatus) {
      patch.status = dataset.errorStatus
      patch.errorStatus = null
      patch.errorRetry = null
    } else if (dataset.isVirtual) patch.status = 'indexed'
    else if (dataset.isRest) patch.status = 'analyzed'
    else if (dataset.remoteFile && !dataset.originalFile) patch.status = 'imported'
    else patch.status = 'stored'

    await wsEmitter.emit('datasets/' + dataset.id + '/task-progress', {})
    await mongo.db.collection('journals').updateOne({ type: 'dataset', id: dataset.id }, { $unset: { taskProgress: 1 } })
  }

  const datasetFile = files && files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
  const attachmentsFile = files?.find(f => f.fieldname === 'attachments')

  if (datasetFile) {
    patch.loaded = {
      dataset: {
        name: datasetFile.originalname,
        size: datasetFile.size,
        mimetype: datasetFile.mimetype
      }
    }
  }
  if (attachmentsFile) {
    patch.loaded = patch.loaded || {}
    patch.loaded.attachments = true
  }

  if (patch.attachments) {
    patch._attachmentsTargets = []
    for (const attachment of patch.attachments) {
      if (['file', 'remoteFile'].includes(attachment.type) && attachment.name && !attachment.mimetype) {
        if (!path.extname(attachment.name)) throw httpError(400, `Le nom de fichier de la pièce jointe ${attachment.name} ne contient pas d'extension.`)
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
            throw httpError(400, `Impossible de créer la pièce jointe ${attachment.name} sans URL cible`)
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
  patch.updatedBy = { id: sessionState.user.id, name: sessionState.user.name }
  if (datasetFile || attachmentsFile) {
    patch.dataUpdatedAt = patch.updatedAt
    patch.dataUpdatedBy = patch.updatedBy
  }

  if (patch.extensions) extensions.prepareExtensions(locale, patch.extensions, dataset.extensions)
  if (patch.extensions || dataset.extensions) {
    const extendedSchema = await schemaUtils.extendedSchema(db, { ...dataset, ...patch })
    await extensions.checkExtensions(extendedSchema, patch.extensions || dataset.extensions)
    patch.schema = await extensions.prepareExtensionsSchema(patch.schema || dataset.schema, patch.extensions || dataset.extensions)
  } else if (patch.schema || ('attachmentsAsImage' in patch && patch.attachmentsAsImage !== dataset.attachmentsAsImage)) {
    patch.schema = await schemaUtils.extendedSchema(db, { ...dataset, ...patch })
  }

  // manage automatic export of REST datasets into files
  if (patch.exports && patch.exports.restToCSV) {
    if (patch.exports.restToCSV.active) {
      const job = new CronJob(config.exportRestDatasets.cron, () => {})
      patch.exports.restToCSV.nextExport = job.nextDate().toISO()
    } else {
      delete patch.exports.restToCSV.nextExport
    }
    patch.exports.lastExport = dataset?.exports?.restToCSV?.lastExport
  }

  const removedRestProps = (dataset.isRest && patch.schema && dataset.schema.filter(df => !df['x-calculated'] && !patch.schema.find(f => f.key === df.key))) ?? []
  if (dataset.isRest && dataset.rest?.storeUpdatedBy && patch.rest && !patch.rest.storeUpdatedBy) {
    removedRestProps.push({ key: '_updatedBy' })
    removedRestProps.push({ key: '_updatedByName' })
  }

  // Re-publish publications (for catalogs in datafair)
  if (!patch.publications && dataset.publications && dataset.publications.length) {
    for (const p of dataset.publications) {
      if (p.status !== 'deleted') p.status = 'waiting'
    }
    patch.publications = dataset.publications
  }

  // Re-publish publications (with catalogs service)
  catalogsPublicationQueue.updatePublication(dataset.id)

  if (patch.rest) {
    // be extra sure that primaryKeyMode is preserved
    patch.rest.primaryKeyMode = patch.rest.primaryKeyMode || dataset.rest.primaryKeyMode
    if (patch.rest.primaryKeyMode !== dataset.rest.primaryKeyMode) {
      throw httpError(400, 'Impossible de changer le mode de clé primaire')
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

  const reindexerStatus = dataset.file ? 'validated' : 'analyzed'

  if (datasetFile || attachmentsFile) {
    patch.dataUpdatedBy = patch.updatedBy
    patch.dataUpdatedAt = patch.updatedAt
    patch.status = 'loaded'
    patch.draftReason = { key: 'file-updated', message: 'Nouveau fichier chargé sur un jeu de données existant', validationMode: draftValidationMode }
  } else if (patch.remoteFile) {
    if (patch.remoteFile?.url !== dataset.remoteFile?.url || patch.remoteFile?.name !== dataset.remoteFile?.name || patch.remoteFile.forceUpdate) {
      patch.status = 'imported'
      patch.remoteFile.forceUpdate = true
      // TODO: do not use always as default value when the dataset is public or published ?
      patch.draftReason = { key: 'file-updated', message: 'Nouveau fichier chargé sur un jeu de données existant', validationMode: draftValidationMode }
    } else {
      if (dataset.remoteFile.lastModified) patch.remoteFile.lastModified = dataset.remoteFile.lastModified
      if (dataset.remoteFile.etag) patch.remoteFile.etag = dataset.remoteFile.etag
    }
  } else if (dataset.isVirtual) {
    if (patch.schema || patch.virtual) {
      patch.schema = await virtualDatasetsUtils.prepareSchema({ ...dataset, ...patch })
      patch.status = 'indexed'
    }
  } else if (patch.extensions && !dataset.isRest) {
    // extensions have changed, trigger full re-indexing
    // in "rest" dataset no need for full reindexing if the schema is still compatible, extension-updater worker will suffice
    patch.status = reindexerStatus
    for (const e of patch.extensions) delete e.needsUpdate
  } else if (patch.projection && (!dataset.projection || patch.projection.code !== dataset.projection.code) && ((coordXProp && coordYProp) || projectGeomProp)) {
    // geo projection has changed, trigger full re-indexing
    patch.status = reindexerStatus
  } else if (patch.schema && geo.geoFieldsKey(patch.schema) !== geo.geoFieldsKey(dataset.schema)) {
    // geo concepts haved changed, trigger full re-indexing
    patch.status = reindexerStatus
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.separator !== f.separator))) {
    // some separator has changed on a field, trigger full re-indexing
    patch.status = reindexerStatus
  } else if (patch.schema && patch.schema.find(f => dataset.schema.find(df => df.key === f.key && df.timeZone !== f.timeZone))) {
    // some timeZone has changed on a field, trigger full re-indexing
    patch.status = reindexerStatus
  } else if (removedRestProps.length) {
    patch.status = 'analyzed'
  } else if (dataset.file && patch.schema && datasetUtils.schemasTransformChange(patch.schema, dataset.schema)) {
    patch.status = 'analyzed'
  } else if (dataset.file && patch.schema && ['validation-updated', 'finalized'].includes(dataset.status) && datasetUtils.schemasFullyCompatible(patch.schema, dataset.schema, true) && datasetUtils.schemaHasValidationRules(patch.schema) && !datasetUtils.schemasValidationCompatible(patch.schema, dataset.schema)) {
    patch.status = 'validation-updated'
  } else if (patch.schema && !datasetUtils.schemasFullyCompatible(patch.schema, dataset.schema, true)) {
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
