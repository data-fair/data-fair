const createError = require('http-errors')
const { prepareQuery, aliasName } = require('./commons.js')

module.exports = async (client, dataset, fieldKey, query) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw createError(400, `field "${fieldKey}" is unknown`)
  const q = query.q
  delete query.q
  delete query.sort
  const esQuery = prepareQuery(dataset, query)
  if (esQuery.size > 1000) throw createError(400, '"size" cannot be more than 1000')
  // qs queries become strict filters
  esQuery.query.bool.filter = esQuery.query.bool.filter.concat(esQuery.query.bool.must)
  esQuery.query.bool.must = []
  const size = esQuery.size
  esQuery.size = 0
  esQuery.aggs = {
    values: {
      terms: {
        field: fieldKey,
        size,
        order: {
          // alphabetical order by default
          _key: 'asc'
        }
      }
    }
  }

  if (q) {
    // q is used to filter exclusively the aggregated field
    esQuery.query.bool.must.push({
      simple_query_string: {
        query: q,
        fields: [`${fieldKey}`, `${fieldKey}.text`, `${fieldKey}.text_standard`],
        analyze_wildcard: true,
        lenient: true,
        default_operator: 'and'
      }
    })
    // top hit relevance order in case of a filter
    esQuery.aggs.values.terms.order = [{ max_score: 'desc' }, { _count: 'desc' }, { _key: 'asc' }]
    esQuery.aggs.values.aggs = {
      max_score: {
        max: {
          script: '_score'
        }
      }
    }
  }
  if (q) query.sort = '_key'
  // Bound complexity with a timeout
  const esResponse = (await client.search({ index: aliasName(dataset), body: esQuery, timeout: '2s' })).body
  return esResponse.aggregations.values.buckets.map(b => b.key_as_string || b.key)
}
