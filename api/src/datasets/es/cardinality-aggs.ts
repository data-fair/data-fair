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

export const filterByContextualCardinality = async (dataset: any, schema: any[], reqQuery: Record<string, any>, maxCardinality: number, abortContext?: EsAbortContext) => {
  const eligible = schema.filter(cardinalityEligible)
  // filtering lines can only lower the number of distinct values: a field whose stored
  // whole-dataset cardinality already passes the threshold passes in any context, it needs no agg
  const passing = new Set(eligible.filter(storedCardinalityPasses(maxCardinality)).map((prop: any) => prop.key))
  const candidates = eligible.filter((prop: any) => !passing.has(prop.key))
  const query = { ...reqQuery }
  // display/pagination params of the schema read are meaningless here, and a stray "sort"
  // or an unknown "select" field would make prepareQuery throw for nothing
  for (const key of ['sort', 'select', 'highlight', 'thumbnail', 'size', 'page', 'after']) delete query[key]
  // built even when no agg is needed, so that invalid data filters are rejected consistently
  const esQuery: any = prepareQuery(dataset, query)
  if (!candidates.length) return eligible
  esQuery.size = 0
  esQuery.track_total_hits = false
  delete esQuery._source
  delete esQuery.sort
  esQuery.aggs = Object.fromEntries(candidates.map((prop: any) => [prop.key, { cardinality: { field: prop.key, precision_threshold: precisionThreshold } }]))
  const esResponse: any = await timedEsCall(abortContext, () => es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  return eligible.filter((prop: any) => {
    if (passing.has(prop.key)) return true
    const cardinality = esResponse.aggregations?.[prop.key]?.value
    return cardinality != null && cardinality <= maxCardinality
  })
}
