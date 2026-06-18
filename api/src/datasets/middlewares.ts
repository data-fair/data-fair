import type { RequestHandler } from 'express'
import type { Dataset } from '#types'
import config from '#config'
import mongo from '#mongo'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import locks from '@data-fair/lib-node/locks.js'
import * as usersUtils from '../misc/utils/users.ts'
import { getOwnerRole } from '../misc/utils/permissions.ts'
import { defineReqContext, setReqResource, reqResourceOptional, setReqDataset, reqDataset, reqDatasetOptional, reqRestDataset, setReqLinesOwner, reqLinesOwnerOptional, setReqDraft, reqDraftOptional } from '../misc/utils/req-context.ts'
import { setReqNoCache } from '../misc/utils/cache-headers.ts'
import { reqPublicationSite, reqMainPublicationSite } from '../misc/utils/publication-sites.ts'
import { checkStorage as checkStorageFn } from './utils/storage.ts'
import * as service from './service.ts'
import { withQuery } from 'ufo'
import { type Account, reqSession, reqSessionAuthenticated, reqUserAuthenticated } from '@data-fair/lib-express'
import { emit as workerPing } from '../workers/ping.ts'

// dataset / linesOwner / _draft accessors live in the config-free req-context.ts (so query-advice.ts and
// datasets/utils/* can import them without #config / a require cycle); re-exported here as a facade for
// the routes/* importers.
export { setReqDataset, reqDataset, reqDatasetOptional, reqRestDataset, setReqLinesOwner, reqLinesOwnerOptional, setReqDraft, reqDraftOptional }

// the full underlying dataset document (draft NOT merged). Module-local (no config-free / cycle reader).
const datasetFullCtx = defineReqContext<Dataset>('datasetFull')
export const setReqDatasetFull = datasetFullCtx.set
export const reqDatasetFull = datasetFullCtx.get
export const reqDatasetFullOptional = datasetFullCtx.getOptional

export const checkStorage = (overwrite: boolean, indexed = false): RequestHandler => async (req, res, next) => {
  reqUserAuthenticated(req)
  if (process.env.NO_STORAGE_CHECK === 'true') return next()
  if (!req.get('Content-Length')) throw httpError(411, 'Content-Length is mandatory')
  const contentLength = Number(req.get('Content-Length'))
  if (Number.isNaN(contentLength)) throw httpError(400, 'Content-Length is not a number')

  const resource = reqResourceOptional(req)
  const owner = (resource ? resource.owner : usersUtils.owner(req)) as Account
  await checkStorageFn(req.getLocale(), owner, overwrite && resource, contentLength, indexed)
  next()
}

// Shared middleware to apply a lock on the modified resource
export const lockDataset = (_shouldLock: boolean | ((body: any, query: any) => boolean) = true): RequestHandler => async (req, res, next) => {
  const shouldLock = typeof _shouldLock === 'function' ? _shouldLock(req.body, req.query) : _shouldLock
  if (!shouldLock) return next()
  const dataset = reqDatasetOptional(req)
  const datasetId = dataset ? dataset.id : req.params.datasetId
  if (typeof datasetId !== 'string') throw httpError(400, 'invalid path parameters')
  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    const lockKey = `datasets:${datasetId}`
    const ack = await locks.acquire(lockKey, `${req.method} ${req.originalUrl}`)
    if (ack) {
      res.on('close', async () => {
        try {
          await locks.release(lockKey)
          await workerPing('datasets', datasetId)
        } catch (err) {
          console.error('failure to release dataset lock', err)
        }
      })
      return next()
    } else {
      // dataset found but locked : we cannot safely work on it, wait a little while before failing
      await new Promise(resolve => setTimeout(resolve, config.datasetStateRetries.interval))
    }
  }
  throw httpError(409, `Une opération bloquante est déjà en cours sur le jeu de données ${datasetId}.`)
}

interface ReadDatasetOptions {
  acceptedStatuses?: string[] | ((body: any, dataset: any) => string[] | null)
  fillDescendants?: boolean
  alwaysDraft?: boolean
  acceptMissing?: boolean
  acceptInitialDraft?: boolean
  noCache?: boolean
}

// Shared middleware to read dataset in db
// also checks that the dataset is in a state compatible with some action
// supports waiting a little bit to be a little permissive with the user
export const readDataset = ({ acceptedStatuses, fillDescendants, alwaysDraft, acceptMissing, acceptInitialDraft, noCache }: ReadDatasetOptions = {}): RequestHandler => async (req, res, next) => {
  if (typeof req.params.datasetId !== 'string') throw httpError(400, 'invalid path parameters')
  const datasetId = req.params.datasetId
  const publicationSite = reqPublicationSite(req)
  const mainPublicationSite = reqMainPublicationSite(req)
  // TODO: excluding tests from using memoize cache is not great for test coverage
  const tolerateStale = !acceptedStatuses && !noCache && process.env.NODE_ENV !== 'development'
  const useDraft = req.query.draft === 'true' || alwaysDraft

  let { dataset, datasetFull } = tolerateStale
    ? await service.memoizedGetDataset(datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, mongo.db, acceptedStatuses, req.body)
    : await service.getDatasetFresh(datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, mongo.db, acceptedStatuses, req.body)

  // bypass the memory cache if it is contradicted by the finalizedAt or updatedAt parameter
  if (dataset && tolerateStale && (
    (req.query.finalizedAt && req.query.finalizedAt > dataset.finalizedAt) ||
    (req.query.updatedAt && req.query.updatedAt > dataset.updatedAt)
  )) {
    const result = await service.getDataset(datasetId, publicationSite, mainPublicationSite, useDraft, fillDescendants, acceptInitialDraft, mongo.db, acceptedStatuses, req.body)
    dataset = result.dataset
    datasetFull = result.datasetFull
  }

  if (!dataset) {
    if (acceptMissing) return next()
    return res.status(404).send('Dataset not found')
  }

  if (fillDescendants && dataset.virtual && dataset.virtual.filterActiveAccount) {
    const { user } = reqSessionAuthenticated(req)
    const ownerRole = getOwnerRole(dataset.owner, reqSession(req))
    if (!ownerRole) {
      const accounts = [`user:${user.id}`]
      for (const org of user.organizations) {
        accounts.push(`organization:${org.id}${org.department ? ':' + org.department : ''}`)
      }
      const accountParam = req.query.account as string | undefined
      if (accountParam) {
        const queryAccounts = accountParam.split(',')
        const rejectedAccount = queryAccounts.find(a => !accounts.includes(a))
        if (rejectedAccount) throw httpError(403, `You are not allowed to use the "${rejectedAccount}" account parameter`)
      }
      req.url = withQuery(req.url, { account: accountParam || accounts.join(',') })
    }
    setReqNoCache(req, true)
  }

  setReqDataset(req, dataset)
  setReqResource(req, dataset)
  setReqDatasetFull(req, datasetFull)

  next()
}
