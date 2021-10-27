const config = require('config')
const { aliasName, prepareQuery } = require('./commons')

module.exports = async (client, dataset, query, publicBaseUrl) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = (await client.search({ index: aliasName(dataset), body: esQuery })).body

  esResponse.hits.hits.forEach(hit => {
    if (hit._source && hit._source._attachment_url) {
      if (config.oldPublicUrl) hit._source._attachment_url = hit._source._attachment_url.replace(config.oldPublicUrl, config.publicUrl)
      if (publicBaseUrl) hit._source._attachment_url = hit._source._attachment_url.replace(config.publicUrl, publicBaseUrl)
    }
  })

  return esResponse
}
