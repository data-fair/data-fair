// Shared json/csv pipeline for the /lines endpoint.
//
// It consumes a `LinesSource` (see lines-source.ts: `{ hits: AsyncIterable<bulk>, tail() }`) and
// produces the response body by running the exact same per-hit `prepareResultItem` transform and (for csv)
// the exact same compiled per-row serializer (`outputs.compileForRequest`) that the buffered export uses.
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
//   - CSV: byte-equal to `outputs.results2csv` (same compileForRequest serializer, same prologue+rows).
// Both the buffered and streamed sources flow through the SAME single path here, so parity holds by
// construction — the source is the only thing that differs, never the observable response.

import LinkHeader from 'http-link-header'
import { getFlatten } from '../utils/flatten.ts'
import * as esUtils from '../es/index.ts'
import { rewriteAttachmentUrl } from '../es/commons.ts'
import { hit2feature } from '../utils/geo-features.ts'
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

// Shared consumption loop for the three formats: bulks → a SYNCHRONOUS per-row serializer (a per-row await
// would reintroduce the microtask-per-hit overhead the bulk design removed), an event-loop yield every 500
// rows, count/lastHit tracking. On ANY error — a per-row transform throw or a mid-stream ES read error —
// destroy the source (releases the ES asStream connection) before rethrowing; without this the handler
// unwinds with the ES response stream still open.
export const consumeHits = async (source: LinesSource, perRow: (hit: any) => void): Promise<{ count: number, lastHit: any }> => {
  let count = 0
  let lastHit: any
  try {
    for await (const bulk of source.hits) {
      for (let k = 0; k < bulk.length; k++) {
        if (count % 500 === 499) await new Promise(resolve => setImmediate(resolve))
        perRow(bulk[k])
        count++
      }
      if (bulk.length) lastHit = bulk[bulk.length - 1]
    }
  } catch (err) {
    source.destroy?.()
    throw err
  }
  return { count, lastHit }
}

// Drain the rest of the stream and return the envelope, destroying the source if the drain itself fails.
const safeTail = async (source: LinesSource): Promise<any> => {
  try {
    return await source.tail()
  } catch (err) {
    source.destroy?.()
    throw err
  }
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
  const { count, lastHit } = await consumeHits(source, hit => {
    rows.push(JSON.stringify(esUtils.prepareResultItem(hit, dataset, query, flatten, ctx.publicBaseUrl, resultCtx)))
  })
  const tail = await safeTail(source)

  // Head object in the exact key order the buffered result had: { hint, total, next?, totalCollapse? }.
  // Serialize it, strip the closing brace, and splice `,"results":[…]}` so the bytes equal JSON.stringify
  // of the equivalent object (→ identical ETag). `next` also goes into the Link header.
  const head: Record<string, any> = {}
  const hint = (attachQueryHint(req, ctx.esSearchDurationMs, {}) as Record<string, any>).hint
  if (hint) head.hint = hint
  // total lives in the tail envelope (absent when track_total_hits:false — after= pages, count=false);
  // the buffered source's tail() is the esResponse itself, so both sources share this exact read.
  const total = tail?.hits?.total?.value
  if (total != null) head.total = total
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

  // Same compiled per-row serializer as the buffered export (results2csv / the old csvStreams Transform,
  // whose first push was `prologue + row(item)`): byte-identical output with no stream machinery — a
  // serializer throw propagates synchronously, before anything is sent, and there is no drain/error
  // plumbing to get wrong. Only the row strings accumulate (no transformed-object graph retained).
  // Assemble + res.send at the end so csv keeps its Link-header pagination (its only pagination signal)
  // + ETag / Content-Length. An empty result set still yields the header row (the prologue).
  const { prologue, row } = outputs.compileForRequest(dataset, query)
  const parts: string[] = [prologue]
  const { count, lastHit } = await consumeHits(source, hit => {
    parts.push(row(esUtils.prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, resultCtx)))
  })

  setNextLink(res, ctx, count, lastHit)
  res.type('csv').status(200).send(parts.join(''))
}

export interface StreamGeojsonContext extends NextContext {
  rewriteAttachmentUrl?: boolean
  bbox?: any
}

// GeoJSON is not a "hard" format: each hit maps to one Feature (geo.hit2feature) and the bbox comes from a
// separate bboxAgg call — so it streams the source exactly like json, serializing each Feature and dropping
// the object. Assembled body is byte-identical to `res.send(result2geojson(esResponse) + bbox)`: key order
// FeatureCollection → { type, total?, features, bbox? }. Content-type/disposition are set by read.ts.
export async function streamGeojson (req: any, res: any, source: LinesSource, ctx: StreamGeojsonContext): Promise<void> {
  const dataset = reqDataset(req)
  const flatten = getFlatten(dataset, true) // geojson preserves arrays (matches read.ts getFlatten(dataset, true))
  const publicBaseUrl = reqPublicBaseUrl(req)

  const features: string[] = []
  const { count, lastHit } = await consumeHits(source, hit => {
    const feature = hit2feature(hit, flatten)
    // like json/csv: a searchStream source holds the raw stored _attachment_url → rewrite here (buffered
    // esResponse from search() already rewrote it, so ctx.rewriteAttachmentUrl is false there).
    if (ctx.rewriteAttachmentUrl && feature.properties._attachment_url) {
      feature.properties._attachment_url = rewriteAttachmentUrl(feature.properties._attachment_url, dataset, publicBaseUrl)
    }
    features.push(JSON.stringify(feature))
  })
  const tail = await safeTail(source) // drain the stream to completion; total lives in the envelope

  setNextLink(res, ctx, count, lastHit)
  const total = tail?.hits?.total?.value
  let body = '{"type":"FeatureCollection"'
  if (total != null) body += ',"total":' + total
  body += ',"features":[' + features.join(',') + ']'
  if (ctx.bbox !== undefined) body += ',"bbox":' + JSON.stringify(ctx.bbox)
  body += '}'
  res.status(200).send(body)
}
