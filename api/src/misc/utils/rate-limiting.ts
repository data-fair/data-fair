import config from '#config'
import { Transform, PassThrough } from 'node:stream'
import requestIp from 'request-ip'
import debug from 'debug'
import promClient from 'prom-client'
import { type Request, type Response } from 'express'
import { reqUser, reqSession, type SessionState } from '@data-fair/lib-express'
import { ComputeBucket } from './compute-budget.ts'
import { TokenBucket } from './token-bucket.ts'
import { SweptStore } from './swept-store.ts'
import { removeTokensOrAborted, tokenBucketFor, acquireSendSlot, releaseSendSlot, type TokenBucketWrapper } from './throttle-wait.ts'
import { queryAdvice } from './query-advice.ts'
import { reqEsAbortContextOptional } from '../../datasets/es/abort.ts'

const debugLimits = debug('limits')

// the throttling helpers below are monkey-patched onto the Express response by this middleware;
// declare them on the global Express.Response so downstream route handlers can call them typed.
declare global {
  namespace Express {
    interface Response {
      throttle: (bandwidthType?: string) => Transform
      throttleEnd: (bandwidthType?: string) => void
      _originalEnd?: Response['end']
    }
  }
}

// The user the rate limiter accounts a request to. Application keys are a loose, anonymous-style access
// tier (the application-key middleware sets a pseudo-user for embed / public `?key=` access); we
// deliberately rate-limit them as anonymous (keyed by IP), since they are exactly the kind of public
// traffic the anonymous tier is meant to bound. Real users (JWT/cookie) and api keys keep the user tier.
const rateLimitUser = (req: Request) => {
  const user = reqUser(req)
  if (!user) return undefined
  return (reqSession(req) as SessionState & { isApplicationKey?: boolean }).isApplicationKey ? undefined : user
}

const rateLimitClientId = (req: Request) => {
  const user = rateLimitUser(req)
  return user ? user.id : requestIp.getClientIp(req)
}

// IMPORTANT NOTE: all rate limiting is based on memory only, to be strictly applied when scaling the service
// load balancing has to be based on a hash of the rate limiting key i.e the origin IP

// per-client limiter state, all swept together after 20 min of inactivity
const maxIdleMs = 20 * 60 * 1000
// request-count buckets, keyed `${throttlingKey}_${userId | clientIp}_${limitType}`
const rateLimiters = new SweptStore<{ lastUsed: number, bucket: TokenBucket }>()
// bandwidth buckets, keyed `${userId | clientIp}${bandwidthType}` (see getTokenBucket)
const tokenBuckets = new SweptStore<TokenBucketWrapper>()
// time-weighted ("compute budget") buckets, keyed `${userId | clientIp}_${limitType}` (see compute-budget.ts)
const computeBuckets = new SweptStore<ComputeBucket>()

setInterval(() => {
  rateLimiters.sweep(maxIdleMs)
  tokenBuckets.sweep(maxIdleMs)
  computeBuckets.sweep(maxIdleMs)
}, maxIdleMs)

export const clear = () => {
  rateLimiters.clear()
  tokenBuckets.clear()
  computeBuckets.clear()
}

const computeBudgetExceededCounter = new promClient.Counter({
  name: 'df_compute_budget_exceeded_total',
  help: 'Number of requests rejected (429) because the client exceeded its time-weighted Elasticsearch compute budget',
  labelNames: ['limitType']
})

const throttleQueueFullCounter = new promClient.Counter({
  name: 'df_throttle_queue_full_total',
  help: 'Number of responses torn down because too many sends were already queued on the client\'s bandwidth token bucket',
  labelNames: ['limitType']
})

/** Consume one request-count token for this client, false when the tier's request rate is exhausted. */
export const consume = (req: Request, limitType: string, throttlingKey = '') => {
  const key = throttlingKey + '_' + rateLimitClientId(req) + '_' + limitType
  const limit = config.defaultLimits.apiRate[limitType]
  const { bucket } = rateLimiters.getOrCreate(key, () => ({
    lastUsed: 0, // stamped by the store
    bucket: new TokenBucket(limit.nb, limit.nb / limit.duration)
  }))
  return bucket.tryTake(1)
}

// time-weighted ("compute budget") rate limiting: a second bucket alongside the request-count one,
// denominated in ms of Elasticsearch query time consumed per window. Checked on entry, debited on exit
// with the request's measured ES time (req.esAbortContext.esElapsedMs). Disabled when computeMs falsy.
const getComputeBucket = (req: Request, limitType: string): ComputeBucket | undefined => {
  const limit = config.defaultLimits.apiRate[limitType as keyof typeof config.defaultLimits.apiRate]
  if (!limit || !('computeMs' in limit) || !limit.computeMs || limit.computeMs <= 0) return undefined
  const budgetMs = limit.computeMs
  const windowMs = limit.duration * 1000
  const key = rateLimitClientId(req) + '_' + limitType
  // isValid recreates the bucket if the configured budget/window changed (e.g. tests tweaking config)
  return computeBuckets.getOrCreate(key, () => new ComputeBucket(budgetMs, windowMs),
    b => b.budgetMs === budgetMs && b.windowMs === windowMs)
}

/** True if the client still has compute budget left (or the limit is disabled). */
const hasComputeBudget = (req: Request, limitType: string): boolean => {
  return getComputeBucket(req, limitType)?.hasBudget() ?? true
}

/** Debit `ms` of Elasticsearch query time from the client's compute budget (no-op if disabled or ms<=0). */
const debitComputeBudget = (req: Request, limitType: string, ms: number): void => {
  if (!ms || ms <= 0) return
  getComputeBucket(req, limitType)?.debit(ms)
}

const burstFactor = 4
// Returns undefined when the tier has no bandwidth limit (0 or absent config) → callers skip throttling.
const getTokenBucket = (req: Request, limitType: string, bandwidthType: string): TokenBucketWrapper | undefined => {
  const bandwidth = config.defaultLimits.apiRate[limitType].bandwidth[bandwidthType]
  if (!bandwidth) return undefined
  // NOTE: keyed WITHOUT limitType (historical): a client hitting several tiers shares one bucket,
  // sized by whichever tier created it first — preserved as is to keep this refactor behavior-neutral
  return tokenBuckets.getOrCreate(rateLimitClientId(req) + bandwidthType, () => tokenBucketFor(bandwidth, burstFactor)!)
}

// The slice/wait/write loop shared by the Throttle stream and the wrapped res.end path. Waits for
// bandwidth tokens per slice and resolves false when the request is torn down mid-wait (abort) —
// the caller just stops, dropping the rest of the buffer.
const throttledSend = async (tokenBucket: TokenBucketWrapper, write: (slice: Buffer) => void, buffer: Buffer, signal: AbortSignal): Promise<boolean> => {
  let pos = 0
  while (pos < buffer.length) {
    if (signal.aborted) return false
    const slice = buffer.subarray(pos, pos + tokenBucket.bucketSize)
    if (!await removeTokensOrAborted(tokenBucket.bucket, slice.length, signal)) return false
    write(slice)
    pos += slice.length
  }
  return true
}

class Throttle extends Transform {
  tokenBucket: TokenBucketWrapper
  // fired on 'close' (normal end or destroy/abort) so a slice waiting for tokens is dropped promptly
  // when the request is torn down instead of being retained for up to one refill window
  private _abort = new AbortController()

  constructor (tokenBucket: TokenBucketWrapper) {
    super()
    this.tokenBucket = tokenBucket
    // the send slot was acquired by res.throttle just before construction; 'close' fires exactly once
    // (normal end or destroy) so the release is guaranteed
    this.once('close', () => {
      this._abort.abort()
      releaseSendSlot(tokenBucket)
    })
  }

  _transform (chunk: Buffer, encoding: string, cb: (err?: any) => void) {
    // touch lastUsed per chunk so the sweep never drops the bucket under a long-running download
    this.tokenBucket.lastUsed = Date.now()
    throttledSend(this.tokenBucket, slice => this.push(slice), chunk, this._abort.signal).then(() => cb(), cb)
  }
}

const throttledEnd = async (res: Response, buffer: Buffer, tokenBucket: TokenBucketWrapper) => {
  // mirror the Throttle abort wiring for the wrapped res.end path — if the client disconnects while
  // we're waiting on tokens, stop awaiting and drop the rest of `buffer` instead of holding it for
  // the full refill window
  const abort = new AbortController()
  res.once('close', () => abort.abort())
  const write = (slice: Buffer) => { if (!res.destroyed && !res.writableEnded) res.write(slice) }
  const sent = await throttledSend(tokenBucket, write, buffer, abort.signal)
  // @ts-ignore
  if (sent && !res.destroyed && !res.writableEnded) res._originalEnd()
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
    const tokenBucket = getTokenBucket(req, limitType, bandwidthType)
    if (!tokenBucket) return new PassThrough() // no bandwidth limit for this tier → pass through unthrottled
    if (!acquireSendSlot(tokenBucket)) {
      // too many sends already queued on this client's bucket — tear down instead of queueing: each
      // queued send pins its buffers for the whole starvation window (the prod OOM was ~1400 queued
      // responses on one saturated per-IP bucket)
      debugLimits('throttleQueueFull', limitType, user, requestIp.getClientIp(req))
      throttleQueueFullCounter.labels(limitType).inc()
      res.destroy()
      const dead = new PassThrough()
      dead.on('error', () => {}) // same as Throttle: pipeline teardown errors are expected, not actionable
      dead.destroy(new Error('too many pending throttled sends'))
      return dead
    }
    const throttle = new Throttle(tokenBucket)
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
      if (!tokenBucket) return res._originalEnd(buffer) // no bandwidth limit → send unthrottled
      if (!acquireSendSlot(tokenBucket)) {
        // see res.throttle: don't queue a full response body behind an already-saturated bucket
        debugLimits('throttleQueueFull', limitType, user, requestIp.getClientIp(req))
        throttleQueueFullCounter.labels(limitType).inc()
        return res.destroy()
      }
      throttledEnd(res, buffer, tokenBucket)
        .catch(err => console.warn('failed to send throttled response', err))
        .finally(() => releaseSendSlot(tokenBucket))
    }
  }
  next()
}

// the default, shared instance — auto-detects user vs anonymous; reused on every dataset/ODS route
export const middleware = buildMiddleware()

// remote-service proxy traffic is forced onto its own tier
export const remoteServiceMiddleware = buildMiddleware('remoteService')
