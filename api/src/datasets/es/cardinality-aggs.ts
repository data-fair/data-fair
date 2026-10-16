// Contextual cardinality filtering for the schema read route.
// The stored `x-cardinality` of a field counts distinct values in the whole dataset (computed
// once at finalize time, cf workers/short-processor/finalize.ts). When the schema is read with
// `maxCardinality` AND at least one data filter, the meaningful number is instead the number of
// distinct values among the filtered lines: one ES search carries a cardinality sub-agg per
// candidate field, and the fields whose contextual cardinality exceeds the threshold are dropped.
// The response keeps exposing the stored `x-cardinality`, only the filtering is contextual.

import config from '#config'
import es from '#es'
import { aliasName, prepareQuery } from './commons.ts'
import { timedEsCall, type EsAbortContext } from './abort.ts'
import { hasUniqueValues, UNIQUE_VALUES_PRECISION_THRESHOLD } from './operations.ts'

// same eligibility rules as the finalize worker when it computes the stored `x-cardinality`,
// so that the contextual filter never keeps more fields than the stored filter would
export const cardinalityEligible = (prop: any) => {
  if (prop['x-calculated']) return false
  if (['https://purl.org/geojson/vocab#geometry', 'http://schema.org/latitude', 'http://schema.org/longitude'].includes(prop['x-refersTo'])) return false
  if (prop['x-capabilities'] && prop['x-capabilities'].values === false) return false
  return true
}

const storedCardinalityPasses = (maxCardinality: number) => (prop: any) =>
  typeof prop['x-cardinality'] === 'number' && prop['x-cardinality'] <= maxCardinality

// same precision threshold as the finalize worker, so that contextual values stay comparable
// to the stored `x-cardinality` exposed in the response (exact below the threshold)
const precisionThreshold = 3000

const prepareCardinalityQuery = (dataset: any, reqQuery: Record<string, any>) => {
  const query = { ...reqQuery }
  // display/pagination params of the schema read are meaningless here, and a stray "sort"
  // or an unknown "select" field would make prepareQuery throw for nothing
  for (const key of ['sort', 'select', 'highlight', 'thumbnail', 'size', 'page', 'after']) delete query[key]
  const esQuery: any = prepareQuery(dataset, query)
  esQuery.size = 0
  delete esQuery._source
  delete esQuery.sort
  return esQuery
}

const cardinalityAggs = (props: any[], precisionThreshold: number) =>
  Object.fromEntries(props.map((prop: any) => [prop.key, { cardinality: { field: prop.key, precision_threshold: precisionThreshold } }]))

const runCardinalityQuery = (dataset: any, esQuery: any, abortContext?: EsAbortContext): Promise<any> =>
  timedEsCall(abortContext, () => es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))

export const filterByContextualCardinality = async (dataset: any, schema: any[], reqQuery: Record<string, any>, maxCardinality: number, abortContext?: EsAbortContext) => {
  const eligible = schema.filter(cardinalityEligible)
  // filtering lines can only lower the number of distinct values: a field whose stored
  // whole-dataset cardinality already passes the threshold passes in any context, it needs no agg
  const passing = new Set(eligible.filter(storedCardinalityPasses(maxCardinality)).map((prop: any) => prop.key))
  const candidates = eligible.filter((prop: any) => !passing.has(prop.key))
  // built even when no agg is needed, so that invalid data filters are rejected consistently
  const esQuery = prepareCardinalityQuery(dataset, reqQuery)
  if (!candidates.length) return eligible
  esQuery.track_total_hits = false
  esQuery.aggs = cardinalityAggs(candidates, precisionThreshold)
  const esResponse = await runCardinalityQuery(dataset, esQuery, abortContext)
  return eligible.filter((prop: any) => {
    if (passing.has(prop.key)) return true
    const cardinality = esResponse.aggregations?.[prop.key]?.value
    return cardinality != null && cardinality <= maxCardinality
  })
}

// below this ratio of the number of lines, the stored whole-dataset cardinality (estimated with a
// lower precision) is far enough from the count to rule a column out without an agg
const storedCardinalityMargin = 0.9

// Keep the fields that hold a distinct value on every line matching the data filters of the query
// (all lines without filters): candidates for a natural key, e.g. to join or to sync a line
// selection between applications. One ES search counts the lines, and for each candidate field
// the lines with a value (exact at any size, so that an empty line always disqualifies) and the
// distinct values (cf hasUniqueValues for the comparison and its tolerance on large sets).
export const filterByUniqueValues = async (dataset: any, schema: any[], reqQuery: Record<string, any>, filtered: boolean, abortContext?: EsAbortContext) => {
  const candidates = schema
    .filter(cardinalityEligible)
    .filter((prop: any) => !prop.separator)
    // without filters the lines are those of the stored cardinality, a column clearly below the
    // count has duplicates or empty values; a filtered context can still make it unique
    .filter((prop: any) => filtered || typeof prop['x-cardinality'] !== 'number' || prop['x-cardinality'] >= (dataset.count ?? 0) * storedCardinalityMargin)
  const esQuery = prepareCardinalityQuery(dataset, reqQuery)
  if (!candidates.length) return []
  esQuery.track_total_hits = true
  // aggs named by position, a legacy column key could collide with any key-derived name
  esQuery.aggs = {}
  candidates.forEach((prop: any, i: number) => {
    esQuery.aggs['card_' + i] = { cardinality: { field: prop.key, precision_threshold: UNIQUE_VALUES_PRECISION_THRESHOLD } }
    // multi-valued fields are excluded above, so the number of values is the number of lines with a value
    esQuery.aggs['count_' + i] = { value_count: { field: prop.key } }
  })
  const esResponse = await runCardinalityQuery(dataset, esQuery, abortContext)
  const nbLines = esResponse.hits.total.value
  return candidates.filter((prop: any, i: number) => {
    if (esResponse.aggregations?.['count_' + i]?.value !== nbLines) return false
    const cardinality = esResponse.aggregations?.['card_' + i]?.value
    return cardinality != null && hasUniqueValues(cardinality, nbLines)
  })
}
