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

export interface StreamJsonContext {
  publicBaseUrl: string
  nextHref?: string
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

  const headStr = JSON.stringify(head)
  await write(res, (headStr === '{}' ? '{' : headStr.slice(0, -1) + ',') + '"results":[')

  let first = true
  for await (const hit of source.hits) {
    const row = esUtils.prepareResultItem(hit, dataset, query, flatten, ctx.publicBaseUrl, resultCtx)
    await write(res, (first ? '' : ',') + JSON.stringify(row))
    first = false
  }
  await write(res, ']')

  // Tail fields come after the streamed results but are order-irrelevant to consumers (the buffered
  // path emits total/next/totalCollapse before results and prepends hint; both parse to the same
  // object). `totalCollapse` only exists when `collapse` is requested; `attachQueryHint` adds `hint`.
  const tail = await source.tail()
  let extra: Record<string, any> = {}
  if (query.collapse && tail?.aggregations?.totalCollapse) extra.totalCollapse = tail.aggregations.totalCollapse.value
  extra = attachQueryHint(req, ctx.esSearchDurationMs, extra)
  for (const k of Object.keys(extra)) {
    await write(res, ',' + JSON.stringify(k) + ':' + JSON.stringify(extra[k]))
  }
  res.end('}')
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
  transform.pipe(res, { end: false })

  for await (const hit of source.hits) {
    const row = esUtils.prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, resultCtx)
    if (!transform.write(row)) await new Promise<void>(resolve => transform.once('drain', resolve))
  }

  // Flush the transform (also emits the header row for an empty result set), wait until every chunk
  // has been forwarded to `res`, then close the response.
  await new Promise<void>((resolve, reject) => {
    transform.on('end', resolve)
    transform.on('error', reject)
    transform.end()
  })
  res.end()
}
