const config = /** @type {any} */(require('config'))
const createError = require('http-errors')
const i18n = require('i18n')
const asyncWrap = require('../misc/utils/async-handler')
const locks = require('../misc/utils/locks')
const usersUtils = require('../misc/utils/users')
const { getOwnerRole } = require('../misc/utils/permissions')
const { checkStorage } = require('./utils/storage')
const service = require('./service')

/**
 *
 * @param {boolean} overwrite
 * @param {boolean} indexed
 * @returns
 */
// @ts-ignore
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
  // @ts-ignore
  const shouldLock = typeof _shouldLock === 'function' ? _shouldLock(req.body, req.query) : _shouldLock
  if (!shouldLock) return next()
  // @ts-ignore
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
 * @param {{acceptedStatuses?: string[] | ((body: any, dataset: any) => string[] | null), fillDescendants?: boolean, alwaysDraft?: boolean, acceptMissing?: boolean, acceptInitialDraft?: boolean}} fillDescendants
 * @returns
 */
exports.readDataset = ({ acceptedStatuses, fillDescendants, alwaysDraft, acceptMissing, acceptInitialDraft } = {}) => asyncWrap(async (req, res, next) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const mainPublicationSite = req.mainPublicationSite
  const tolerateStale = !!publicationSite && !acceptedStatuses
  const useDraft = req.query.draft === 'true' || alwaysDraft

  const { dataset, datasetFull } = tolerateStale
    ? await service.memoizedGetDataset(req.params.datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, req.app.get('db'), tolerateStale, acceptedStatuses, req.body)
    : await service.getDataset(req.params.datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, req.app.get('db'), tolerateStale, acceptedStatuses, req.body)

  /**
   * can be used to check the memoizee cache usage, first import memoizee/profile on top of app.js
   * if (tolerateStale) {
    console.log('memProfile', require('memoizee/profile').log())
  } */
  if (!dataset) {
    if (acceptMissing) return next()
    return res.status(404).send('Dataset not found')
  }

  if (fillDescendants && dataset.virtual && dataset.virtual.filterActiveAccount) {
    const activeAccount = req.user?.activeAccount
    if (!activeAccount) throw createError(401, 'No active account')
    const ownerRole = getOwnerRole(dataset.owner, req.user)
    if (!ownerRole) {
      const queryAccount = `${activeAccount.type}:${activeAccount.id}${activeAccount.department ? ':' + activeAccount.department : ''}`
      if (req.query.account && req.query.account !== queryAccount) throw createError(403, 'You are not allowed to use the account parameter')
      req.query.account = queryAccount
    }
    req.noCache = true
  }

  // @ts-ignore
  req.dataset = req.resource = dataset
  // @ts-ignore
  req.datasetFull = datasetFull

  next()
})
