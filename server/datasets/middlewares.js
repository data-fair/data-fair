const config = /** @type {any} */(require('config'))
const createError = require('http-errors')
const i18n = require('i18n')
const asyncWrap = require('../misc/utils/async-handler')
const locks = require('../misc/utils/locks')
const usersUtils = require('../misc/utils/users')
const findUtils = require('../misc/utils/find')
const { checkStorage } = require('./utils/storage')
const virtualDatasetsUtils = require('./utils/virtual')

/**
 *
 * @param {boolean} overwrite
 * @param {boolean} indexed
 * @returns
 */
exports.checkStorage = (overwrite, indexed = false) => asyncWrap(async (req, res, next) => {
  // @ts-ignore
  if (!req.user) throw createError(401)
  if (process.env.NO_STORAGE_CHECK === 'true') return next()
  if (!req.get('Content-Length')) throw createError(411, 'Content-Length is mandatory')
  const contentLength = Number(req.get('Content-Length'))
  if (Number.isNaN(contentLength)) throw createError(400, 'Content-Length is not a number')

  // @ts-ignore
  const dataset = req.dataset
  const db = req.app.get('db')
  const owner = dataset ? dataset.owner : usersUtils.owner(req)
  await checkStorage(db, i18n.getLocale(req), owner, dataset, contentLength, overwrite, indexed)
  next()
})

// Shared middleware to apply a lock on the modified resource
/**
 *
 * @param {boolean | ((patch: any) => boolean)} _shouldLock
 * @returns
 */
exports.lockDataset = (_shouldLock = true) => asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  const shouldLock = typeof _shouldLock === 'function' ? _shouldLock(req.body, req.query) : _shouldLock
  if (!shouldLock) return next()
  const datasetId = req.dataset ? req.dataset.id : req.params.datasetId
  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    const lockKey = `dataset:${datasetId}`
    const ack = await locks.acquire(db, lockKey, `${req.method} ${req.originalUrl}`)
    if (ack) {
      res.on('close', () => locks.release(db, lockKey).catch(err => console.error('failure to release dataset lock', err)))
      return next()
    } else {
      // dataset found but locked : we cannot safely work on it, wait a little while before failing
      await new Promise(resolve => setTimeout(resolve, config.datasetStateRetries.interval))
    }
  }
  throw createError(409, `Une opération bloquante est déjà en cours sur le jeu de données ${datasetId}.`)
})

// Shared middleware to read dataset in db
// also checks that the dataset is in a state compatible with some action
// supports waiting a little bit to be a little permissive with the user
/**
 * @param {{acceptedStatuses?: string[] | ((body: any, dataset: any) => string[] | null), fillDescendants?: boolean, alwaysDraft?: boolean, acceptMissing?: boolean}} fillDescendants
 * @returns
 */
exports.readDataset = ({ acceptedStatuses: _acceptedStatuses, fillDescendants, alwaysDraft, acceptMissing } = {}) => asyncWrap(async (req, res, next) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const mainPublicationSite = req.mainPublicationSite
  // @ts-ignore
  const isNewDataset = req.isNewDataset

  const tolerateStale = !!publicationSite
  let dataset
  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    dataset = await findUtils.getByUniqueRef(req.app.get('db'), publicationSite, mainPublicationSite, req.params, 'dataset', null, tolerateStale)
    if (!dataset) {
      if (acceptMissing) return next()
      return res.status(404).send('Dataset not found')
    }
    // @ts-ignore
    req.datasetFull = { ...dataset }

    const useDraft = req.query.draft === 'true' || alwaysDraft

    // in draft mode the draft is automatically merged and all following operations use dataset.draftReason to adapt
    if (useDraft && dataset.draft) {
      Object.assign(dataset, dataset.draft)
      if (!dataset.draft.finalizedAt) delete dataset.finalizedAt
      if (!dataset.draft.bbox) delete dataset.bbox
    }
    delete dataset.draft

    const acceptedStatuses = typeof _acceptedStatuses === 'function' ? _acceptedStatuses(req.body, dataset) : _acceptedStatuses

    let isStatusOk = false
    if (isNewDataset) isStatusOk = true
    else if (acceptedStatuses) isStatusOk = acceptedStatuses.includes('*') || acceptedStatuses.includes(dataset.status)
    else isStatusOk = dataset.status !== 'draft'

    if (isStatusOk) {
      if (fillDescendants && dataset.isVirtual) {
        dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), dataset, tolerateStale)
      }

      // @ts-ignore
      req.dataset = req.resource = dataset
      return next()
    }

    // dataset found but not in proper state.. wait a little while
    await new Promise(resolve => setTimeout(resolve, config.datasetStateRetries.interval))
  }
  throw createError(409, `Le jeu de données n'est pas dans un état permettant l'opération demandée. État courant : ${dataset?.status}.`)
})
