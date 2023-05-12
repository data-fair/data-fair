const { aliasName, prepareQuery } = require('./commons')

module.exports = async (client, dataset, query) => {
  const esQuery = prepareQuery(dataset, query)
  console.log(aliasName(dataset))
  const esResponse = await client.count({ index: aliasName(dataset), body: { query: esQuery.query } })
  return esResponse.body.count
}
