import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { prepareQuery, aliasName } from './commons.ts'
import { valuesIncludeClause, parseQMode, DEFAULT_Q_MODE } from './operations.ts'
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

  // `q` and any filter naming THIS column are statements about the values being listed, not about
  // which rows to keep (`q` is scoped to this single column, see the qFields above). On a
  // multi-valued column the two differ — the terms agg emits every value of each matching row —
  // so the buckets are narrowed back to the values actually asked for.
  const include = valuesIncludeClause(field, query, parseQMode(query.q_mode, DEFAULT_Q_MODE))
  if (include) esQuery.aggs.values.terms.include = include

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
