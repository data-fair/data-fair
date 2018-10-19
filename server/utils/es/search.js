const { aliasName, prepareQuery } = require('./commons')

module.exports = async (client, dataset, query) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await client.search({ index: aliasName(dataset), body: esQuery })
  return esResponse
}
