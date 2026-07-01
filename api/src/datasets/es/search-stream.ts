import type { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type Client } from '@elastic/elasticsearch'
import { aliasName, prepareQuery } from './commons.ts'
import { tooLongError } from './operations.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import { streamToSource, chooseStreamMode, collectResponse } from './hits-stream.ts'
import type { LinesSource } from '../routes/lines-source.ts'

export { streamToSource }

// Result of a mode-selecting streamed search: either a live streamed source (large response) or a fully
// materialized `esResponse` identical to the buffered `search()` shape (small response, collected here).
export type SearchStreamResult =
  | { mode: 'streamed', source: LinesSource }
  | { mode: 'buffered', esResponse: any }

// Mirror the buffered `search` request but with `asStream: true`, then decide the mode from the ES response
// `content-length`: below `minBytes` the payload is small enough that streaming's CPU overhead isn't worth
// the tiny memory saving, so we collect it here and return a buffered `esResponse` (preserving ETag/next);
// at or above `minBytes` — or when the size is unknown (chunked / gzip-compressed length) — we stream.
// `forceStream` (the non-prod `?_stream` opt-in) always streams so tests exercise the streamed path
// deterministically. Same `prepareQuery`, same querystring (`allow_partial_search_results:'false'` +
// `timeout`), same abort/timeout accounting. Under `asStream` the client hands back the response body as a
// Node stream and does NOT auto-decompress, so we gunzip when the response is gzip-encoded (we let the
// client negotiate encoding exactly like the buffered path — by default it requests identity, so
// `content-length` is the real decompressed size). Vector-tile (`vtXYZ`) requests are a hard/collect format
// and never use this streamed path, so their script_fields shaping is intentionally omitted here.
export async function searchStream (client: Client, dataset: any, query: any, abortContext: EsAbortContext | undefined, opts: { minBytes: number, forceStream?: boolean }): Promise<SearchStreamResult> {
  const esQuery = prepareQuery(dataset, query)

  if (query.collapse) {
    const collapseField = dataset.schema.find((f: any) => f.key === query.collapse)
    if (!collapseField) {
      throw httpError(400, `Impossible d'utiliser "collapse" sur le champ ${query.collapse}, il n'existe pas dans le jeu de données.`)
    }
    if (collapseField.separator) {
      throw httpError(400, `Impossible d'utiliser "collapse" sur le champ ${query.collapse}, il est multivalué.`)
    }
    esQuery.collapse = { field: query.collapse }
    const precisionThreshold = Number(query.precision_threshold ?? '40000')
    esQuery.aggs = { totalCollapse: { cardinality: { field: query.collapse, precision_threshold: precisionThreshold } } }
  }

  const res = await timedEsCall(abortContext, () => client.transport.request({
    method: 'POST',
    path: `/${aliasName(dataset)}/_search`,
    body: esQuery,
    querystring: {
      // never return truncated results: when `timeout` elapses ES fails the request (504) rather than
      // returning partial hits — identical to the buffered `search`.
      allow_partial_search_results: 'false',
      timeout: config.elasticsearch.searchTimeout
    }
  }, { ...abortContext, meta: true, asStream: true }))

  const body = res.body as unknown as Readable
  const statusCode = (res as any).statusCode as number
  if (statusCode >= 400) {
    // asStream skips body deserialization, so surface a clean error before the first byte is written
    let raw = ''
    try { for await (const c of body) raw += c.toString() } catch { /* ignore */ }
    let parsed: any; try { parsed = JSON.parse(raw) } catch { /* non-json body */ }
    if (parsed?.timed_out || statusCode === 504) throw httpError(tooLongError.status, tooLongError.message)
    throw httpError(statusCode, parsed?.error?.reason || raw || 'Elasticsearch error')
  }

  const encoding = String(res.headers?.['content-encoding'] ?? '')
  const gzip = encoding.includes('gzip')
  const decoded: Readable = gzip ? body.pipe(createGunzip()) : body

  // Propagate client abort (socket close / request timeout) to the decoded stream.
  if (abortContext?.signal) {
    const onAbort = () => { if (!decoded.destroyed) decoded.destroy() }
    if (abortContext.signal.aborted) onAbort()
    else abortContext.signal.addEventListener('abort', onAbort, { once: true })
  }

  // Mode selection on the real (decompressed) size — see chooseStreamMode.
  if (chooseStreamMode(res.headers, gzip, opts) === 'buffered') {
    // Small payload: collect and parse here, returning the same shape as the buffered `search()`. ES is
    // identity-encoded (see above) so `decoded === body`.
    const esResponse: any = await collectResponse(decoded)
    // belt-and-suspenders, mirroring search(): with allow_partial_search_results=false ES errors on
    // timeout, but surface a stray timed_out response as the same 504 rather than a silent partial.
    if (esResponse.timed_out) throw httpError(tooLongError.status, tooLongError.message)
    esResponse.contentLength = Number(res.headers?.['content-length'])
    return { mode: 'buffered', esResponse }
  }

  return { mode: 'streamed', source: await streamToSource(decoded) }
}
