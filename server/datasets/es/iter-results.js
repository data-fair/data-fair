const { prepareQuery, aliasName } = require('./commons')

async function * iterResults (es, dataset, query = { size: 1000 }) {
  const esQuery = prepareQuery(dataset, query)
  const index = aliasName(dataset)

  while (true) {
    const hits = await es.search({ index, body: esQuery }).body.hits.hits
    yield hits
    if (hits.length < query.size) break
    esQuery.search_after = hits[hits.length - 1].sort
  }
}

module.exports = iterResults
