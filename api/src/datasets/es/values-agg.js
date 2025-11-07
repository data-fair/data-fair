import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { parseSort, prepareQuery, aliasName, prepareResultItem } from './commons.js'
import capabilities from '../../../contract/capabilities.js'
import { assertMetricAccepted } from './metric-agg.js'
import es from '#es'
import eventsLog from '@data-fair/lib-express/events-log.js'

// we used to split by ; but using , is more standard in open api
const splitRetroCompat = (str) => {
  if (!str) return []
  const result = str.split(';')
  if (result.length === 1 && str.includes(',')) return str.split(',')
  return result
}

const parseOrder = (sortStr, fields, dataset, valuesField, hasMetric) => {
  const sort = parseSort(sortStr, fields, dataset)
  const knownKeys = ['_count', '_key', '_time', valuesField]
  if (hasMetric) knownKeys.push('metric')
  return sort.map(s => {
    const key = Object.keys(s)[0]
    if (!knownKeys.includes(key)) throw httpError(400, `Impossible de trier les groupes de la colonne ${valuesField} par ${key.split('.')[0]}`)
    return { [key]: s[key].order }
  })
}

export default async (dataset, query, addGeoData, publicBaseUrl, explain, flatten, allowPartialResults = false, timeout = config.elasticsearch.searchTimeout) => {
  const fields = dataset.schema.map(f => f.key)
  // nested grouping by a serie of fields
  if (!query.field) throw httpError(400, 'Le paramètre "field" est obligatoire')
  const valuesFields = splitRetroCompat(query.field)
  // matching properties from the schema
  const props = valuesFields.map(f => dataset.schema.find(p => p.key === f))
  // sorting for each level
  const sorts = splitRetroCompat(query.sort)
  // management of missing items
  const missings = splitRetroCompat(query.missing)
  // interval for each level
  const intervals = splitRetroCompat(query.interval)
  // number of agg results for each level
  const aggSizes = splitRetroCompat(query.agg_size).map(s => Number(s))
  let combinedMaxSize = 1
  const aggTypes = []
  for (let i = 0; i < valuesFields.length; i++) {
    if (!props[i]) throw httpError(400, `Le paramètre "field" référence un champ inconnu ${valuesFields[i]}`)
    if (props[i]['x-capabilities'] && props[i]['x-capabilities'].values === false) {
      throw httpError(400, `Impossible de grouper sur le champ ${props[i].key}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ.`)
    }
    intervals[i] = intervals[i] || 'value' // default is to group by strict value (simple terms aggregation)
    aggTypes[i] = 'terms'
    if (intervals[i] !== 'value') {
      if (props[i].type === 'string' && props[i].format && props[i].format.startsWith('date')) {
        aggTypes[i] = 'date_histogram'
      } else if (['number', 'integer'].includes(props[i].type)) {
        aggTypes[i] = 'histogram'
        intervals[i] = Number(intervals[i])
      } else {
        throw httpError(400, `Grouper pas interval est seulement compatible avec les nombres et dates. ${props[i].key} n'est pas du bon type.`)
      }
    }

    if (aggSizes[i] === undefined) aggSizes[i] = 20
    if (aggSizes[i] > 1000) throw httpError(400, '"agg_size" cannot be more than 1000')
    combinedMaxSize *= aggSizes[i]
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
  const precisionThreshold = Number(query.precision_threshold ?? '40000')

  // number of hit results inside the last level of aggregation
  const size = query.size ? Number(query.size) : 0
  combinedMaxSize *= size
  // TODO: remove the condition on size and only use combinedMaxSize, but to do this we must check if we break some existing usage
  if (size > 100 && combinedMaxSize > 100000) throw httpError(400, '"size" x "agg_size" cannot be more than 100000')
  if (combinedMaxSize > 100000) {
    eventsLog.warn('values_agg_combined_size', `query values_agg on dataset ${dataset.slug} (${dataset.id}) with a combined max size of ${combinedMaxSize} was received, it will be blocked in an incoming release`, { account: dataset.owner })
  }

  // Get a ES query to filter the aggregation results
  delete query.sort
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  let currentAggLevel = esQuery.aggs = {}
  for (let i = 0; i < valuesFields.length; i++) {
    const valuesField = valuesFields[i]
    const hasMetric = query.metric && query.metric_field
    if (aggSizes[i] !== 0) {
      currentAggLevel.values = {
        [aggTypes[i]]: {
          field: valuesField,
          size: aggSizes[i]
        }
      }
    }
    if (intervals[i] !== 'value') {
      currentAggLevel.values[aggTypes[i]].interval = intervals[i]
      delete currentAggLevel.values[aggTypes[i]].size
    }

    if (aggTypes[i] === 'terms' && missings[i]) {
      const valuesField = dataset.schema.find(p => p.key === valuesFields[i])
      let missing = missings[i]
      if (valuesField?.type === 'number' || valuesField?.type === 'integer') {
        missing = Number(missing)
        if (isNaN(missing)) throw httpError(400, 'missing should be a number')
      }
      if (valuesField?.type === 'boolean') {
        if (!['true', 'false'].includes(missing)) throw httpError(400, 'missing should be a boolean')
        missing = missing === 'true'
      }
      currentAggLevel.values[aggTypes[i]].missing = missing
    }

    // cardinality is meaningful only on the strict values aggregation
    if (aggTypes[i] === 'terms' && precisionThreshold !== 0) {
      currentAggLevel.card = {
        cardinality: {
          field: valuesFields[i],
          precision_threshold: precisionThreshold
        }
      }
    }

    if (currentAggLevel.values) {
      currentAggLevel.values[aggTypes[i]].order = parseOrder(sorts[i], fields, dataset, valuesField, hasMetric)
      if (hasMetric) {
        const metricField = dataset.schema.find(p => p.key === query.metric_field)
        if (!metricField) {
          throw httpError(400, `Impossible de calculer une métrique sur le champ ${query.metric_field}, il n'existe pas dans le jeu de données.`)
        }
        assertMetricAccepted(metricField, query.metric)

        currentAggLevel.values[aggTypes[i]].order.push({ metric: 'desc' })
        currentAggLevel.values.aggs = currentAggLevel.values.aggs ?? {}
        currentAggLevel.values.aggs.metric = {
          [query.metric]: { field: query.metric_field }
        }
      }
      currentAggLevel.values[aggTypes[i]].order.push({ _count: 'desc' })

      if (query.extra_metrics) {
        for (const extraMetric of query.extra_metrics.split(',')) {
          const [field, metric] = extraMetric.split(':')
          const metricField = dataset.schema.find(p => p.key === field)
          if (!metricField) {
            throw httpError(400, `Impossible de calculer une métrique sur le champ ${field}, il n'existe pas dans le jeu de données.`)
          }
          assertMetricAccepted(metricField, metric)
          currentAggLevel.values.aggs = currentAggLevel.values.aggs ?? {}
          currentAggLevel.values.aggs[`extra_metric_${field}_${metric}`] = {
            [metric]: { field }
          }
        }
      }
    }

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
    const hitsSort = parseSort(sorts.slice(valuesFields.length, sorts.length).join(','), fields, dataset)
    // Also implicitly sort by score
    hitsSort.push('_score')
    // And lastly random order for natural distribution (mostly important for geo results)
    hitsSort.push('_rand')
    currentAggLevel.values.aggs.topHits = { top_hits: { size, _source: esQuery._source, sort: hitsSort } }
  }
  // Bound complexity with a timeout
  if (explain) explain.esQuery = esQuery
  const esResponse = await es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout,
    allow_partial_search_results: allowPartialResults
  })
  if (explain) explain.esResponse = esResponse

  const response = { total: esResponse.hits.total.value }
  if (esResponse.timed_out) response.timed_out = true
  recurseAggResponse(response, esResponse.aggregations, dataset, query, publicBaseUrl, flatten)

  if (aggSizes[0] > 0 && response.aggs?.length === aggSizes[0]) {
    const lastValue = response.aggs[response.aggs.length - 1].value
    let operator
    if (sorts[0] === '_key') operator = 'gt'
    if (sorts[0] === '-_key') operator = 'lt'
    if (operator) response.next = { [`${valuesFields[0]}_${operator}`]: lastValue }
  }

  return response
}

const recurseAggResponse = (response, aggRes, dataset, query, publicBaseUrl, flatten) => {
  if (aggRes.card) response.total_values = aggRes.card.value
  if (!aggRes.values) return response
  response.total_other = aggRes.values.sum_other_doc_count
  if (aggRes.values.buckets.length > 10000) {
    throw httpError(400, 'Résultats d\'aggrégation trop nombreux. Abandon.')
  }
  response.aggs = aggRes.values.buckets.map(b => {
    const aggItem = {
      total: b.doc_count,
      value: b.key_as_string || b.key,
      results: b.topHits ? b.topHits.hits.hits.map(hit => prepareResultItem(hit, dataset, query, flatten, publicBaseUrl)) : []
    }
    if (b.metric) {
      aggItem.metric = b.metric.value
    }
    for (const key of Object.keys(b)) {
      if (key.startsWith('extra_metric_')) {
        aggItem[key.replace('extra_metric_', '')] = b[key].value
      }
    }
    if (b.values) {
      recurseAggResponse(aggItem, b, dataset, query, publicBaseUrl, flatten)
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
