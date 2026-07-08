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
// push() is fed the exact body substrings (separators included) and encodes them to a Buffer every
// ~flushChars characters — amortized inside consumeHits' every-500-rows yield, so it needs no yields of
// its own. finish() takes the envelope prefix/suffix (the prefix — total/next — is only known after the
// last hit, but must be hashed first) and does the only remaining full-body passes: a sha1 walk yielding
// every hashYieldBytes, and one Buffer.concat (pure memcpy). The returned etag is byte-identical to what
// Express generates in res.send (the `etag` package's weak form) — the caller sets it as a header so
// Express skips its own full-body hash.
export class BodyAccumulator {
  private parts: Buffer[] = []
  private pending: string[] = []
  private pendingChars = 0
  private readonly flushChars: number
  private readonly hashYieldBytes: number

  constructor (opts?: { flushChars?: number, hashYieldBytes?: number }) {
    this.flushChars = opts?.flushChars ?? 64 * 1024
    this.hashYieldBytes = opts?.hashYieldBytes ?? 2 * 1024 * 1024
  }

  push (chunk: string): void {
    this.pending.push(chunk)
    this.pendingChars += chunk.length
    if (this.pendingChars >= this.flushChars) this.flush()
  }

  private flush (): void {
    if (!this.pendingChars) return
    this.parts.push(Buffer.from(this.pending.join('')))
    this.pending = []
    this.pendingChars = 0
  }

  async finish (prefix: string, suffix: string): Promise<{ buffer: Buffer, etag: string }> {
    this.flush()
    const parts = [Buffer.from(prefix), ...this.parts, Buffer.from(suffix)]
    const hash = createHash('sha1')
    let length = 0
    let sinceYield = 0
    for (const part of parts) {
      hash.update(part)
      length += part.length
      sinceYield += part.length
      if (sinceYield >= this.hashYieldBytes) {
        sinceYield = 0
        await new Promise(resolve => setImmediate(resolve))
      }
    }
    // the `etag` package's weak format: W/"<byte length in hex>-<base64 sha1 truncated to 27 chars>"
    const etag = `W/"${length.toString(16)}-${hash.digest('base64').substring(0, 27)}"`
    return { buffer: Buffer.concat(parts), etag }
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
