import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// Compares applying minimum_should_match on the constant-size `_search` pair vs on the
// full 80-field per-column list. Semantically simple_query_string disjoins each term across
// all fields, then msm counts terms — so the match set should be the same. Scoring differs
// (merged vs dis_max) and the per-column scorer has to coordinate 80 sub-iterators vs 2.
// Inv 4 already showed msm makes _search slower with no result change on this vocabulary;
// the question here is whether the split surface amplifies that cost.

const QUERY = 'analyse population transport énergie commune'

function perColumnFields (ctx: SchemaContext): string[] {
  const fields: string[] = []
  for (const key of ctx.fullTextFields) fields.push(`${key}.text`, `${key}.text_standard`)
  return fields
}

function body (fields: string[] | ((ctx: SchemaContext) => string[]), msm?: string) {
  return (ctx: SchemaContext) => {
    const clause: Record<string, any> = {
      query: QUERY,
      fields: typeof fields === 'function' ? fields(ctx) : fields,
      default_operator: 'or'
    }
    if (msm) clause.minimum_should_match = msm
    return { query: { simple_query_string: clause }, size: 20, track_total_hits: 1_000_000 }
  }
}

const SEARCH_FIELDS = ['_search', '_search.text_standard']

export const msmSearchVsSplitExperiments: Experiment[] = [{
  name: 'msm-search-vs-split:wide-q',
  description: 'minimum_should_match on the _search pair vs on the 80 per-column fields',
  preset: 'wide-text',
  baseline: { name: 'split-none', description: 'per-column (80 fields), no msm — closest to today\'s non-catch-all default', body: body(perColumnFields) },
  variants: [
    { name: 'search-none', description: '_search pair, no msm', body: body(SEARCH_FIELDS) },
    { name: 'search-msm-3', description: '_search pair, msm=3', body: body(SEARCH_FIELDS, '3') },
    { name: 'search-msm-5', description: '_search pair, msm=5 (all terms)', body: body(SEARCH_FIELDS, '5') },
    { name: 'split-msm-3', description: 'per-column (80 fields), msm=3', body: body(perColumnFields, '3') },
    { name: 'split-msm-5', description: 'per-column (80 fields), msm=5', body: body(perColumnFields, '5') }
  ]
}]
