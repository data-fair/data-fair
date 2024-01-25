const virtualDatasetsUtils = require('./virtual')
const esUtils = require('../es')
const restDatasetsUtils = require('./rest')
const createError = require('http-errors')
const i18n = require('i18n')
const path = require('path')
const fs = require('fs-extra')
const limits = require('../../misc/utils/limits')
const config = /** @type {any} */(require('config'))
const debugLimits = require('debug')('limits')
const { dataFiles, lsAttachments, lsMetadataAttachments, attachmentsDir, metadataAttachmentsDir } = require('./files')

/**
 * @param {import('mongodb').Db} db
 * @param {string} locale
 * @param {any} owner
 * @param {any} dataset
 * @param {number} contentLength
 * @param {boolean} overwrite
 * @param {boolean} indexed
 * @returns
 */
exports.checkStorage = async (db, locale, owner, dataset, contentLength, overwrite, indexed = false) => {
  const estimatedContentSize = contentLength - 210

  /** @type {any} */
  const debugInfo = { owner, estimatedContentSize }

  if (config.defaultLimits.datasetStorage !== -1 && config.defaultLimits.datasetStorage < estimatedContentSize) {
    debugLimits('datasetStorage/checkStorage', debugInfo)
    throw createError(413, 'Vous avez atteint la limite de votre espace de stockage pour ce jeu de données.')
  }
  if (config.defaultLimits.datasetIndexed !== -1 && config.defaultLimits.datasetIndexed < estimatedContentSize) {
    debugLimits('datasetIndexed/checkStorage', debugInfo)
    throw createError(413, 'Vous dépassez la taille de données indexées autorisée pour ce jeu de données.')
  }
  const remaining = await limits.remaining(db, owner)
  debugInfo.remaining = { ...remaining }
  if (overwrite && dataset && dataset.storage) {
    debugInfo.overwriteDataset = dataset.storage
    // ignore the size of the dataset we are overwriting
    if (remaining.storage !== -1) remaining.storage += dataset.storage.size
    if (remaining.indexed !== -1) remaining.indexed += dataset.storage.size
  }
  const storageOk = remaining.storage === -1 || ((remaining.storage - estimatedContentSize) >= 0)
  const indexedOk = !indexed || remaining.indexed === -1 || ((remaining.indexed - estimatedContentSize) >= 0)
  if (!storageOk || !indexedOk) {
    if (!storageOk) {
      debugLimits('exceedLimitStorage/checkStorage', debugInfo)
      throw createError(429, i18n.__({ locale, phrase: 'errors.exceedLimitStorage' }))
    }
    if (!indexedOk) {
      debugLimits('exceedLimitIndexed/checkStorage', debugInfo)
      throw createError(429, i18n.__({ locale, phrase: 'errors.exceedLimitIndexed' }))
    }
  }
}

exports.storage = async (db, es, dataset) => {
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
    const stats = await collection.stats()
    storage.collection = { size: stats.size, count: stats.count }
    storage.size += storage.collection.size
    storage.indexed = {
      size: storage.collection.size,
      parts: ['collection']
    }

    if (dataset.rest && dataset.rest.history) {
      try {
        const revisionsCollection = await restDatasetsUtils.revisionsCollection(db, dataset)
        const revisionsStats = await revisionsCollection.stats()
        // we remove 60 bytes per line that are not really part of the original payload but added by _action, _updatedAt, _hash and _i.
        storage.revisions = { size: revisionsStats.size, count: revisionsStats.count }
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
      storage.attachments.size += (await fs.promises.stat(path.join(attachmentsDir(dataset), attachment))).size
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
    storage.metadataAttachments.size += (await fs.promises.stat(path.join(metadataAttachmentsDir(dataset), metadataAttachment))).size
    storage.metadataAttachments.count++
  }
  storage.size += storage.metadataAttachments.size
  return storage
}

// After a change that might impact consumed storage, we store the value
exports.updateStorage = async (app, dataset, deleted = false, checkRemaining = false) => {
  const db = app.get('db')
  const es = app.get('es')
  if (dataset.draftReason) {
    console.log(new Error('updateStorage should not be called on a draft dataset'))
    return
  }
  if (!deleted) {
    await db.collection('datasets').updateOne({ id: dataset.id }, {
      $set: {
        storage: await exports.storage(db, es, dataset)
      }
    })
  }
  return exports.updateTotalStorage(db, dataset.owner, checkRemaining)
}

exports.updateTotalStorage = async (db, owner, checkRemaining = false) => {
  const aggQuery = [
    { $match: { 'owner.type': owner.type, 'owner.id': owner.id } },
    { $project: { 'storage.size': 1, 'storage.indexed.size': 1 } },
    { $group: { _id: null, size: { $sum: '$storage.size' }, indexed: { $sum: '$storage.indexed.size' }, count: { $sum: 1 } } }
  ]
  const res = await db.collection('datasets').aggregate(aggQuery).toArray()
  const totalStorage = { size: (res[0] && res[0].size) || 0, indexed: (res[0] && res[0].indexed) || 0, count: (res[0] && res[0].count) || 0 }

  await limits.setConsumption(db, owner, 'store_bytes', totalStorage.size)
  await limits.setConsumption(db, owner, 'indexed_bytes', totalStorage.indexed)
  await limits.setConsumption(db, owner, 'nb_datasets', totalStorage.count)

  if (checkRemaining && process.env.NO_STORAGE_CHECK !== 'true') {
    const remaining = await limits.remaining(db, owner)
    if (remaining.storage === 0) {
      debugLimits('exceedLimitStorage/updateTotalStorage', { owner, remaining })
      throw createError(429, 'Vous avez atteint la limite de votre espace de stockage.')
    }
    if (remaining.indexed === 0) {
      debugLimits('exceedLimitIndexed/updateTotalStorage', { owner, remaining })
      throw createError(429, 'Vous avez atteint la limite de votre espace de données indexées.')
    }
    if (remaining.nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/updateTotalStorage', { owner, remaining })
      throw createError(429, 'Vous avez atteint la limite de votre nombre de jeux de données.')
    }
  }
  return totalStorage
}
