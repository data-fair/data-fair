import type { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type Client } from '@elastic/elasticsearch'
import { aliasName, prepareQuery } from './commons.ts'
import { tooLongError } from './operations.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import { streamToSource } from './hits-stream.ts'
import type { LinesSource } from '../routes/lines-source.ts'

export { streamToSource }

// Mirror the buffered `search` request but with `asStream: true`, returning a streamed `LinesSource` — the
// hits are parsed incrementally by the splitter so the raw ES response is never held whole. The pipeline
// then serializes rows on the fly and `res.send`s the assembled body, so streaming the source costs no
// observable behavior (same Link/ETag/next). Same `prepareQuery`, same querystring
// (`allow_partial_search_results:'false'` + `timeout`), same abort/timeout accounting. Under `asStream` the
// client hands back the response body as a Node stream and does NOT auto-decompress, so we gunzip when the
// response is gzip-encoded (we let the client negotiate encoding exactly like the buffered path).
// Vector-tile (`vtXYZ`) requests are a hard/collect format and never use this path, so their script_fields
// shaping is intentionally omitted here.
export async function searchStream (client: Client, dataset: any, query: any, abortContext?: EsAbortContext): Promise<LinesSource> {
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

  return streamToSource(decoded)
}
