import type { Request as ExpressRequest, Response as ExpressResponse } from 'express'
import config from '#config'
import { defineReqContext } from '../../misc/utils/req-context.ts'

export interface EsAbortContext {
  /** pass it (with requestTimeout) as the options arg of an ES client call */
  signal: AbortSignal
  /** per-request client timeout; equals the ES search `timeout` parameter */
  requestTimeout: string | number
  /** cumulated wall-clock ms of the ES calls made for this request (compute-budget rate limiter) */
  esElapsedMs: number
}

const esAbortContext = defineReqContext<EsAbortContext>('esAbortContext')
export const setReqEsAbortContext = esAbortContext.set
export const reqEsAbortContext = esAbortContext.get
export const reqEsAbortContextOptional = esAbortContext.getOptional

/**
 * Build per-request options to pass to elasticsearch client calls on a read path so that:
 *  - a running search/aggregation is cancelled when the http client goes away (browser cancel, the
 *    reverse-proxy `proxy-read-timeout`, …): when the socket closes Elasticsearch (>= 7.x) cancels
 *    the running search task;
 *  - the request can't hold a socket (and an ES coordinator request) for the full global 240 s
 *    client timeout — read calls get `requestTimeout` = the ES search `timeout` parameter
 *    (`config.elasticsearch.searchTimeout`, e.g. "45s" — the @elastic/transport client parses ES
 *    duration strings). When it elapses the client aborts the socket (→ ES cancels the task, throws
 *    TimeoutError). It's a hair tighter than the ES `timeout` in wall-clock terms (it also spans the
 *    rewrite/reduce phases the ES `timeout` doesn't), so a query right at that edge fails rather than
 *    completing — intentional, such a query is pathological.
 *
 * Spread the returned object into the client call options:
 *   client.search(params, abortContext)
 *   client.transport.request(params, { ...abortContext, meta: true })
 *
 * The context is also stored on the request (via the esAbortContext accessor) so handlers that reach the
 * ES layer indirectly (e.g. countWithCache) can pick it up without it being threaded through every call.
 *
 * One context is meant to be created once per http request and reused across all the ES calls that
 * request makes (a single AbortController cancels them all at once on disconnect).
 */
export const createEsRequestOptions = (req: ExpressRequest, res: ExpressResponse) => {
  const controller = new AbortController()
  const abortContext: EsAbortContext = {
    signal: controller.signal,
    requestTimeout: config.elasticsearch.searchTimeout,
    esElapsedMs: 0
  }

  const onClose = () => {
    // a normal response also emits 'close' once finished, in that case there is nothing to abort
    if (res.writableEnded || controller.signal.aborted) return
    controller.abort()
  }
  res.on('close', onClose)

  setReqEsAbortContext(req, abortContext)
  return abortContext
}

/**
 * Run one Elasticsearch client call, adding its wall-clock duration to the per-request abort context
 * for the time-weighted ("compute budget") rate limiter. No-op accounting when there is no abort
 * context (worker / bulk-indexing callers, or helpers reached without one).
 *
 * Usage in an ES helper:
 *   const esResponse = await timedEsCall(abortContext, () => client.search({ ... }, abortContext))
 */
export const timedEsCall = async <T>(abortContext: EsAbortContext | undefined, fn: () => Promise<T>): Promise<T> => {
  // performance.now() (sub-millisecond float) rather than Date.now(): a fast localhost ES call can be
  // well under 1 ms and Date.now()'s integer-ms resolution would round it to 0
  const start = performance.now()
  try {
    return await fn()
  } finally {
    if (abortContext) abortContext.esElapsedMs += performance.now() - start
  }
}
