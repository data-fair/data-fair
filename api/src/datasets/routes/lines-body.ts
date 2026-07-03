// Pure, config-free payload/link builders for the /lines pipeline — extracted from lines-pipeline.ts so
// the byte-level output contract can be unit-tested without loading the app config, and so read.ts's
// hard-format branch shares the SAME next-link construction (one pagination contract, not two).
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

// Head object serialized then spliced with the pre-serialized rows: byte-identical to JSON.stringify of
// the equivalent object (same key order, JSON.stringify per value) → identical ETag.
export const buildJsonBody = (head: Record<string, any>, rows: string[]): string => {
  const headStr = JSON.stringify(head)
  return (headStr === '{}' ? '{' : headStr.slice(0, -1) + ',') + '"results":[' + rows.join(',') + ']}'
}

// FeatureCollection body, key order type → total? → features → bbox? (matches the buffered
// `res.send(result2geojson(esResponse) + bbox)` output).
export const buildGeojsonBody = (total: number | undefined | null, features: string[], bbox: any): string => {
  let body = '{"type":"FeatureCollection"'
  if (total != null) body += ',"total":' + total
  body += ',"features":[' + features.join(',') + ']'
  if (bbox !== undefined) body += ',"bbox":' + JSON.stringify(bbox)
  body += '}'
  return body
}
