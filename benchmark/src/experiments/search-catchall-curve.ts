import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// Sweeps the per-column `q` cost as the number of queried columns grows from 1 to 40, with
// the constant-size `_search` pair as a single variant for reference. Same dataset, same
// query — the only thing that changes is the `fields` array of the simple_query_string.
// Answers T2 ("always _search"): how steeply does per-column cost grow with width, and is
// `_search` faster even at narrow widths?

const QUERY = 'analyse population'

function perColFields (ctx: SchemaContext, nCols: number): string[] {
  const fields: string[] = []
  for (const key of ctx.fullTextFields.slice(0, nCols)) {
    fields.push(`${key}.text`, `${key}.text_standard`)
  }
  return fields
}

function perColVariant (nCols: number) {
  return {
    name: `per-col-${nCols}`,
    description: `${nCols} columns × 2 sub-fields = ${nCols * 2} fields`,
    body: (ctx: SchemaContext) => ({
      query: { simple_query_string: { query: QUERY, fields: perColFields(ctx, nCols) } },
      size: 20
    })
  }
}

export const searchCatchallCurveExperiments: Experiment[] = [{
  name: 'search-catchall-curve:wide-q',
  description: 'cost curve: per-column q at varying column counts vs the _search pair',
  preset: 'wide-text',
  baseline: perColVariant(40),
  variants: [
    perColVariant(1),
    perColVariant(2),
    perColVariant(4),
    perColVariant(8),
    perColVariant(20),
    {
      name: 'search-field',
      description: 'simple_query_string over [_search, _search.text_standard]',
      body: () => ({
        query: { simple_query_string: { query: QUERY, fields: ['_search', '_search.text_standard'] } },
        size: 20
      })
    }
  ]
}]
