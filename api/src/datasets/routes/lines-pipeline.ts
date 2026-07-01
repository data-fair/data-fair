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
import type { LinesSource } from './lines-source.ts'

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
}

// Await drain when the socket buffer is full, otherwise continue synchronously — honors backpressure
// while keeping at most one row string transiently in memory per iteration.
const write = (res: any, s: string | Buffer): Promise<void> =>
  res.write(s) ? Promise.resolve() : new Promise<void>(resolve => res.once('drain', resolve))

// Materialize the whole source for the "hard" formats (xlsx / ods / geojson / shp / wkt / vector
// tiles) that cannot be produced incrementally. Equivalent to `Array.fromAsync(source.hits)`.
export async function collect (source: LinesSource): Promise<any[]> {
  const items: any[] = []
  for await (const h of source.hits) items.push(h)
  return items
}

export async function streamJson (req: any, res: any, source: LinesSource, ctx: StreamJsonContext): Promise<void> {
  const dataset = reqDataset(req)
  const query = req.query
  const flatten = getFlatten(dataset, query.arrays === 'true')
  const resultCtx = esUtils.prepareResultContext(dataset, query)

  // Envelope head: everything that precedes `results`. Serialized as an object then spliced so the
  // number/string encoding is identical to JSON.stringify of the buffered result.
  const head: Record<string, any> = {}
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

  const headStr = JSON.stringify(head)
  await write(throttled, (headStr === '{}' ? '{' : headStr.slice(0, -1) + ',') + '"results":[')

  let first = true
  let count = 0
  let lastHit: any
  for await (const hit of source.hits) {
    const row = esUtils.prepareResultItem(hit, dataset, query, flatten, ctx.publicBaseUrl, resultCtx)
    await write(throttled, (first ? '' : ',') + JSON.stringify(row))
    first = false
    count++
    lastHit = hit
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

  // Tail fields come after the streamed results but are order-irrelevant to consumers (the buffered
  // path emits total/next/totalCollapse before results and prepends hint; both parse to the same
  // object). `totalCollapse` only exists when `collapse` is requested; `attachQueryHint` adds `hint`.
  const tail = await source.tail()
  let extra: Record<string, any> = {}
  if (query.collapse && tail?.aggregations?.totalCollapse) extra.totalCollapse = tail.aggregations.totalCollapse.value
  extra = attachQueryHint(req, ctx.esSearchDurationMs, extra)
  for (const k of Object.keys(extra)) {
    await write(throttled, ',' + JSON.stringify(k) + ':' + JSON.stringify(extra[k]))
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
}

export async function streamCsv (req: any, res: any, source: LinesSource): Promise<void> {
  const dataset = reqDataset(req)
  const query = req.query
  const flatten = getFlatten(dataset, query.arrays === 'true')
  const resultCtx = esUtils.prepareResultContext(dataset, query)
  const publicBaseUrl = reqPublicBaseUrl(req)

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

  for await (const hit of source.hits) {
    const row = esUtils.prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, resultCtx)
    if (!transform.write(row)) await new Promise<void>(resolve => transform.once('drain', resolve))
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
}
