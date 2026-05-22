import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// Block-max-WAND speeds up top-k retrieval of SCORING queries by skipping
// non-competitive blocks. `track_total_hits: true` forces an exact count, which
// requires visiting every match and so DISABLES WAND. These experiments contrast
// scoring shapes (where capping track_total_hits re-enables WAND) against a
// filter-only shape (where WAND never applied). All run with size: 20 so real
// top-k retrieval happens — WAND has nothing to skip at size: 0.

const TERMS = 'analyse population transport'

/** First full-text column of the `tall` preset. */
const ft = (ctx: SchemaContext): string => ctx.fullTextFields[0]

function tthExperiment (
  name: string,
  description: string,
  query: (ctx: SchemaContext) => Record<string, any>
): Experiment {
  const body = (trackTotalHits: boolean | number) => (ctx: SchemaContext) => ({
    query: query(ctx),
    size: 20,
    track_total_hits: trackTotalHits
  })
  return {
    name: `track-total-hits:${name}`,
    description,
    preset: 'tall',
    baseline: { name: 'exact', description: 'track_total_hits: true (disables block-max-WAND)', body: body(true) },
    variants: [
      { name: 'cap-10k', description: 'track_total_hits: 10000', body: body(10_000) },
      { name: 'cap-100k', description: 'track_total_hits: 100000', body: body(100_000) },
      { name: 'disabled', description: 'track_total_hits: false', body: body(false) }
    ]
  }
}

export const trackTotalHitsExperiments: Experiment[] = [
  tthExperiment('disjunction',
    'scoring multi-term disjunction (simple_query_string, OR) — WAND should help most',
    ctx => ({ simple_query_string: { query: TERMS, fields: [ft(ctx)], default_operator: 'or' } })),
  tthExperiment('conjunction',
    'scoring conjunction (simple_query_string, AND)',
    ctx => ({ simple_query_string: { query: TERMS, fields: [ft(ctx)], default_operator: 'and' } })),
  tthExperiment('term-scoring',
    'single scored term in query context (match)',
    ctx => ({ match: { [ft(ctx)]: 'population' } })),
  tthExperiment('filter-only',
    'same predicate in a non-scoring filter context — WAND does not apply',
    ctx => ({ bool: { filter: [{ match: { [ft(ctx)]: 'population' } }] } }))
]
