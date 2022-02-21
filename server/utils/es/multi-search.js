const { aliasName, prepareQuery } = require('./commons')

module.exports = async (client, dataset, queries) => {
  const body = []
  for (const query of queries) {
    body.push({ index: aliasName(dataset) })
    body.push(prepareQuery(dataset, query))
  }

  const esResponse = (await client.msearch({ body })).body

  return esResponse
}
