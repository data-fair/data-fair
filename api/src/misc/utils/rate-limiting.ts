import config from '#config'
import { Transform } from 'node:stream'
import { RateLimiter, TokenBucket } from 'limiter' // cf https://github.com/jhurliman/node-rate-limiter/issues/80#issuecomment-1649261071
import requestIp from 'request-ip'
import debug from 'debug'
import promClient from 'prom-client'
import { type Request, type Response } from 'express'
import { reqUser, reqSession, type SessionState } from '@data-fair/lib-express'
import { ComputeBucket } from './compute-budget.ts'
import { queryAdvice } from './query-advice.ts'
import { reqEsAbortContextOptional } from '../../datasets/es/abort.ts'

const debugLimits = debug('limits')

// The user the rate limiter accounts a request to. Application keys are a loose, anonymous-style access
// tier (the application-key middleware sets a pseudo-user for embed / public `?key=` access); we
// deliberately rate-limit them as anonymous (keyed by IP), since they are exactly the kind of public
// traffic the anonymous tier is meant to bound. Real users (JWT/cookie) and api keys keep the user tier.
const rateLimitUser = (req: Request) => {
  const user = reqUser(req)
  if (!user) return undefined
  return (reqSession(req) as SessionState & { isApplicationKey?: boolean }).isApplicationKey ? undefined : user
}

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
  const user = rateLimitUser(req)
  const throttlingId = throttlingKey + '_' + (user ? user.id : requestIp.getClientIp(req)) + '_' + limitType
  // init lastUsed at creation so the 20-min sweep can detect this entry as idle later — without it,
  // a limiter that's never followed by a consume() (or whose consume() path errors out) stays with
  // lastUsed=undefined forever (undefined < threshold is always false → never deleted).
  const rateLimiter = rateLimiters[throttlingId] = rateLimiters[throttlingId] || {
    lastUsed: Date.now(),
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
  const user = rateLimitUser(req)
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
  const user = rateLimitUser(req)
  const throttlingId = user ? user.id : requestIp.getClientIp(req)
  const bucketSize = config.defaultLimits.apiRate[limitType].bandwidth[bandwidthType] * burstFactor
  // init lastUsed at creation so the 20-min sweep can detect this entry as idle later — every call
  // to res.throttle() creates a bucket via this path but lastUsed is only set inside the Throttle
  // _transform; a stream that never receives bytes (empty body, immediate error before any chunk)
  // would leave lastUsed=undefined and the sweep would skip it forever.
  const tokenBucket: TokenBucketWrapper = tokenBuckets[throttlingId + bandwidthType] = tokenBuckets[throttlingId + bandwidthType] || {
    bucketSize,
    lastUsed: Date.now(),
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
  // resolves to `true` once the Throttle is closed (normal end or destroy/abort). Used to race against
  // `removeTokens`: without this the slice currently waiting for tokens would be retained for up to one
  // refill window (bucketSize / bandwidth seconds) after the request was aborted, multiplied by every
  // stalled stream from the same client. Underscore-prefixed to avoid clashing with Readable.closed.
  private _closedPromise: Promise<true>

  constructor (tokenBucket: TokenBucketWrapper) {
    super()
    this.tokenBucket = tokenBucket
    this._closedPromise = new Promise<true>(resolve => this.once('close', () => resolve(true)))
  }

  async transformPromise (chunk: Buffer, encoding: string) {
    this.tokenBucket.lastUsed = Date.now()
    let pos = 0
    while (chunk.length > pos) {
      if (this.destroyed) return
      const slice = chunk.subarray(pos, pos + this.tokenBucket.bucketSize)
      const stop = await Promise.race([
        this.tokenBucket.bucket.removeTokens(slice.length).then(() => false as const),
        this._closedPromise
      ])
      if (stop) return // stream torn down mid-wait — drop the slice, let it be GC'd
      this.push(slice)
      pos += slice.length
    }
  }

  _transform (chunk: Buffer, encoding: string, cb) {
    this.transformPromise(chunk, encoding).then(() => cb(), cb)
  }
}

const throttledEnd = async (res: Response, buffer: Buffer, tokenBucket: TokenBucketWrapper) => {
  // mirror the Throttle abort race for the wrapped res.end path — if the client disconnects while we're
  // waiting on tokens, stop awaiting and drop the rest of `buffer` instead of holding it for the full
  // refill window
  const closed = new Promise<true>(resolve => res.once('close', () => resolve(true)))
  let pos = 0
  while (buffer.length > pos) {
    if (res.writableEnded || res.destroyed) return
    const slice = buffer.subarray(pos, pos + tokenBucket.bucketSize)
    const stop = await Promise.race([
      tokenBucket.bucket.removeTokens(slice.length).then(() => false as const),
      closed
    ])
    if (stop) return
    res.write(slice)
    pos += slice.length
  }
  // @ts-ignore
  res._originalEnd()
}

// builds a rate-limiting middleware; `_limitType` forces a tier, otherwise it is auto-detected
// (`user` when there is a user, else `anonymous`). The returned middleware is stateless (all state lives
// in the module-level buckets keyed per client), so a single instance can be reused across every route.
const buildMiddleware = (_limitType) => async (req, res, next) => {
  const user = rateLimitUser(req)
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
      const esElapsedMs = reqEsAbortContextOptional(req)?.esElapsedMs
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

// the default, shared instance — auto-detects user vs anonymous; reused on every dataset/ODS route
export const middleware = buildMiddleware()

// remote-service proxy traffic is forced onto its own tier
export const remoteServiceMiddleware = buildMiddleware('remoteService')
