const config = require('config')
const createError = require('http-errors')
const { prepareQuery, aliasName } = require('./commons')

module.exports = async (client, dataset, query) => {
  if (!query.field) throw createError(400, '"field" parameter is required')
  const prop = dataset.schema.find(f => f.key === query.field)
  if (!prop) {
    throw createError(400, `Impossible d'agréger sur le champ ${query.field}, il n'existe pas dans le jeu de données.`)
  }
  if (prop['x-capabilities'] && !prop['x-capabilities'].textAgg) {
    throw createError(400, `Impossible d'agréger sur le champ ${prop.key}, la fonctionnalité n'est pas activée.`)
  }

  const field = query.analysis === 'standard' ? query.field + '.text_standard' : query.field + '.text'
  const size = Number(query.size || 20)
  if (size > 200) throw createError(400, 'Cette aggrégation ne peut pas retourner plus de 200 mots.')
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  delete esQuery._source
  delete esQuery.sort

  const aggType = (query.q || query._c_q || query.qs) ? 'significant_text' : 'terms'

  esQuery.aggs = {
    // signifant_text is costly, and we look for approximative statistics in words-add
    // not for exhaustivity. So using a sample is alright
    sample: {
      sampler: {
        shard_size: 1000
      },
      aggregations: {
        words: {
          [aggType]: { field, size }
        }
      }
    }
  }

  if (aggType === 'signifant_text') {
    esQuery.aggs.sample.aggregations.words.significant_text.filter_duplicate_text = true
  }

  // console.log(esQuery)
  const esResponse = (await client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  })).body

  const buckets = esResponse.aggregations.sample.words.buckets

  const words = await Promise.all(buckets.map(bucket => unstem(client, dataset, field, bucket.key)))

  return {
    total: esResponse.hits.total.value,
    sample: esResponse.aggregations.sample.doc_count,
    results: buckets.map((bucket, i) => ({
      word: words[i],
      total: bucket.doc_count,
      score: bucket.score
    }))
  }
}

// significant_text does not "unstem"
// it is suggested that the highlight logic is the closest there is to satisfying this need
// so we search for the analyzed term in the documents, get highlights and get the most frequest highlighted piece of text
async function unstem (client, dataset, field, key) {
  const res = (await client.search({
    index: aliasName(dataset),
    body: {
      size: 20,
      query: { term: { [field]: key } },
      _source: { excludes: '*' },
      highlight: {
        fields: { [field]: {} },
        fragment_size: 1,
        pre_tags: '<>',
        post_tags: '<>'
      }
    },
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  })).body

  const words = {}
  for (const hit of res.hits.hits) {
    for (let w of hit.highlight[field]) {
      w = w.match(/<>(.*)<>/)[1]
      // lowercase only if full uppercase.
      // this way we keep only meaningful uppercase letters
      if (w.toUpperCase() === w) w = w.toLowerCase()
      words[w] = (words[w] || 0) + 1
    }
  }
  return Object.keys(words).sort((a, b) => words[a] < words[b] ? 1 : -1)[0]
}
