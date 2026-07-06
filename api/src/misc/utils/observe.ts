// TODO: replace this with @data-fair/lib-node/observer.js

import client from 'prom-client'
import debug from 'debug'
import { type Request, type Response } from 'express'
import { reqUser } from '@data-fair/lib-express'

const debugReq = debug('df:observe:req')

// Threshold above which a request step is considered slow. Used both for the slow-request log
// below and as the auto-mode trigger for query hints (see query-advice.ts attachQueryHint).
export const SLOW_REQUEST_THRESHOLD_MS = 1000

const reqStepHisto = new client.Histogram({
  name: 'df_req_step_seconds',
  help: 'Duration in seconds of steps in API requests',
  buckets: [0.03, 0.1, 1, 10, 60],
  labelNames: ['routeName', 'step']
})

const reqObserveKey = Symbol('reqObserveKey')

// /lines usage metrics: how many reads, in which format, through which SERVING MODE — i.e. how much of
// the traffic benefits from an optimized path — and how big the responses are (the memory-relevant
// quantity for the streamed-source rollout, see docs/architecture/read-lines-efficiency.md).
// Modes: 'streamed' (asStream source + splitter), 'raw-worker' (zero-copy raw ES buffer transferred to a
// render worker: pbf tiles / shp), 'cache' (vector-tile cache hit, no ES query at all),
// 'buffered' (legacy full-parse path — the non-optimized baseline).
const readLinesTotal = new client.Counter({
  name: 'df_read_lines_total',
  help: 'Count of /lines requests by output format, serving mode and status class',
  labelNames: ['format', 'mode', 'status']
})
const readLinesBytes = new client.Histogram({
  name: 'df_read_lines_bytes',
  help: 'Body size in bytes of successful /lines responses by output format and serving mode',
  // 10KB / 100KB / 500KB (the once-considered streaming threshold) / 2MB / 10MB / 50MB
  buckets: [10000, 100000, 500000, 2000000, 10000000, 50000000],
  labelNames: ['format', 'mode']
})

// bounded label set — anything else (an invalid ?format=… that falls through to json output) is 'other'
const READ_LINES_FORMATS = new Set(['json', 'csv', 'geojson', 'xlsx', 'ods', 'wkt', 'shp', 'pbf'])
const readLinesKey = Symbol('readLinesKey')
type ReadLinesObserved = { format: string, mode: 'buffered' | 'streamed' | 'raw-worker' | 'cache' }

// Called once at the top of readLines. The mode defaults to 'buffered' and is upgraded by readLinesMode()
// at the exact point an optimized path is chosen, so the counters reflect the OUTCOME of mode selection,
// not a prediction. Metrics are observed on response finish: the byte count is the Content-Length that
// res.send set (uncompressed body bytes, after the whole body was assembled), and errors surfaced by the
// error handler are still counted with their status class.
export const readLinesStart = (req: Request, res: Response) => {
  const rawFormat = (req.query.format as string) || 'json'
  const format = ['mvt', 'vt', 'pbf'].includes(rawFormat) ? 'pbf' : READ_LINES_FORMATS.has(rawFormat) ? rawFormat : 'other'
  const observed: ReadLinesObserved = { format, mode: 'buffered' }
  ;(req as any)[readLinesKey] = observed
  res.on('finish', () => {
    const status = res.statusCode >= 500 ? '5xx' : res.statusCode >= 400 ? '4xx' : res.statusCode >= 300 ? '3xx' : '2xx'
    readLinesTotal.labels(observed.format, observed.mode, status).inc()
    if (status === '2xx') {
      const bytes = Number(res.getHeader('content-length') ?? 0)
      if (bytes) readLinesBytes.labels(observed.format, observed.mode).observe(bytes)
    }
  })
}

export const readLinesMode = (req: Request, mode: 'streamed' | 'raw-worker' | 'cache') => {
  const observed: ReadLinesObserved | undefined = (req as any)[readLinesKey]
  if (observed) observed.mode = mode
}

export const observeReqMiddleware = (req, res, next) => {
  const start = Date.now()
  req[reqObserveKey] = { start, step: start }
  res.on('finish', () => {
    reqStep(req, 'finish')
    reqStep(req, 'total')
  })
  next()
}

export const reqRouteName = (req, routeName) => {
  req[reqObserveKey].routeName = routeName
}

export const reqStep = (req: Request, stepName: string) => {
  if (!req.route) return
  if (!req[reqObserveKey].routeName) req[reqObserveKey].routeName = req.route.path

  const now = Date.now()
  const duration = now - (stepName === 'total' ? req[reqObserveKey].start : req[reqObserveKey].step)
  reqStepHisto.labels(Array.isArray(req[reqObserveKey].routeName) ? req[reqObserveKey].routeName[0] : req[reqObserveKey].routeName, stepName).observe(duration / 1000)
  debugReq('request', req.method, req.originalUrl, stepName, duration, 'ms')
  if (duration > SLOW_REQUEST_THRESHOLD_MS && stepName !== 'total' && stepName !== 'finish') {
    const referer = req.headers.referer || req.headers.referrer || 'unknown'
    const user = reqUser(req)
    const userStr = user ? `${user.name}(${user.id})` : 'anonymous'
    console.log(`slow request ${req.method} ${req.originalUrl} ${stepName} ${duration}ms referer=${referer} user=${userStr}`)
  }
  req[reqObserveKey].step = now
}
