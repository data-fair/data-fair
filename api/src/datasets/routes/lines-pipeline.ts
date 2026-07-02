// Shared json/csv pipeline for the /lines endpoint.
//
// It consumes a `LinesSource` (see lines-source.ts: `{ total, hits: AsyncIterable<bulk>, tail() }`) and
// produces the response body by running the exact same per-hit `prepareResultItem` transform and (for csv)
// the exact same `csvStreams` per-row serializer that the pre-refactor buffered path used.
//
// Memory strategy: stream the SOURCE (bounded raw input via the splitter) and serialize each row
// immediately, discarding the transformed objects — only the serialized bytes accumulate (flat
// allocations, never the full parsed/transformed object graph that drove old-gen GC). The whole body is
// then `res.send`. Because we assemble before sending, the last hit is known, so the response keeps its
// full HTTP semantics: the `Link` header + body `next` pagination, a strong Express ETag / Content-Length,
// and `304` on `If-None-Match`. A transform error throws before anything is sent → a clean HTTP status.
//
// The output MUST be byte-identical to the pre-refactor buffered `readLines`:
//   - JSON envelope: `{ hint?, total, next?, totalCollapse?, results:[…] }` (the exact key order Express's
//     JSON.stringify produced for the buffered result object), assembled by splicing pre-serialized rows.
//   - CSV: byte-equal to `outputs.results2csv` (csvStreams uses the same compileForRequest serializer).
// Both the buffered and streamed sources flow through the SAME single path here, so parity holds by
// construction — the source is the only thing that differs, never the observable response.

import LinkHeader from 'http-link-header'
import { getFlatten } from '../utils/flatten.ts'
import * as esUtils from '../es/index.ts'
import * as outputs from '../utils/outputs.ts'
import { attachQueryHint } from '../../misc/utils/query-advice.ts'
import { reqDataset } from '../../misc/utils/req-context.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import type { LinesSource } from './lines-source.ts'

// Inputs needed to build the `next` pagination link (all optional — omitted in unit tests that don't
// exercise pagination; read.ts always passes them together). `query` is read.ts's query copy (owner added,
// `_stream` dropped) so the link is byte-identical to the pre-refactor one.
export interface NextContext {
  size?: number
  query?: Record<string, any>
  publicBaseUrl?: string
  datasetId?: string
}

// A full page (count === size) has a next page: build its search_after link exactly like the pre-refactor
// read.ts did. Also sets the `Link: <…>; rel=next` header on `res` (both json and csv rely on it — json
// additionally echoes it in the body). Returns the href (for the json body) or undefined.
const setNextLink = (res: any, ctx: NextContext, count: number, lastHit: any): string | undefined => {
  if (!(ctx.size && count === ctx.size && lastHit)) return undefined
  const url = new URL(`${ctx.publicBaseUrl}/api/v1/datasets/${ctx.datasetId}/lines`)
  for (const key of Object.keys(ctx.query!)) {
    if (key !== 'page') url.searchParams.set(key, ctx.query![key])
  }
  url.searchParams.set('after', JSON.stringify(lastHit.sort).slice(1, -1))
  const link = new LinkHeader()
  link.set({ rel: 'next', uri: url.href })
  res.set('Link', link.toString())
  return url.href
}

export interface StreamJsonContext extends NextContext {
  esSearchDurationMs: number
  // Source came from searchStream (its hits still hold the raw stored `_attachment_url`) → prepareResultItem
  // must rewrite it. False when the source is search()'s esResponse (already rewritten). See commons.ts.
  rewriteAttachmentUrl?: boolean
}

// Materialize the whole source for the "hard" formats (xlsx / ods / geojson / shp / wkt / vector tiles)
// that genuinely need the full array (bbox, tile rendering, sheet building). Flattens the bulks.
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

  // Serialize each row on the fly; keep only the row strings (no transformed-object graph retained).
  const rows: string[] = []
  let lastHit: any
  let count = 0
  for await (const bulk of source.hits) {
    for (let k = 0; k < bulk.length; k++) {
      // yield to the event loop on large (synchronous) buffered sources so we don't starve other requests
      if (count % 500 === 499) await new Promise(resolve => setImmediate(resolve))
      rows.push(JSON.stringify(esUtils.prepareResultItem(bulk[k], dataset, query, flatten, ctx.publicBaseUrl, resultCtx)))
      count++
    }
    if (bulk.length) lastHit = bulk[bulk.length - 1]
  }
  const tail = await source.tail()

  // Head object in the exact key order the buffered result had: { hint, total, next?, totalCollapse? }.
  // Serialize it, strip the closing brace, and splice `,"results":[…]}` so the bytes equal JSON.stringify
  // of the equivalent object (→ identical ETag). `next` also goes into the Link header.
  const head: Record<string, any> = {}
  const hint = (attachQueryHint(req, ctx.esSearchDurationMs, {}) as Record<string, any>).hint
  if (hint) head.hint = hint
  if (source.total != null) head.total = source.total
  const nextHref = setNextLink(res, ctx, count, lastHit)
  if (nextHref) head.next = nextHref
  if (query.collapse && tail?.aggregations?.totalCollapse) head.totalCollapse = tail.aggregations.totalCollapse.value

  const headStr = JSON.stringify(head)
  const body = (headStr === '{}' ? '{' : headStr.slice(0, -1) + ',') + '"results":[' + rows.join(',') + ']}'
  res.type('json').status(200).send(body)
}

export interface StreamCsvContext extends NextContext {
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

  // Feed rows through the same compiled csv Transform the buffered export uses (byte-identical to
  // results2csv), collecting its output without retaining the transformed row objects. Assemble + res.send
  // at the end so csv keeps its Link-header pagination (its only pagination signal) + ETag / Content-Length.
  const [transform] = outputs.csvStreams(dataset, query)
  const csvChunks: Buffer[] = []
  transform.on('data', (c: Buffer) => csvChunks.push(Buffer.from(c)))

  let lastHit: any
  let count = 0
  const drained = new Promise<void>((resolve, reject) => {
    transform.on('end', resolve)
    transform.on('error', reject)
  })
  for await (const bulk of source.hits) {
    for (let k = 0; k < bulk.length; k++) {
      if (count % 500 === 499) await new Promise(resolve => setImmediate(resolve))
      const row = esUtils.prepareResultItem(bulk[k], dataset, query, flatten, publicBaseUrl, resultCtx)
      if (!transform.write(row)) await new Promise<void>(resolve => transform.once('drain', resolve))
      count++
    }
    if (bulk.length) lastHit = bulk[bulk.length - 1]
  }
  transform.end()
  await drained

  setNextLink(res, ctx, count, lastHit)
  res.type('csv').status(200).send(Buffer.concat(csvChunks))
}
