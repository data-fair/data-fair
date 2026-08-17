import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// Can a page-1 `q` request keep a trustworthy total without paying for scored
// full-match enumeration? Today one request both ranks (top-20) and counts
// exactly (track_total_hits: true), which disables block-max-WAND. The candidate
// design splits it in two: a WAND-optimized hits leg plus a non-scored count leg
// — either an exact count in filter context, or a random_sampler estimate.
// Variants measure each leg in isolation; the split's total cost is the sum of
// the hits leg and one count leg (an _msearch would run them in one round trip).

const TERMS = 'analyse population transport'

/** Analyzed `.text` sub-field of the first full-text column — data-fair full-text
 *  content lives in the analyzed sub-fields, not the bare keyword main field. */
const ft = (ctx: SchemaContext): string => `${ctx.fullTextFields[0]}.text`

/** random_sampler requires at least one sub-aggregation; a max on the `_i` line
 *  number is the cheapest no-op (doc-values read, no buckets). The runner picks
 *  up the `sample` agg's doc_count and extrapolates it into hits.total. */
const samplerAgg = (probability: number) => ({
  sample: {
    random_sampler: { probability, seed: 42 },
    aggs: { noop: { max: { field: '_i' } } }
  }
})

function countSplitExperiment (
  name: string,
  description: string,
  query: (ctx: SchemaContext) => Record<string, any>
): Experiment {
  const filtered = (ctx: SchemaContext) => ({ bool: { filter: [query(ctx)] } })
  return {
    name: `count-split:${name}`,
    description,
    preset: 'tall',
    baseline: {
      name: 'scored-exact',
      description: 'today: one scored request with exact count (WAND disabled)',
      body: ctx => ({ query: query(ctx), size: 20, track_total_hits: true })
    },
    variants: [
      {
        name: 'wand-hits',
        description: 'hits leg: scored top-20, no count (WAND enabled)',
        body: ctx => ({ query: query(ctx), size: 20, track_total_hits: false })
      },
      {
        name: 'capped-hits',
        description: 'hits leg: scored top-20, exact count up to 10k (hybrid design: count leg fires only past the cap)',
        body: ctx => ({ query: query(ctx), size: 20, track_total_hits: 10_000 })
      },
      {
        name: 'filter-count',
        description: 'count leg: exact count in filter context, no scoring, no hits',
        body: ctx => ({ query: filtered(ctx), size: 0, track_total_hits: true })
      },
      {
        name: 'sampler-1pct',
        description: 'count leg: random_sampler estimate at probability 0.01',
        body: ctx => ({ query: filtered(ctx), size: 0, track_total_hits: false, aggs: samplerAgg(0.01) })
      },
      {
        name: 'sampler-01pct',
        description: 'count leg: random_sampler estimate at probability 0.001',
        body: ctx => ({ query: filtered(ctx), size: 0, track_total_hits: false, aggs: samplerAgg(0.001) })
      },
      {
        // ES 7.x-compatible sampling: random_sampler needs ES ≥ 8.2, but every
        // data-fair line carries `_rand`, a uniform integer in [0, 1_000_000)
        // assigned at index time. An indexed (BKD) range filter over _rand selects
        // a stable 1% random sample and leapfrogs the main query's iterator.
        name: 'rand-count-1pct',
        description: 'count leg: exact count within `_rand < 10000` (1% sample), extrapolated ×100 — works on ES 7.x',
        samplerProbability: 0.01,
        body: ctx => ({
          query: { bool: { filter: [query(ctx), { range: { _rand: { lt: 10_000 } } }] } },
          size: 0,
          track_total_hits: true
        })
      }
    ]
  }
}

export const countSplitExperiments: Experiment[] = [
  countSplitExperiment('disjunction',
    'split hits/count for a heavy scoring multi-term disjunction (the multi-term `q` shape)',
    ctx => ({ simple_query_string: { query: TERMS, fields: [ft(ctx)], default_operator: 'or' } })),
  countSplitExperiment('common-term',
    'split hits/count for a single common term (the "simple text query, huge match set" shape)',
    ctx => ({ match: { [ft(ctx)]: 'population' } }))
]
