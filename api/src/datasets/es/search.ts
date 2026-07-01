import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { aliasName, prepareQuery, rewriteAttachmentUrl } from './commons.ts'
import { tooLongError } from './operations.ts'
import { type Client } from '@elastic/elasticsearch'
import { type EsAbortContext, timedEsCall } from './abort.ts'

export default async (client: Client, dataset, query, publicBaseUrl?, vtXYZ?, abortContext?: EsAbortContext) => {
  const esQuery = prepareQuery(dataset, query)

  if (query.collapse) {
    // Select fields to return
    const collapseField = dataset.schema.find(f => f.key === query.collapse)
    if (!collapseField) {
      throw httpError(400, `Impossible d'utiliser "collapse" sur le champ ${query.collapse}, il n'existe pas dans le jeu de données.`)
    }
    if (collapseField.separator) {
      throw httpError(400, `Impossible d'utiliser "collapse" sur le champ ${query.collapse}, il est multivalué.`)
    }
    esQuery.collapse = { field: query.collapse }
    // number after which we accept that cardinality is approximative
    const precisionThreshold = Number(query.precision_threshold ?? '40000')
    esQuery.aggs = { totalCollapse: { cardinality: { field: query.collapse, precision_threshold: precisionThreshold } } }
  }

  if (vtXYZ) {
    esQuery.script_fields = {
      _vt: {
        script: {
          lang: 'painless',
          source: `params['_source']['_vt_prepared'].find(p -> p.xyz == "${vtXYZ}")`
        }
      }
    }
  }

  const res = await timedEsCall(abortContext, () => client.transport.request({
    method: 'POST',
    path: `/${aliasName(dataset)}/_search`,
    body: esQuery,
    querystring: {
      // never return truncated results: when the `timeout` parameter (config.elasticsearch.searchTimeout)
      // elapses ES fails the request ("Time exceeded" -> 504) rather than returning partial hits
      allow_partial_search_results: 'false',
      timeout: config.elasticsearch.searchTimeout
    }
  }, { ...abortContext, meta: true }))
  const esResponse: any = res.body
  // belt-and-suspenders: with allow_partial_search_results=false ES errors on timeout, but if a
  // timed_out response ever slips through, surface it as the same 504 rather than a silent partial
  if (esResponse.timed_out) throw httpError(tooLongError.status, tooLongError.message)
  esResponse.contentLength = Number(res.headers['content-length'])

  for (const hit of esResponse.hits.hits) {
    if (hit._source && hit._source._attachment_url) {
      hit._source._attachment_url = rewriteAttachmentUrl(hit._source._attachment_url, dataset, publicBaseUrl)
    }
    if (hit.fields?._vt?.[0]) {
      hit._source._vt = hit.fields?._vt?.[0]?.pbf
    }
  }

  return esResponse
}
