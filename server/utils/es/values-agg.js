const createError = require('http-errors')
const { parseSort, parseOrder, prepareQuery, aliasName, prepareResultItem } = require('./commons.js')

module.exports = async (client, dataset, query, addGeoData) => {
  const fields = dataset.schema.map(f => f.key)
  // nested grouping by a serie of fields
  if (!query.field) throw createError(400, 'La paramètre "field" est obligatoire')
  const valuesFields = query.field.split(';')
  // matching properties from the schema
  const props = valuesFields.map(f => dataset.schema.find(p => p.key === f))
  // sorting for each level
  const sorts = query.sort ? query.sort.split(';') : []
  // interval for each level
  const intervals = query.interval ? query.interval.split(';') : []
  // number of agg results for each level
  const aggSizes = query.agg_size ? query.agg_size.split(';').map(s => Number(s)) : []
  const aggTypes = []
  for (let i = 0; i < valuesFields.length; i++) {
    if (!props[i]) throw createError(400, `Le paramètre "field" référence un champ inconnu ${valuesFields[i]}`)

    intervals[i] = intervals[i] || 'value' // default is to group by strict value (simple terms aggregation)
    aggTypes[i] = 'terms'
    if (intervals[i] !== 'value') {
      if (props[i].type === 'string' && props[i].format && props[i].format.startsWith('date')) {
        aggTypes[i] = 'date_histogram'
      } else if (['number', 'integer'].includes(props[i].type)) {
        aggTypes[i] = 'histogram'
        intervals[i] = Number(intervals[i])
      } else {
        throw createError(400, `Grouper pas interval est seulement compatible avec les nombres et dates. ${props[i].key} n'est pas du bon type.`)
      }
    }

    if (aggSizes[i] === undefined) aggSizes[i] = 20
    if (aggSizes[i] > 1000) throw createError(400, '"agg_size" cannot be more than 1000')
    if (sorts[i] === valuesFields[i]) sorts[i] = '_key'
    if (sorts[i] === '-' + valuesFields[i]) sorts[i] = '-_key'
    if (sorts[i] === 'key') sorts[i] = '_key'
    if (sorts[i] === '-key') sorts[i] = '-_key'
    if (sorts[i] === 'count') sorts[i] = '_count'
    if (sorts[i] === '-count') sorts[i] = '-_count'
    if (aggTypes[i] === 'date_histogram') {
      sorts[i] = sorts[i] || '_time'
      sorts[i] = sorts[i].replace('_key', '_time')
    }
    // TODO: also accept ranges expressed in the interval parameter to use range aggregations instead of histogram
  }
  // number after which we accept that cardinality is approximative
  const precisionThreshold = Number(query.precision_threshold || '40000')

  // number of hit results inside the last level of aggregation
  const size = query.size ? Number(query.size) : 0
  if (size > 100) throw createError(400, '"size" cannot be more than 100')

  // Get a ES query to filter the aggregation results
  delete query.sort
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  let currentAggLevel = esQuery.aggs = {}
  for (let i = 0; i < valuesFields.length; i++) {
    currentAggLevel.values = {
      [aggTypes[i]]: {
        field: valuesFields[i],
        size: aggSizes[i],
      },
    }
    if (intervals[i] !== 'value') {
      currentAggLevel.values[aggTypes[i]].interval = intervals[i]
      delete currentAggLevel.values[aggTypes[i]].size
    }

    // cardinality is meaningful only on the strict values aggregation
    if (aggTypes[i] === 'terms') {
      currentAggLevel.card = {
        cardinality: {
          field: valuesFields[i],
          precision_threshold: precisionThreshold,
        },
      }
    }

    // manage sorting
    currentAggLevel.values[aggTypes[i]].order = parseOrder(sorts[i], fields, dataset.schema)
    if (query.metric && query.metric_field) {
      if (!fields.includes(query.metric_field)) {
        throw createError(400, `Impossible d'agréger sur le champ ${query.metric_field}, il n'existe pas dans le jeu de données.`)
      }

      currentAggLevel.values[aggTypes[i]].order.push({ metric: 'desc' })
      currentAggLevel.values.aggs = {}
      currentAggLevel.values.aggs.metric = {
        [query.metric]: { field: query.metric_field },
      }
    }
    currentAggLevel.values[aggTypes[i]].order.push({ _count: 'desc' })

    // Prepare next nested level
    if (valuesFields[i + 1] || addGeoData) {
      currentAggLevel.values.aggs = currentAggLevel.values.aggs || {}
      // Add centroid and bounding box children aggs if requested
      if (addGeoData) {
        currentAggLevel.values.aggs.centroid = { geo_centroid: { field: '_geopoint' } }
        currentAggLevel.values.aggs.bbox = { geo_bounds: { field: '_geocorners' } }
      }
      currentAggLevel = currentAggLevel.values.aggs
    }
  }

  // Only include hits in the last aggregation level
  if (size) {
    currentAggLevel.values.aggs = currentAggLevel.values.aggs || {}
    // the sort instruction after sort for aggregation results is used to sort inner hits
    const hitsSort = parseSort(sorts[valuesFields.length], fields, dataset.schema)
    // Also implicitly sort by score
    hitsSort.push('_score')
    // And lastly random order for natural distribution (mostly important for geo results)
    hitsSort.push('_rand')
    currentAggLevel.values.aggs.topHits = { top_hits: { size, _source: esQuery._source, sort: hitsSort } }
  }
  // Bound complexity with a timeout
  const esResponse = await client.search({ index: aliasName(dataset), body: esQuery, timeout: '2s' })
  return prepareValuesAggResponse(esResponse, valuesFields, dataset, query)
}

const prepareValuesAggResponse = (esResponse, fields, dataset, query) => {
  const response = {
    total: esResponse.hits.total.value,
    took: esResponse.took,
    timed_out: esResponse.timed_out,
  }
  recurseAggResponse(response, esResponse.aggregations, dataset, query)
  return response
}

const recurseAggResponse = (response, aggRes, dataset, query) => {
  if (aggRes.card) response.total_values = aggRes.card.value
  response.total_other = aggRes.values.sum_other_doc_count
  if (aggRes.values.buckets.length > 10000) {
    throw createError(400, 'Résultats d\'aggrégation trop nombreux. Abandon.')
  }
  response.aggs = aggRes.values.buckets.map(b => {
    const aggItem = {
      total: b.doc_count,
      value: b.key_as_string || b.key,
      results: b.topHits ? b.topHits.hits.hits.map(hit => prepareResultItem(hit, dataset, query)) : [],
    }
    if (b.metric) {
      aggItem.metric = b.metric.value
    }
    if (b.values) {
      recurseAggResponse(aggItem, b)
    }
    if (b.centroid) {
      aggItem.centroid = b.centroid.location
    }
    if (b.bbox) {
      const bounds = b.bbox.bounds
      aggItem.bbox = [bounds.top_left.lon, bounds.bottom_right.lat, bounds.bottom_right.lon, bounds.top_left.lat]
    }

    return aggItem
  })
}
