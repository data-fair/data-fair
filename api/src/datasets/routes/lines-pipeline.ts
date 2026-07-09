// Shared json/csv pipeline for the /lines endpoint.
//
// It consumes a `LinesSource` (see lines-source.ts: `{ hits: AsyncIterable<bulk>, tail() }`) and
// produces the response body by running the exact same per-hit `prepareResultItem` transform and (for csv)
// the exact same compiled per-row serializer (`outputs.compileForRequest`) that the buffered export uses.
//
// Memory strategy: stream the SOURCE (bounded raw input via the splitter) and serialize each row
// immediately, discarding the transformed objects — only the serialized bytes accumulate (flat
// allocations, never the full parsed/transformed object graph that drove old-gen GC). Rows accumulate in a
// BodyAccumulator (lines-body.ts): encoded to Buffers AND sha1-hashed per ~64KB batch inside consumeHits'
// every-500-rows yield, so no synchronous pass over the WHOLE body ever blocks the event loop (the
// previous single join + Express's full-body etag sha1 + utf8 encode inside res.send blocked for
// seconds on large exports — an accept-queue-overflow / liveness-probe aggravator). The accumulated
// parts are then written to the response SEQUENTIALLY (sendPreparedParts → res.endParts) — never
// concatenated — under backpressure and the bandwidth token bucket, consuming the parts array so memory
// decreases during the send. Because we assemble before sending, the last hit is known, so the response
// keeps its full HTTP semantics: the `Link` header + body `next` pagination, a weak content-derived ETag
// (opaque fingerprint, see BodyAccumulator) / Content-Length, and `304` on `If-None-Match`. A transform
// error throws before anything is sent → a clean HTTP status.
//
// The output MUST be byte-identical to the pre-refactor buffered `readLines`:
//   - JSON envelope: `{ hint?, total, next?, totalCollapse?, results:[…] }` (the exact key order Express's
//     JSON.stringify produced for the buffered result object), assembled by splicing pre-serialized rows.
//   - CSV: byte-equal to `outputs.results2csv` (same compileForRequest serializer, same prologue+rows).
// Both the buffered and streamed sources flow through the SAME single path here, so parity holds by
// construction — the source is the only thing that differs, never the observable response.

import { getFlatten } from '../utils/flatten.ts'
import * as esUtils from '../es/index.ts'
import { rewriteAttachmentUrl } from '../es/commons.ts'
import { hit2feature } from '../utils/geo-features.ts'
import * as outputs from '../utils/outputs.ts'
import { attachQueryHint } from '../../misc/utils/query-advice.ts'
import { reqDataset } from '../../misc/utils/req-context.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import type { LinesSource } from './lines-source.ts'
import { type NextContext, nextLinkHref, linkHeaderValue, BodyAccumulator, jsonBodyPrefix, jsonBodySuffix, geojsonBodyPrefix, geojsonBodySuffix } from './lines-body.ts'

export type { NextContext }

// Send a fully-determined body as its accumulated parts, written sequentially — never concatenated. The
// assemble-then-send contract (ETag / Content-Length / Link known before the first byte) needs the body
// fully DETERMINED, not CONTIGUOUS: skipping the final Buffer.concat removes the 2×-body transient
// (parts + concat result both live at the concat instant) and, because the write loop consumes the parts
// array under backpressure (res.endParts), memory *decreases* during the send instead of pinning 1× body
// for a slow client. Reproduces what the pre-refactor send path emitted, byte-for-byte on the wire:
//   - `; charset=utf-8` appended to the content-type (set earlier via res.type), as res.send(string) did;
//   - ETag set, then `req.fresh` (If-None-Match AND If-Modified-Since) delegated to express's own
//     res.send: with the ETag pre-set and an empty chunk it runs exactly its 304 path (strip content
//     headers, no body) and nothing else — /lines 304s stay identical to every other route's;
//   - HEAD → headers only (Content-Length included), no body — manual, because express would compute
//     Content-Length from the empty chunk;
//   - explicit Content-Length (otherwise Node would switch to chunked transfer encoding — an observable
//     header change; it is also what the read-lines metrics observe on finish).
// res.endParts (installed by res.throttleEnd, see rate-limiting.ts) keeps the bandwidth token bucket and
// the send-slot queue-full teardown enforced — plain res.write calls would bypass both. It is a hard
// contract: a route reaching this without the rate-limiting middleware + res.throttleEnd() throws
// instead of silently skipping bandwidth limits (unit-test fakes install their own endParts).
const sendPreparedParts = (req: any, res: any, parts: Buffer[], length: number, etag: string): void => {
  const type = res.get('Content-Type')
  if (type && !type.includes('charset')) res.set('Content-Type', type + '; charset=utf-8')
  res.set('ETag', etag)
  res.status(200)
  if (req.fresh) return res.send('')
  res.set('Content-Length', String(length))
  if (req.method === 'HEAD') return res.end()
  res.endParts(parts)
}

// Sets the `Link: <…>; rel=next` header on `res` when the page is full (both json and csv rely on it —
// json additionally echoes the href in the body). Pure construction lives in lines-body.ts. Returns the
// href (for the json body) or undefined.
const setNextLink = (res: any, ctx: NextContext, count: number, lastHit: any): string | undefined => {
  const href = nextLinkHref(ctx, count, lastHit)
  if (href) res.set('Link', linkHeaderValue(href))
  return href
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
export const consumeHits = async (source: LinesSource, perRow: (hit: any) => void, yieldEvery = 500): Promise<{ count: number, lastHit: any }> => {
  let count = 0
  let lastHit: any
  try {
    for await (const bulk of source.hits) {
      for (let k = 0; k < bulk.length; k++) {
        if (count % yieldEvery === yieldEvery - 1) await new Promise(resolve => setImmediate(resolve))
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

// wkt=true parses + WKT-serializes the raw geometry column per row (unbounded vertex counts — a 500-row
// batch of large polygons measured ~600ms of sync work), so those requests yield 10x more often
const wktYieldEvery = (query: any) => query.wkt === 'true' ? 50 : 500

export async function streamJson (req: any, res: any, source: LinesSource, ctx: StreamJsonContext): Promise<void> {
  const dataset = reqDataset(req)
  const query = req.query
  const flatten = getFlatten(dataset, query.arrays === 'true')
  const resultCtx = esUtils.prepareResultContext(dataset, query)
  resultCtx.rewriteAttachmentUrl = ctx.rewriteAttachmentUrl

  // Serialize each row on the fly; keep only the encoded bytes (no transformed-object graph retained).
  const acc = new BodyAccumulator()
  let sep = ''
  const { count, lastHit } = await consumeHits(source, hit => {
    acc.push(sep + JSON.stringify(esUtils.prepareResultItem(hit, dataset, query, flatten, ctx.publicBaseUrl, resultCtx)))
    sep = ','
  }, wktYieldEvery(query))
  const tail = await safeTail(source)

  // Head object in the exact key order the buffered result had: { hint, total, next?, totalCollapse? }.
  // Serialize it, strip the closing brace, and splice `,"results":[…]}` so the bytes equal JSON.stringify
  // of the equivalent object. `next` also goes into the Link header.
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

  const { parts, length, etag } = acc.finish(jsonBodyPrefix(head), jsonBodySuffix)
  sendPreparedParts(req, res.type('json'), parts, length, etag)
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
  // plumbing to get wrong. Only the encoded bytes accumulate (no transformed-object graph retained).
  // Assemble + res.send at the end so csv keeps its Link-header pagination (its only pagination signal)
  // + ETag / Content-Length. An empty result set still yields the header row (the prologue).
  const { prologue, row } = outputs.compileForRequest(dataset, query)
  const acc = new BodyAccumulator()
  acc.push(prologue)
  const { count, lastHit } = await consumeHits(source, hit => {
    acc.push(row(esUtils.prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, resultCtx)))
  }, wktYieldEvery(query))

  setNextLink(res, ctx, count, lastHit)
  const { parts, length, etag } = acc.finish('', '')
  sendPreparedParts(req, res.type('csv'), parts, length, etag)
}

export interface StreamGeojsonContext extends NextContext {
  rewriteAttachmentUrl?: boolean
  bbox?: any // value or Promise — awaited only after the hits are drained (lets the agg overlap consumption)
}

// GeoJSON is not a "hard" format: each hit maps to one Feature (geo.hit2feature) and the bbox comes from a
// separate bboxAgg call — so it streams the source exactly like json, serializing each Feature and dropping
// the object. Assembled body is byte-identical to `res.send(result2geojson(esResponse) + bbox)`: key order
// FeatureCollection → { type, total?, features, bbox? }. Content-type/disposition are set by read.ts.
export async function streamGeojson (req: any, res: any, source: LinesSource, ctx: StreamGeojsonContext): Promise<void> {
  const dataset = reqDataset(req)
  const flatten = getFlatten(dataset, true) // geojson preserves arrays (matches read.ts getFlatten(dataset, true))
  const publicBaseUrl = reqPublicBaseUrl(req)

  const acc = new BodyAccumulator()
  let sep = ''
  const { count, lastHit } = await consumeHits(source, hit => {
    const feature = hit2feature(hit, flatten)
    // like json/csv: a searchStream source holds the raw stored _attachment_url → rewrite here (buffered
    // esResponse from search() already rewrote it, so ctx.rewriteAttachmentUrl is false there).
    if (ctx.rewriteAttachmentUrl && feature.properties._attachment_url) {
      feature.properties._attachment_url = rewriteAttachmentUrl(feature.properties._attachment_url, dataset, publicBaseUrl)
    }
    acc.push(sep + JSON.stringify(feature))
    sep = ','
  })
  const tail = await safeTail(source) // drain the stream to completion; total lives in the envelope
  // ctx.bbox may be a promise (read.ts starts the bboxAgg round trip and lets it overlap the hit
  // consumption); awaited only now, once the hits are drained, and before anything is sent.
  const bbox = await ctx.bbox

  setNextLink(res, ctx, count, lastHit)
  const total = tail?.hits?.total?.value
  const { parts, length, etag } = acc.finish(geojsonBodyPrefix(total), geojsonBodySuffix(bbox))
  sendPreparedParts(req, res, parts, length, etag)
}
