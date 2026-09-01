import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { prepareQuery, aliasName } from './commons.ts'
import { valuesIncludePattern, parseQMode, DEFAULT_Q_MODE } from './operations.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import { type Client } from '@elastic/elasticsearch'

export default async (client: Client, dataset: any, fieldKey: string, query: Record<string, any>, abortContext?: EsAbortContext) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw httpError(400, `field "${fieldKey}" is unknown`)
  const sort = query.sort ?? 'asc'
  delete query.sort
  const esQuery = prepareQuery(dataset, query, [fieldKey], { lenient: true, analyze_wildcard: true }, true)
  if (esQuery.size > 1000) throw httpError(400, '"size" cannot be more than 1000')
  const size = esQuery.size
  esQuery.size = 0
  esQuery.aggs = {
    values: {
      terms: {
        field: fieldKey,
        size,
        order: {
          // alphabetical order by default
          _key: sort
        }
      }
    }
  }

  // `q` here is scoped to this single column (see the qFields above): it is meant to narrow the
  // list of VALUES, not to select rows. On a multi-valued column those differ — the terms agg
  // emits every value of each matching row — so the buckets are narrowed back to the values that
  // match. Left alone on single-valued columns, where document and value are 1:1 and a literal
  // pattern would only lose the analyzed (stemmed) matches.
  const q = (query.q ?? query._c_q)?.trim()
  if (q && field.separator) {
    // complete mode reads `q` as a prefix, unless the column opted into the wildcard capability —
    // its doc-level clause then also matches `*q*`, and the narrowing must not undo that
    const qMode = parseQMode(query.q_mode, DEFAULT_Q_MODE)
    const prefix = qMode === 'complete' && !field['x-capabilities']?.wildcard
    const include = valuesIncludePattern(q, prefix ? 'prefix' : 'contains')
    if (include) esQuery.aggs.values.terms.include = include
  }

  if (query.q) {
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
  // Bound complexity with a timeout
  const esResponse: any = await timedEsCall(abortContext, () => client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  return esResponse.aggregations.values.buckets.map(b => {
    let value = b.key_as_string || b.key
    if (field?.type === 'string' && field.format === 'date') {
      value = value.slice(0, 10)
    }
    return value
  }).map(v => query.stringify === 'true' ? (v + '') : v)
}
