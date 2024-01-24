const createError = require('http-errors')
const i18n = require('i18n')
const limits = require('../../misc/utils/limits')
const config = /** @type {any} */(require('config'))
const debugLimits = require('debug')('limits')

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
