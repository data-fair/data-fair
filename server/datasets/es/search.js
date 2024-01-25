const config = require('config')
const { aliasName, prepareQuery } = require('./commons')

module.exports = async (client, dataset, query, publicBaseUrl) => {
  const esQuery = prepareQuery(dataset, query)

  if (query.collapse) {
    esQuery.collapse = { field: query.collapse }
    // number after which we accept that cardinality is approximative
    const precisionThreshold = Number(query.precision_threshold ?? '40000')
    esQuery.aggs = { totalCollapse: { cardinality: { field: query.collapse, precision_threshold: precisionThreshold } } }
  }

  const esResponse = (await client.search({ index: aliasName(dataset), body: esQuery })).body

  for (const hit of esResponse.hits.hits) {
    // TODO: move this to prepareResultItems
    if (hit._source && hit._source._attachment_url) {
      if (config.oldPublicUrl) hit._source._attachment_url = hit._source._attachment_url.replace(config.oldPublicUrl, config.publicUrl)
      if (publicBaseUrl) hit._source._attachment_url = hit._source._attachment_url.replace(config.publicUrl, publicBaseUrl)
    }
  }

  return esResponse
}
