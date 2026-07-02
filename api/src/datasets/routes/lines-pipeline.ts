// Shared json/csv pipeline for the /lines endpoint.
//
// It consumes a `LinesSource` (see lines-source.ts: `{ total, hits: AsyncIterable, tail() }`) and
// streams the response incrementally to `res`, running the exact same per-hit `prepareResultItem`
// transform and (for csv) the exact same `csvStreams` per-row serializer that the buffered path uses.
// The output MUST be byte/deep-identical to the current buffered `readLines`:
//   - JSON envelope: `{ total, next?, results:[…], totalCollapse?, hint? }`
//     (reference: read.ts lines ~268-307 + attachQueryHint)
//   - CSV: byte-equal to `outputs.results2csv` (both go through `compileForRequest` → same serializer)
//
// Both the buffered and streamed modes route through here so parity is guaranteed by construction.

import { getFlatten } from '../utils/flatten.ts'
import * as esUtils from '../es/index.ts'
import * as outputs from '../utils/outputs.ts'
import { attachQueryHint } from '../../misc/utils/query-advice.ts'
import { reqDataset } from '../../misc/utils/req-context.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { LinesSource } from './lines-source.ts'

// Detect client-initiated teardown: request aborted, response destroyed, premature-close from the
// network layer, or an explicit AbortError. These are NOT anomalies and must NOT be counted.
const isClientAbort = (req: any, res: any, err: any): boolean => {
  if (req.aborted) return true
  if (res.destroyed) return true
  if (res.writableEnded) return true
  if (err?.code === 'ERR_STREAM_PREMATURE_CLOSE') return true
  if (err?.name === 'AbortError') return true
  if (req.signal?.aborted) return true
  return false
}

// Streamed-mode next-link params: the last hit's `sort` isn't known until the stream ends and the
// response headers are already flushed, so we cannot set the `Link:next` header. Instead streamJson
// tracks the last emitted hit and, when `size && count === size`, appends a body `next` built exactly
// like read.ts (buffered path). Streamed mode omits the `Link` header — a documented limitation.
export interface NextParams {
  size: number
  query: Record<string, any>
  publicBaseUrl: string
  datasetId: string
}

export interface StreamJsonContext {
  publicBaseUrl: string
  nextHref?: string
  nextParams?: NextParams
  esSearchDurationMs: number
  // Buffered mode (flag off / not streamed): materialize the whole body and res.send it (see streamJson).
  buffered?: boolean
  // Source came from searchStream (streamed or collect-small), whose hits still hold the raw stored
  // `_attachment_url` — so prepareResultItem must rewrite it. False when the source is search()'s
  // esResponse (already rewritten). See commons.ts rewriteAttachmentUrl.
  rewriteAttachmentUrl?: boolean
}

// Await drain when the socket buffer is full, otherwise continue synchronously — honors backpressure
// while keeping at most one row string transiently in memory per iteration.
const write = (res: any, s: string | Buffer): Promise<void> =>
  res.write(s) ? Promise.resolve() : new Promise<void>(resolve => res.once('drain', resolve))

// Materialize the whole source for the "hard" formats (xlsx / ods / geojson / shp / wkt / vector
// tiles) that cannot be produced incrementally. Equivalent to `Array.fromAsync(source.hits)`.
export async function collect (source: LinesSource): Promise<any[]> {
  const items: any[] = []
  for await (const bulk of source.hits) for (let k = 0; k < bulk.length; k++) items.push(bulk[k])
  return items
}

export async function streamJson (req: any, res: any, source: LinesSource, ctx: StreamJsonContext): Promise<void> {
  const dataset = reqDataset(req)
  const query = req.query
  const flatten = getFlatten(dataset, query.arrays === 'true')
  const resultCtx = esUtils.prepareResultContext(dataset, query)
  resultCtx.rewriteAttachmentUrl = ctx.rewriteAttachmentUrl

  // Buffered mode (flag off / not streamed): fully materialize the body and res.send it, byte-for-byte
  // like the pre-refactor path. res.send lets Express compute a strong ETag from the body and answer
  // conditional If-None-Match requests with 304 (the whole point of cacheHeaders.resourceBased). The
  // streamed mode below writes incrementally and so legitimately cannot ETag (accepted limitation).
  // Key order matches the buffered path exactly: { hint, total, next?, totalCollapse?, results }.
  if (ctx.buffered) {
    let result: any = { total: source.total }
    if (ctx.nextHref) result.next = ctx.nextHref
    const tail = await source.tail()
    if (query.collapse) result.totalCollapse = tail.aggregations.totalCollapse.value
    result.results = []
    let i = 0
    for await (const bulk of source.hits) {
      for (let k = 0; k < bulk.length; k++) {
        // avoid blocking the event loop on large pages (setImmediate, not setTimeout(0))
        if (i % 500 === 499) await new Promise(resolve => setImmediate(resolve))
        result.results.push(esUtils.prepareResultItem(bulk[k], dataset, query, flatten, ctx.publicBaseUrl, resultCtx))
        i++
      }
    }
    result = attachQueryHint(req, ctx.esSearchDurationMs, result)
    res.status(200).send(result)
    return
  }

  // hint depends only on req.query + duration (not the results), so it is computable up front. Emit it
  // FIRST in the head to match the buffered key order above (attachQueryHint returns { hint, ...result }).
  const hint = (attachQueryHint(req, ctx.esSearchDurationMs, {}) as Record<string, any>).hint

  // Envelope head: everything that precedes `results`. Serialized as an object then spliced so the
  // number/string encoding is identical to JSON.stringify of the buffered result.
  const head: Record<string, any> = {}
  if (hint) head.hint = hint
  if (source.total != null) head.total = source.total
  if (ctx.nextHref) head.next = ctx.nextHref

  res.type('json').status(200)

  // Bandwidth throttling: write the body through res.throttle('dynamic') (a Throttle Transform) piped
  // into res, so the streamed json is rate-limited exactly like the buffered path was via res.throttleEnd.
  // The unit-test fake `res` (a plain PassThrough) has no `throttle`, so fall back to writing to `res`
  // directly. Pipe with { end: false } and end `res` explicitly so we never collide with the
  // throttleEnd-wrapped res.end (arg-less end goes straight to the original end).
  const throttled = typeof res.throttle === 'function' ? res.throttle('dynamic') : res
  if (throttled !== res) throttled.pipe(res, { end: false })

  try {
    const headStr = JSON.stringify(head)
    await write(throttled, (headStr === '{}' ? '{' : headStr.slice(0, -1) + ',') + '"results":[')

    let first = true
    let count = 0
    let lastHit: any
    // One serialized string + one write per BULK (not per hit): fewer res.write calls and drain awaits.
    for await (const bulk of source.hits) {
      let chunk = ''
      for (let k = 0; k < bulk.length; k++) {
        const row = esUtils.prepareResultItem(bulk[k], dataset, query, flatten, ctx.publicBaseUrl, resultCtx)
        chunk += (first ? '' : ',') + JSON.stringify(row)
        first = false
        count++
      }
      if (bulk.length) lastHit = bulk[bulk.length - 1]
      if (chunk) await write(throttled, chunk)
    }
    await write(throttled, ']')

    // Streamed-mode next link: the head was already flushed without it (and without the Link header), so
    // append it to the body tail now that the last hit is known. Built exactly like the buffered path.
    if (ctx.nextParams && ctx.nextParams.size && count === ctx.nextParams.size && lastHit) {
      const { publicBaseUrl, datasetId, query: nextQuery } = ctx.nextParams
      const nextLinkURL = new URL(`${publicBaseUrl}/api/v1/datasets/${datasetId}/lines`)
      for (const key of Object.keys(nextQuery)) {
        if (key !== 'page') nextLinkURL.searchParams.set(key, nextQuery[key])
      }
      nextLinkURL.searchParams.set('after', JSON.stringify(lastHit.sort).slice(1, -1))
      await write(throttled, ',"next":' + JSON.stringify(nextLinkURL.href))
    }

    // Tail field: `totalCollapse` isn't known until the aggregations arrive with the stream tail, so it
    // trails the streamed results (order-irrelevant to consumers — both parse to the same object). The
    // hint was already emitted first in the head, so it is NOT re-added here.
    const tail = await source.tail()
    if (query.collapse && tail?.aggregations?.totalCollapse) {
      await write(throttled, ',"totalCollapse":' + JSON.stringify(tail.aggregations.totalCollapse.value))
    }
    await write(throttled, '}')

    // When throttling, flush the Throttle transform (its readable side drains into res) and wait until
    // every chunk has reached res before ending the response.
    if (throttled !== res) {
      await new Promise<void>((resolve, reject) => {
        throttled.on('end', resolve)
        throttled.on('error', reject)
        throttled.end()
      })
    }
    // arg-less end goes straight to the original res.end (the throttleEnd wrapper only throttles a Buffer
    // body, which never reaches here since the data already went through the throttle transform).
    res.end()
  } catch (err: any) {
    // Mid-stream error: headers are already flushed so we cannot send a clean HTTP error status.
    // Count genuine anomalies (not client disconnects) via internalError, then tear down the connection
    // so the client receives a truncated/broken body and can detect the failure.
    if (!isClientAbort(req, res, err)) {
      internalError('stream-read-lines', err)
    }
    if (!res.destroyed) res.destroy(err)
  }
}

export interface StreamCsvContext {
  // Buffered mode (flag off / not streamed): materialize the whole CSV and res.send it.
  // This restores Express ETag + Content-Length, byte-identical to the pre-refactor path.
  buffered?: boolean
  // See StreamJsonContext.rewriteAttachmentUrl.
  rewriteAttachmentUrl?: boolean
}

export async function streamCsv (req: any, res: any, source: LinesSource, ctx: StreamCsvContext = {}): Promise<void> {
  const dataset = reqDataset(req)
  const query = req.query
  const flatten = getFlatten(dataset, query.arrays === 'true')
  const resultCtx = esUtils.prepareResultContext(dataset, query)
  resultCtx.rewriteAttachmentUrl = ctx.rewriteAttachmentUrl
  const publicBaseUrl = reqPublicBaseUrl(req)

  // Buffered mode (flag off): fully materialize rows through the same per-hit transform, produce
  // CSV via results2csv (same compileForRequest serializer as csvStreams → byte-identical output),
  // and res.send so Express can compute a strong ETag and answer 304 for conditional requests.
  if (ctx.buffered) {
    const hits = await collect(source)
    const rows: any[] = []
    for (let i = 0; i < hits.length; i++) {
      if (i % 500 === 499) await new Promise(resolve => setImmediate(resolve))
      rows.push(esUtils.prepareResultItem(hits[i], dataset, query, flatten, publicBaseUrl, resultCtx))
    }
    const csv = await outputs.results2csv(req as outputs.ReqWithDataset, rows)
    res.type('csv').status(200).send(csv)
    return
  }

  // Streamed mode: keep the existing incremental csvStreams + throttle path unchanged.
  // Reuse the exact per-row Transform used by the buffered export so csv formatting stays identical
  // (same compiled serializer, same header emission, same empty-set header-only behavior).
  const [transform] = outputs.csvStreams(dataset, query)

  res.type('csv').status(200)

  // Bandwidth throttling: chain the csv Transform through res.throttle('dynamic') into res, so the csv
  // export is rate-limited exactly like the buffered path was via res.throttleEnd. The unit-test fake
  // `res` (a plain PassThrough) has no `throttle`, so fall back to piping the transform straight to res.
  const throttled = typeof res.throttle === 'function' ? res.throttle('dynamic') : res
  if (throttled !== res) {
    transform.pipe(throttled) // transform 'end' → throttled.end()
    throttled.pipe(res, { end: false })
  } else {
    transform.pipe(res, { end: false })
  }

  try {
    for await (const bulk of source.hits) {
      for (let k = 0; k < bulk.length; k++) {
        const row = esUtils.prepareResultItem(bulk[k], dataset, query, flatten, publicBaseUrl, resultCtx)
        if (!transform.write(row)) await new Promise<void>(resolve => transform.once('drain', resolve))
      }
    }

    // Flush the transform (also emits the header row for an empty result set), wait until every chunk has
    // been forwarded through the throttle to `res`, then close the response. The terminal stream whose
    // 'end' means all data reached res is the throttle when present, otherwise the transform itself.
    const terminal = throttled !== res ? throttled : transform
    await new Promise<void>((resolve, reject) => {
      terminal.on('end', resolve)
      terminal.on('error', reject)
      transform.end()
    })
    res.end()
  } catch (err: any) {
    // Mid-stream error: headers are already flushed so we cannot send a clean HTTP error status.
    // Count genuine anomalies (not client disconnects) via internalError, then tear down the connection.
    if (!isClientAbort(req, res, err)) {
      internalError('stream-read-lines', err)
    }
    if (!res.destroyed) res.destroy(err)
  }
}
