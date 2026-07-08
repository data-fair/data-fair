// Pure, config-free payload/link builders for the /lines pipeline — extracted from lines-pipeline.ts so
// the byte-level output contract can be unit-tested without loading the app config, and so read.ts's
// hard-format branch shares the SAME next-link construction (one pagination contract, not two).
import { createHash } from 'node:crypto'
import LinkHeader from 'http-link-header'

// Inputs needed to build the `next` pagination link (all optional — omitted in unit tests that don't
// exercise pagination; read.ts always passes them together). `query` is read.ts's query copy (owner added,
// `_stream` dropped) so the link is byte-identical to the pre-refactor one.
export interface NextContext {
  size?: number
  query?: Record<string, any>
  publicBaseUrl?: string
  datasetId?: string
}

// A full page (count === size) has a next page: its search_after href, built exactly like the
// pre-refactor read.ts did. Returns undefined on a partial page.
export const nextLinkHref = (ctx: NextContext, count: number, lastHit: any): string | undefined => {
  if (!(ctx.size && count === ctx.size && lastHit)) return undefined
  const url = new URL(`${ctx.publicBaseUrl}/api/v1/datasets/${ctx.datasetId}/lines`)
  for (const key of Object.keys(ctx.query!)) {
    if (key !== 'page') url.searchParams.set(key, ctx.query![key])
  }
  url.searchParams.set('after', JSON.stringify(lastHit.sort).slice(1, -1))
  return url.href
}

export const linkHeaderValue = (href: string): string => {
  const link = new LinkHeader()
  link.set({ rel: 'next', uri: href })
  return link.toString()
}

// Accumulates the body of a /lines response (json/csv/geojson) as pre-encoded Buffer batches instead of
// one monolithic string, so no single synchronous pass over the whole body ever blocks the event loop
// (a large export used to block for seconds in join + Express's etag sha1 + utf8 encode inside res.send).
// push() is fed the exact body substrings (separators included); every ~flushChars characters they are
// encoded to a Buffer AND fed to the sha1 — amortized inside consumeHits' every-500-rows yield, so the
// accumulator needs no yields of its own. finish() takes the envelope prefix/suffix (the prefix —
// total/next — is only known after the last hit) and only hashes those two + one Buffer.concat (pure
// memcpy) — synchronous and O(envelope), not O(body).
//
// The etag is an OPAQUE deterministic content fingerprint, not Express's body hash: the hash input order
// is rows → suffix → prefix (sha1 is sequential and the prefix arrives last), which is fine because an
// etag only needs same-body ⇒ same-etag (across pods, restarts and flush batching — the prefix/rows split
// is a deterministic function of the body) and any-change ⇒ different-etag (rows, suffix AND prefix are
// all hashed — identical rows with a different envelope `total` must not 304). Same weak format as the
// `etag` package (W/"<hex byte length>-<base64 sha1, 27 chars>"); the value differs, so deploying a
// scheme change costs each cached client one revalidation miss — harmless.
export class BodyAccumulator {
  private parts: Buffer[] = []
  private pending: string[] = []
  private pendingChars = 0
  private readonly flushChars: number
  private readonly hash = createHash('sha1')

  constructor (opts?: { flushChars?: number }) {
    this.flushChars = opts?.flushChars ?? 64 * 1024
  }

  push (chunk: string): void {
    this.pending.push(chunk)
    this.pendingChars += chunk.length
    if (this.pendingChars >= this.flushChars) this.flush()
  }

  private flush (): void {
    if (!this.pendingChars) return
    const part = Buffer.from(this.pending.join(''))
    this.hash.update(part)
    this.parts.push(part)
    this.pending = []
    this.pendingChars = 0
  }

  finish (prefix: string, suffix: string): { buffer: Buffer, etag: string } {
    this.flush()
    const prefixBuf = Buffer.from(prefix)
    const suffixBuf = Buffer.from(suffix)
    this.hash.update(suffixBuf)
    this.hash.update(prefixBuf)
    const buffer = Buffer.concat([prefixBuf, ...this.parts, suffixBuf])
    const etag = `W/"${buffer.length.toString(16)}-${this.hash.digest('base64').substring(0, 27)}"`
    return { buffer, etag }
  }
}

// Head object serialized then spliced ahead of the rows: byte-identical to JSON.stringify of the
// equivalent object (same key order, JSON.stringify per value) → identical ETag. The prefix/suffix pair
// is what the accumulator path uses; buildJsonBody derives from it so the two paths cannot drift.
export const jsonBodyPrefix = (head: Record<string, any>): string => {
  const headStr = JSON.stringify(head)
  return (headStr === '{}' ? '{' : headStr.slice(0, -1) + ',') + '"results":['
}
export const jsonBodySuffix = ']}'
export const buildJsonBody = (head: Record<string, any>, rows: string[]): string =>
  jsonBodyPrefix(head) + rows.join(',') + jsonBodySuffix

// FeatureCollection body, key order type → total? → features → bbox? (matches the buffered
// `res.send(result2geojson(esResponse) + bbox)` output). Same prefix/suffix sharing as the json envelope.
export const geojsonBodyPrefix = (total: number | undefined | null): string =>
  '{"type":"FeatureCollection"' + (total != null ? ',"total":' + total : '') + ',"features":['
export const geojsonBodySuffix = (bbox: any): string =>
  ']' + (bbox !== undefined ? ',"bbox":' + JSON.stringify(bbox) : '') + '}'
export const buildGeojsonBody = (total: number | undefined | null, features: string[], bbox: any): string =>
  geojsonBodyPrefix(total) + features.join(',') + geojsonBodySuffix(bbox)
