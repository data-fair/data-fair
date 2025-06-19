import config from '#config'
import mongo from '#mongo'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import locks from '@data-fair/lib-node/locks.js'
import * as usersUtils from '../misc/utils/users.js'
import { getOwnerRole } from '../misc/utils/permissions.ts'
import { checkStorage as checkStorageFn } from './utils/storage.ts'
import * as service from './service.js'
import { withQuery } from 'ufo'

/**
 *
 * @param {boolean} overwrite
 * @param {boolean} indexed
 * @returns
 */
// @ts-ignore
export const checkStorage = (overwrite, indexed = false) => async (req, res, next) => {
  // @ts-ignore
  if (!req.user) throw httpError(401)
  if (process.env.NO_STORAGE_CHECK === 'true') return next()
  if (!req.get('Content-Length')) throw httpError(411, 'Content-Length is mandatory')
  const contentLength = Number(req.get('Content-Length'))
  if (Number.isNaN(contentLength)) throw httpError(400, 'Content-Length is not a number')

  // @ts-ignore
  const resource = req.resource
  const owner = resource ? resource.owner : usersUtils.owner(req)
  await checkStorageFn(req.getLocale(), owner, overwrite && resource, contentLength, indexed)
  next()
}

// Shared middleware to apply a lock on the modified resource
/**
 *
 * @param {boolean | ((patch: any) => boolean)} _shouldLock
 * @returns
 */
export const lockDataset = (_shouldLock = true) => async (req, res, next) => {
  // @ts-ignore
  const shouldLock = typeof _shouldLock === 'function' ? _shouldLock(req.body, req.query) : _shouldLock
  if (!shouldLock) return next()
  // @ts-ignore
  const datasetId = req.dataset ? req.dataset.id : req.params.datasetId
  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    const lockKey = `dataset:${datasetId}`
    const ack = await locks.acquire(lockKey, `${req.method} ${req.originalUrl}`)
    if (ack) {
      res.on('close', () => locks.release(lockKey).catch(err => console.error('failure to release dataset lock', err)))
      return next()
    } else {
      // dataset found but locked : we cannot safely work on it, wait a little while before failing
      await new Promise(resolve => setTimeout(resolve, config.datasetStateRetries.interval))
    }
  }
  throw httpError(409, `Une opération bloquante est déjà en cours sur le jeu de données ${datasetId}.`)
}

// Shared middleware to read dataset in db
// also checks that the dataset is in a state compatible with some action
// supports waiting a little bit to be a little permissive with the user
/**
 * @param {{acceptedStatuses?: string[] | ((body: any, dataset: any) => string[] | null), fillDescendants?: boolean, alwaysDraft?: boolean, acceptMissing?: boolean, acceptInitialDraft?: boolean}} fillDescendants
 * @returns
 */
export const readDataset = ({ acceptedStatuses, fillDescendants, alwaysDraft, acceptMissing, acceptInitialDraft } = {}) => async (req, res, next) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const mainPublicationSite = req.mainPublicationSite
  const tolerateStale = !!publicationSite && !acceptedStatuses
  const useDraft = req.query.draft === 'true' || alwaysDraft

  const { dataset, datasetFull } = tolerateStale
    ? await service.memoizedGetDataset(req.params.datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, mongo.db, tolerateStale, acceptedStatuses, req.body)
    : await service.getDataset(req.params.datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, mongo.db, tolerateStale, acceptedStatuses, req.body)

  if (!dataset) {
    if (acceptMissing) return next()
    return res.status(404).send('Dataset not found')
  }

  if (fillDescendants && dataset.virtual && dataset.virtual.filterActiveAccount) {
    const activeAccount = req.user?.activeAccount
    if (!activeAccount) throw httpError(401, 'No active account')
    const ownerRole = getOwnerRole(dataset.owner, req.user)
    if (!ownerRole) {
      let account = `${activeAccount.type}:${activeAccount.id}${activeAccount.department ? ':' + activeAccount.department : ''}`
      if (req.query.account && req.query.account !== account) throw httpError(403, 'You are not allowed to use the account parameter')
      if (!req.query.account) {
        if (activeAccount.type === 'organization') {
          // also use personnal permissions
          account += `,user:${req.user.id}`
        }
      }
      req.url = withQuery(req.url, { account })
    }
    req.noCache = true
  }

  // @ts-ignore
  req.dataset = req.resource = dataset
  // @ts-ignore
  req.datasetFull = datasetFull

  next()
}
