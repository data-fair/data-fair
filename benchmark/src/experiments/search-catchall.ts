import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// On the wide-text preset, contrast a `q` query spread over every per-column
// analyzed field against the constant-size `_search` catch-all pair. Both field
// sets exist in the same index mapping, so this isolates the parse/execute cost
// of the wide `fields` array. Run with the ES default track_total_hits (10000),
// which keeps block-max-WAND enabled for both variants.

const QUERY = 'analyse population'

/** Every per-column analyzed field of the wide-text preset (`<col>.text`, `<col>.text_standard`). */
function perColumnFields (ctx: SchemaContext): string[] {
  const fields: string[] = []
  for (const key of ctx.fullTextFields) fields.push(`${key}.text`, `${key}.text_standard`)
  return fields
}

export const searchCatchallExperiments: Experiment[] = [{
  name: 'search-catchall:wide-q',
  description: 'q over all per-column analyzed fields vs the _search catch-all pair',
  preset: 'wide-text',
  baseline: {
    name: 'per-column',
    description: 'simple_query_string over every per-column analyzed field',
    body: ctx => ({
      query: { simple_query_string: { query: QUERY, fields: perColumnFields(ctx) } },
      size: 20
    })
  },
  variants: [{
    name: 'search-field',
    description: 'simple_query_string over [_search, _search.text_standard]',
    body: () => ({
      query: { simple_query_string: { query: QUERY, fields: ['_search', '_search.text_standard'] } },
      size: 20
    })
  }]
}]
