import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { Request, RequestHandler, Response } from 'express'
import debugLib from 'debug'
import { defineReqContext } from './req-context.ts'
import { reqResource, reqPublicOperation } from './permissions.ts'

const debug = debugLib('cache-headers')

// noCache request context lives here (cache-headers' topical home). Its setter stays in
// datasets/middlewares (Phase 6) and is read here via the legacyProp until that phase.
const noCacheCtx = defineReqContext<boolean>('noCache', 'noCache')
export const setReqNoCache = noCacheCtx.set
export const reqNoCache = noCacheCtx.getOptional

const noModifiedCacheCtx = defineReqContext<boolean>('noModifiedCache', 'noModifiedCache')
export const setReqNoModifiedCache = noModifiedCacheCtx.set
export const reqNoModifiedCache = noModifiedCacheCtx.getOptional

export const setNoCache = (req: Request, res: Response) => {
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Cache-Control', 'must-revalidate, private, max-age=0')
}

// adapt headers based on the state of the currently requested resource
// Set max-age
// Also compare last-modified and if-modified-since headers for cache revalidation on a specific resource
// only send data if the dataset was finalized since then
// prevent running expensive queries while always presenting fresh data
// also set last finalized date into last-modified header
export const resourceBased = (dateKey: 'updatedAt' | 'finalizedAt' = 'updatedAt'): RequestHandler => (req, res, next) => {
  if (reqNoCache(req)) {
    setNoCache(req, res)
    return next()
  }

  const resource = reqResource(req)
  const dateStr = resource[dateKey] || resource.updatedAt
  const date = new Date(dateStr)
  const dateUTC = date.toUTCString()
  const cacheVisibility = reqPublicOperation(req) ? 'public' : 'private'
  debug(`dateUTC=${dateUTC}, visibility=${cacheVisibility}`)

  if (!reqNoModifiedCache(req)) {
    const ifModifiedSince = req.get('if-modified-since')
    if (ifModifiedSince && dateUTC === ifModifiedSince) {
      debug('if-modified-since matches local date, return 304')
      return res.status(304).send()
    }
    res.setHeader('Last-Modified', dateUTC)
  }

  if (cacheVisibility === 'public') {
    // force buffering (necessary for caching) of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'yes')
  } else {
    res.setHeader('X-Accel-Buffering', 'no')
  }

  // finalizedAt passed as query parameter is used to timestamp the query and
  // make it compatible with a longer caching
  const queryDateStr = req.query.finalizedAt || req.query.updatedAt
  if (queryDateStr && !reqNoModifiedCache(req)) {
    debug('date in query parameter, use longer max age', queryDateStr)
    const queryDate = new Date(queryDateStr)
    if (queryDate > date) {
      console.warn(`wrong usage of finalizedAt or updatedAt parameters: query=${JSON.stringify(req.query)}, resource=${{ finalizedAt: resource.finalizedAt, updatedAt: resource.updatedAt }}`)
      throw httpError(400, `"finalizedAt" or "updatedAt" parameter has a value higher in the query than in the resource (${queryDate.toISOString()} > ${date.toISOString()}).`)
    }
    res.setHeader('Cache-Control', `must-revalidate, ${cacheVisibility}, max-age=${config.cache.timestampedPublicMaxAge}`)
  } else {
    if (cacheVisibility === 'public') {
      res.setHeader('Cache-Control', `must-revalidate, public, max-age=${config.cache.publicMaxAge}`)
    } else {
      setNoCache(req, res)
    }
  }

  next()
}

// adapt headers for a request listing the content of a collection
export const listBased: RequestHandler = (req, res, next) => {
  const select = req.query.select ? req.query.select.split(',') : []
  let cacheVisibility = 'private'
  if (select.includes('-userPermissions') && req.query.visibility && req.query.visibility.includes('public')) cacheVisibility = 'public'
  if (cacheVisibility === 'public') {
    // force buffering (necessary for caching) of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'yes')
    res.setHeader('Cache-Control', `must-revalidate, public, max-age=${config.cache.publicMaxAge}`)
  } else {
    setNoCache(req, res)
  }
  next()
}

export const noCache: RequestHandler = (req, res, next) => {
  setNoCache(req, res)
  next()
}
