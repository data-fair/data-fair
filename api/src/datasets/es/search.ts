import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { aliasName, prepareQuery } from './commons.ts'
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
    // TODO: move this to prepareResultItems
    if (hit._source && hit._source._attachment_url) {
      if (config.oldPublicUrl) hit._source._attachment_url = hit._source._attachment_url.replace(config.oldPublicUrl, config.publicUrl)
      if (publicBaseUrl) hit._source._attachment_url = hit._source._attachment_url.replace(config.publicUrl, publicBaseUrl)
      if (dataset.isVirtual) {
        // use string manipulation instead of new URL() for performance
        const attachIdx = hit._source._attachment_url.indexOf('/data-fair/api/v1/datasets/')
        if (attachIdx !== -1) {
          const afterPrefix = hit._source._attachment_url.substring(attachIdx + '/data-fair/api/v1/datasets/'.length)
          const slashIdx = afterPrefix.indexOf('/')
          if (slashIdx !== -1) {
            const childDatasetId = afterPrefix.substring(0, slashIdx)
            hit._source._attachment_url = hit._source._attachment_url.replace(
              `/data-fair/api/v1/datasets/${childDatasetId}/attachments/`,
              `/data-fair/api/v1/datasets/${dataset.id}/attachments/${childDatasetId}/`
            )
          }
        }
      }
    }
    if (hit.fields?._vt?.[0]) {
      hit._source._vt = hit.fields?._vt?.[0]?.pbf
    }
  }

  return esResponse
}
