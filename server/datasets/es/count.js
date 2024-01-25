const { aliasName, prepareQuery } = require('./commons')

module.exports = async (client, dataset, query) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await client.count({ index: aliasName(dataset), body: { query: esQuery.query } })
  return esResponse.body.count
}
