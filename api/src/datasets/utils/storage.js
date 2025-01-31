import * as virtualDatasetsUtils from './virtual.js'
import * as esUtils from '../es/index.ts'
import * as restDatasetsUtils from './rest.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import i18n from 'i18n'
import fs from 'fs-extra'
import * as limits from '../../misc/utils/limits.js'
import config from '#config'
import mongo from '#mongo'
import debug from 'debug'
import { dataFiles, lsAttachments, lsMetadataAttachments, attachmentPath, metadataAttachmentPath } from './files.js'

const debugLimits = debug('limits')

/**
 * @param {import('mongodb').Db} db
 * @param {string} locale
 * @param {any} owner
 * @param {any} overwriteDataset
 * @param {number} contentLength
 * @param {boolean} overwrite
 * @param {boolean} indexed
 * @returns
 */
export const checkStorage = async (db, locale, owner, overwriteDataset, contentLength, indexed = false) => {
  const estimatedContentSize = contentLength - 210

  /** @type {any} */
  const debugInfo = { owner, estimatedContentSize }

  if (config.defaultLimits.datasetStorage !== -1 && config.defaultLimits.datasetStorage < estimatedContentSize) {
    debugLimits('datasetStorage/checkStorage', debugInfo)
    throw httpError(413, 'Vous avez atteint la limite de votre espace de stockage pour ce jeu de données.')
  }
  if (config.defaultLimits.datasetIndexed !== -1 && config.defaultLimits.datasetIndexed < estimatedContentSize) {
    debugLimits('datasetIndexed/checkStorage', debugInfo)
    throw httpError(413, 'Vous dépassez la taille de données indexées autorisée pour ce jeu de données.')
  }
  const remaining = await limits.remaining(db, owner)
  debugInfo.remaining = { ...remaining }
  if (overwriteDataset && overwriteDataset.storage) {
    debugInfo.overwriteDataset = overwriteDataset.storage
    // ignore the size of the dataset we are overwriting
    if (remaining.storage !== -1) remaining.storage += overwriteDataset.storage.size
    if (remaining.indexed !== -1) remaining.indexed += overwriteDataset.storage.size
  }
  const storageOk = remaining.storage === -1 || ((remaining.storage - estimatedContentSize) >= 0)
  const indexedOk = !indexed || remaining.indexed === -1 || ((remaining.indexed - estimatedContentSize) >= 0)
  if (!storageOk || !indexedOk) {
    if (!storageOk) {
      debugLimits('exceedLimitStorage/checkStorage', debugInfo)
      throw httpError(429, i18n.__({ locale, phrase: 'errors.exceedLimitStorage' }))
    }
    if (!indexedOk) {
      debugLimits('exceedLimitIndexed/checkStorage', debugInfo)
      throw httpError(429, i18n.__({ locale, phrase: 'errors.exceedLimitIndexed' }))
    }
  }
}

export const storage = async (db, es, dataset) => {
  const storage = {
    size: 0,
    dataFiles: await dataFiles(dataset),
    indexed: { size: 0, parts: [] },
    attachments: { size: 0, count: 0 },
    metadataAttachments: { size: 0, count: 0 },
    masterData: { size: 0, count: 0 }
  }
  for (const df of storage.dataFiles) delete df.url

  if (dataset.isVirtual) {
    const descendants = await virtualDatasetsUtils.descendants(db, dataset, false, ['storage', 'owner', 'masterData', 'count'], false)
    let masterDataSize = 0
    const masterDataCount = 0
    for (const descendant of descendants) {
      if (!descendant?.masterData?.virtualDatasets?.active) continue
      if (descendant.owner.type === dataset.owner.type && descendant.owner.id === dataset.owner.id) continue
      const remoteService = await db.collection('remote-services').findOne({ id: 'dataset:' + descendant.id })
      if (!remoteService) throw new Error(`missing remote service dataset:${descendant.id}`)
      let storageRatio = remoteService.virtualDatasets?.storageRatio || 0
      const queryableDataset = { ...dataset }
      queryableDataset.descendants = [descendant.id]
      const count = await esUtils.count(es, queryableDataset, {})
      storageRatio *= (count / descendant.count)
      masterDataSize += Math.round(descendant.storage.indexed.size * storageRatio)
    }
    storage.indexed.size = masterDataSize
    storage.indexed.parts.push('master-data')
    storage.masterData = { size: masterDataSize, count: masterDataCount }
  }

  // storage used by data-files
  const dataFilesObj = storage.dataFiles.reduce((obj, df) => { obj[df.key] = df; return obj }, {})
  for (const dataFile of storage.dataFiles) {
    storage.size += dataFile.size
  }
  if (dataFilesObj.full) {
    storage.indexed = {
      size: dataFilesObj.full.size,
      parts: ['full-file']
    }
  } else if (dataFilesObj.normalized) {
    storage.indexed = {
      size: dataFilesObj.normalized.size,
      parts: ['normalized-file']
    }
  } else if (dataFilesObj.original) {
    storage.indexed = {
      size: dataFilesObj.original.size,
      parts: ['original-file']
    }
  }

  // storage used by mongodb collections
  if (dataset.isRest) {
    const collection = await restDatasetsUtils.collection(db, dataset)
    const stats = await collection.aggregate([{ $collStats: { storageStats: {} } }]).next()
    storage.collection = { size: stats.storageStats.size, count: stats.storageStats.count }
    storage.size += storage.collection.size
    storage.indexed = {
      size: storage.collection.size,
      parts: ['collection']
    }

    if (dataset.rest && dataset.rest.history) {
      try {
        const revisionsCollection = await restDatasetsUtils.revisionsCollection(db, dataset)
        const revisionsStats = await revisionsCollection.aggregate([{ $collStats: { storageStats: {} } }]).next()
        // we remove 60 bytes per line that are not really part of the original payload but added by _action, _updatedAt, _hash and _i.
        storage.revisions = { size: revisionsStats.storageStats.size, count: revisionsStats.storageStats.count }
        storage.size += storage.revisions.size
      } catch (err) {
        // ignore, this is probably a new dataset whose revisions collection was not initialized
      }
    }
  }

  // storage used by attachments
  const documentProperty = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (documentProperty && !dataset.isVirtual) {
    const attachments = await lsAttachments(dataset)
    for (const attachment of attachments) {
      storage.attachments.size += (await fs.promises.stat(attachmentPath(dataset, attachment))).size
      storage.attachments.count++
    }
    storage.size += storage.attachments.size

    if (!documentProperty['x-capabilities'] || documentProperty['x-capabilities'].indexAttachment !== false) {
      storage.indexed.size += storage.attachments.size
      storage.indexed.parts.push('attachments')
    }
  }

  // storage used by metadata attachments
  const metadataAttachments = await lsMetadataAttachments(dataset)
  for (const metadataAttachment of metadataAttachments) {
    storage.metadataAttachments.size += (await fs.promises.stat(metadataAttachmentPath(dataset, metadataAttachment))).size
    storage.metadataAttachments.count++
  }
  storage.size += storage.metadataAttachments.size
  return storage
}

// After a change that might impact consumed storage, we store the value
export const updateStorage = async (app, dataset, deleted = false, checkRemaining = false) => {
  const db = mongo.db
  const es = app.get('es')
  if (dataset.draftReason) {
    console.log(new Error('updateStorage should not be called on a draft dataset'))
    return
  }
  if (!deleted) {
    await db.collection('datasets').updateOne({ id: dataset.id }, {
      $set: {
        storage: await storage(db, es, dataset)
      }
    })
  }
  return updateTotalStorage(db, dataset.owner, checkRemaining)
}

export const updateTotalStorage = async (db, owner, checkRemaining = false) => {
  const aggQuery = [
    { $match: { 'owner.type': owner.type, 'owner.id': owner.id } },
    { $project: { 'storage.size': 1, 'storage.indexed.size': 1 } },
    { $group: { _id: null, size: { $sum: '$storage.size' }, indexed: { $sum: '$storage.indexed.size' }, count: { $sum: 1 } } }
  ]
  const res = await db.collection('datasets').aggregate(aggQuery).toArray()
  const totalStorage = { size: (res[0] && res[0].size) || 0, indexed: (res[0] && res[0].indexed) || 0, count: (res[0] && res[0].count) || 0 }

  const appRes = await db.collection('applications').aggregate(aggQuery).toArray()
  totalStorage.size += (appRes[0] && appRes[0].size) || 0

  await limits.setConsumption(db, owner, 'store_bytes', totalStorage.size)
  await limits.setConsumption(db, owner, 'indexed_bytes', totalStorage.indexed)
  await limits.setConsumption(db, owner, 'nb_datasets', totalStorage.count)

  if (checkRemaining && process.env.NO_STORAGE_CHECK !== 'true') {
    const remaining = await limits.remaining(db, owner)
    if (remaining.storage === 0) {
      debugLimits('exceedLimitStorage/updateTotalStorage', { owner, remaining })
      throw httpError(429, 'Vous avez atteint la limite de votre espace de stockage.')
    }
    if (remaining.indexed === 0) {
      debugLimits('exceedLimitIndexed/updateTotalStorage', { owner, remaining })
      throw httpError(429, 'Vous avez atteint la limite de votre espace de données indexées.')
    }
    if (remaining.nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/updateTotalStorage', { owner, remaining })
      throw httpError(429, 'Vous avez atteint la limite de votre nombre de jeux de données.')
    }
  }
  return totalStorage
}
