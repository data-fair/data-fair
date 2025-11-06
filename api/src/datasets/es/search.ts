import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { aliasName, prepareQuery } from './commons.js'
import { type Client } from '@elastic/elasticsearch'
import eventsLog from '@data-fair/lib-express/events-log.js'

export default async (client: Client, dataset, query, publicBaseUrl, vtXYZ) => {
  const esQuery = prepareQuery(dataset, query)

  if (query.collapse) {
    // Select fields to return
    const collapseField = dataset.schema.find(f => f.key === query.collapse)
    if (!collapseField) {
      throw httpError(400, `Impossible d'utiliser "collapse" sur le champ ${query.collapse}, il n'existe pas dans le jeu de données.`)
    }
    if (collapseField.separator) {
      // throw httpError(400, `Impossible d'utiliser "collapse" sur le champ ${query.collapse}, il est multivalué.`)
      eventsLog.warn('collapse_multi_valued', `query parameter collapse was used on a multi-valued property ${query.collapse} on dataset ${dataset.slug} (${dataset.id}), this can cause breakage`, { account: dataset.owner })
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

  const res = await client.transport.request({
    method: 'POST',
    path: `/${aliasName(dataset)}/_search`,
    body: esQuery,
    querystring: {
      allow_partial_search_results: 'true',
      timeout: config.elasticsearch.searchTimeout
    }
  }, { meta: true })
  const esResponse = res.body
  esResponse.contentLength = Number(res.headers['content-length'])

  for (const hit of esResponse.hits.hits) {
    // TODO: move this to prepareResultItems
    if (hit._source && hit._source._attachment_url) {
      if (config.oldPublicUrl) hit._source._attachment_url = hit._source._attachment_url.replace(config.oldPublicUrl, config.publicUrl)
      if (publicBaseUrl) hit._source._attachment_url = hit._source._attachment_url.replace(config.publicUrl, publicBaseUrl)
      if (dataset.isVirtual) {
        const url = new URL(hit._source._attachment_url)
        const childDatasetId = url.pathname.split('/')[5]
        url.pathname = url.pathname.replace(`/data-fair/api/v1/datasets/${childDatasetId}/attachments/`, `/data-fair/api/v1/datasets/${dataset.id}/attachments/${childDatasetId}/`)
        hit._source._attachment_url = url.href
      }
    }
    if (hit.fields?._vt?.[0]) {
      hit._source._vt = hit.fields?._vt?.[0]?.pbf
    }
  }

  return esResponse
}
