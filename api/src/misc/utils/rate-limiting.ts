import config from '#config'
import { Transform } from 'node:stream'
import { RateLimiter, TokenBucket } from 'limiter' // cf https://github.com/jhurliman/node-rate-limiter/issues/80#issuecomment-1649261071
import requestIp from 'request-ip'
import debug from 'debug'
import promClient from 'prom-client'
import { type Request, type Response } from 'express'
import { reqUser } from '@data-fair/lib-express'
import { ComputeBucket } from './compute-budget.ts'
import { queryAdvice } from './query-advice.ts'

const debugLimits = debug('limits')

// IMPORTANT NOTE: all rate limiting is based on memory only, to be strictly applied when scaling the service
// load balancing has to be based on a hash of the rate limiting key i.e the origin IP

const rateLimiters = {}

// time-weighted ("compute budget") buckets, keyed `${userId | clientIp}_${limitType}` (see compute-budget.ts)
const computeBuckets: Record<string, ComputeBucket> = {}
const computeBudgetExceededCounter = new promClient.Counter({
  name: 'df_compute_budget_exceeded_total',
  help: 'Number of requests rejected (429) because the client exceeded its time-weighted Elasticsearch compute budget',
  labelNames: ['limitType']
})

const tokenBuckets: Record<string, TokenBucketWrapper> = {}

type TokenBucketWrapper = {
  lastUsed?: number,
  bucketSize: number,
  bucket: TokenBucket
}

// simple cleanup of the limiters every 20 minutes
setInterval(() => {
  const threshold = Date.now() - 20 * 60 * 1000
  for (const key of Object.keys(rateLimiters)) {
    if (rateLimiters[key].lastUsed < threshold) delete rateLimiters[key]
  }
  for (const key of Object.keys(tokenBuckets)) {
    if (tokenBuckets[key].lastUsed && tokenBuckets[key].lastUsed < threshold) delete tokenBuckets[key]
  }
  for (const key of Object.keys(computeBuckets)) {
    if (computeBuckets[key].lastUsed < threshold) delete computeBuckets[key]
  }
}, 20 * 60 * 1000)

export const clear = () => {
  for (const key of Object.keys(rateLimiters)) delete rateLimiters[key]
  for (const key of Object.keys(tokenBuckets)) delete tokenBuckets[key]
  for (const key of Object.keys(computeBuckets)) delete computeBuckets[key]
}

export const getRateLimiter = (req: Request, limitType: string, throttlingKey = '') => {
  const user = reqUser(req)
  const throttlingId = throttlingKey + '_' + (user ? user.id : requestIp.getClientIp(req)) + '_' + limitType
  const rateLimiter = rateLimiters[throttlingId] = rateLimiters[throttlingId] || {
    rateLimiter: new RateLimiter({
      tokensPerInterval: config.defaultLimits.apiRate[limitType].nb,
      interval: config.defaultLimits.apiRate[limitType].duration * 1000
    })
  }
  return rateLimiter
}

export const consume = (req: Request, limitType: string, throttlingKey?: string) => {
  const rateLimiter = getRateLimiter(req, limitType, throttlingKey)
  rateLimiter.lastUsed = Date.now()
  return rateLimiter.rateLimiter.tryRemoveTokens(1)
}

// time-weighted ("compute budget") rate limiting: a second bucket alongside the request-count one,
// denominated in ms of Elasticsearch query time consumed per window. Checked on entry, debited on exit
// with the request's measured ES time (req.esAbortContext.esElapsedMs). Disabled when computeMs falsy.
const getComputeBucket = (req: Request, limitType: string): ComputeBucket | undefined => {
  const limit = config.defaultLimits.apiRate[limitType as keyof typeof config.defaultLimits.apiRate]
  if (!limit || !('computeMs' in limit) || !limit.computeMs || limit.computeMs <= 0) return undefined
  const budgetMs = limit.computeMs
  const windowMs = limit.duration * 1000
  const user = reqUser(req)
  const key = (user ? user.id : requestIp.getClientIp(req)) + '_' + limitType
  let bucket = computeBuckets[key]
  // recreate the bucket if the configured budget/window changed (e.g. tests tweaking config at runtime)
  if (!bucket || bucket.budgetMs !== budgetMs || bucket.windowMs !== windowMs) {
    bucket = computeBuckets[key] = new ComputeBucket(budgetMs, windowMs)
  }
  return bucket
}

/** True if the client still has compute budget left (or the limit is disabled). */
export const hasComputeBudget = (req: Request, limitType: string): boolean => {
  return getComputeBucket(req, limitType)?.hasBudget() ?? true
}

/** Debit `ms` of Elasticsearch query time from the client's compute budget (no-op if disabled or ms<=0). */
export const debitComputeBudget = (req: Request, limitType: string, ms: number): void => {
  if (!ms || ms <= 0) return
  getComputeBucket(req, limitType)?.debit(ms)
}

const burstFactor = 4
export const getTokenBucket = (req, limitType, bandwidthType) => {
  const user = reqUser(req)
  const throttlingId = user ? user.id : requestIp.getClientIp(req)
  const bucketSize = config.defaultLimits.apiRate[limitType].bandwidth[bandwidthType] * burstFactor
  const tokenBucket: TokenBucketWrapper = tokenBuckets[throttlingId + bandwidthType] = tokenBuckets[throttlingId + bandwidthType] || {
    bucketSize,
    bucket: new TokenBucket({
      bucketSize,
      tokensPerInterval: config.defaultLimits.apiRate[limitType].bandwidth[bandwidthType],
      interval: 1000
    })
  }
  return tokenBucket
}

class Throttle extends Transform {
  tokenBucket: TokenBucketWrapper

  constructor (tokenBucket: TokenBucketWrapper) {
    super()
    this.tokenBucket = tokenBucket
  }

  async transformPromise (chunk: Buffer, encoding: string) {
    this.tokenBucket.lastUsed = Date.now()
    let pos = 0
    while (chunk.length > pos) {
      const slice = chunk.subarray(pos, pos + this.tokenBucket.bucketSize)
      await this.tokenBucket.bucket.removeTokens(slice.length)
      this.push(slice)
      pos += slice.length
    }
  }

  _transform (chunk: Buffer, encoding: string, cb) {
    this.transformPromise(chunk, encoding).then(() => cb(), cb)
  }
}

const throttledEnd = async (res: Response, buffer: Buffer, tokenBucket) => {
  let pos = 0
  while (buffer.length > pos) {
    const slice = buffer.subarray(pos, pos + tokenBucket.bucketSize)
    await tokenBucket.bucket.removeTokens(slice.length)
    res.write(slice)
    pos += slice.length
  }
  // @ts-ignore
  res._originalEnd()
}

export const middleware = (_limitType) => async (req, res, next) => {
  const user = reqUser(req)
  const limitType = _limitType || (user ? 'user' : 'anonymous')

  const ignoreRateLimiting = config.secretKeys.ignoreRateLimiting && req.get('x-ignore-rate-limiting') === config.secretKeys.ignoreRateLimiting
  if (!ignoreRateLimiting && !consume(req, limitType)) {
    debugLimits('exceedRateLimiting', limitType, user, requestIp.getClientIp(req))
    return res.status(429).type('text/plain').send(req.__('errors.exceedRateLimiting'))
  }
  if (!ignoreRateLimiting && !hasComputeBudget(req, limitType)) {
    debugLimits('exceedComputeBudget', limitType, user, requestIp.getClientIp(req))
    computeBudgetExceededCounter.labels(limitType).inc()
    // GET only: the compute bucket can also block a write request from a client that previously did
    // heavy reads, where query-shape advice would be off-context. req.dataset isn't loaded at this
    // mount point, so the select rule never fires here — rules 1–4 work off req.query/req.path.
    const advice = req.method === 'GET' ? queryAdvice(req) : ''
    return res.status(429).type('text/plain').send(req.__('errors.exceedComputeBudget') + advice)
  }
  if (!ignoreRateLimiting) {
    // 'close' fires exactly once, after a normal finish or a client disconnect; an aborted request is
    // still billed for the partial ES work it kicked off (recorded by timedEsCall before the abort throws)
    res.on('close', () => {
      const esElapsedMs = req.esAbortContext?.esElapsedMs
      if (esElapsedMs) debitComputeBudget(req, limitType, esElapsedMs)
    })
  }

  res.throttle = (bandwidthType) => {
    const throttle = new Throttle(getTokenBucket(req, limitType, bandwidthType))
    throttle.on('error', () => {
      // nothing, throttle might finish in error if the HTTP request was interrupted or somethin like that
      // we don't care about ERR_STREAM_PREMATURE_CLOSE errors, etc
    })
    return throttle
  }
  res.throttleEnd = (bandwidthType = 'dynamic') => {
    if (ignoreRateLimiting) return

    // prevent inifinite loop if res.throttleEnd is called twice
    if (res._originalEnd) return

    res._originalEnd = res.end
    res.end = function (buffer) {
      if (!buffer) return res._originalEnd()
      const tokenBucket = getTokenBucket(req, limitType, bandwidthType)
      tokenBucket.lastUsed = Date.now()
      throttledEnd(res, buffer, tokenBucket)
        .catch(err => console.warn('failed to send throttled response', err))
    }
  }
  next()
}
