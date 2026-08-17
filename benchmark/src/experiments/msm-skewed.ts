import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// Inv 4 / E4 used a uniformly-distributed analyzed vocabulary, so msm couldn't drop
// matches and was a pure cost. This experiment constructs a query with genuine
// distribution skew by mixing one analyzed term with 5 keyword-category values:
//   "analyse cat-alpha cat-beta cat-gamma cat-delta cat-epsilon"
// "analyse" hits ~every doc via `_search`. Each cat-X hits ~65 % of docs via the 10
// keyword columns (each column independently picks one of 10 categories). So higher msm
// thresholds genuinely filter out docs. The question: when msm actually drops matches,
// does the saved enumeration outweigh the N-of-M scorer's bookkeeping?

const QUERY = 'analyse cat-alpha cat-beta cat-gamma cat-delta cat-epsilon'

function body (msm?: string) {
  return (ctx: SchemaContext) => {
    const clause: Record<string, any> = {
      query: QUERY,
      fields: ['_search', '_search.text_standard', ...ctx.keywordFields],
      default_operator: 'or'
    }
    if (msm) clause.minimum_should_match = msm
    return { query: { simple_query_string: clause }, size: 20, track_total_hits: 1_000_000 }
  }
}

export const msmSkewedExperiments: Experiment[] = [{
  name: 'msm-skewed:wide-q',
  description: 'minimum_should_match on a query with genuine match-set skew (1 common term + 5 keyword categories over 10 kw fields)',
  preset: 'wide-text',
  baseline: { name: 'none', description: 'no msm (ES default: 1 of 6)', body: body() },
  variants: [
    { name: 'msm-2', description: 'msm=2', body: body('2') },
    { name: 'msm-3', description: 'msm=3', body: body('3') },
    { name: 'msm-4', description: 'msm=4', body: body('4') },
    { name: 'msm-5', description: 'msm=5', body: body('5') },
    { name: 'msm-6', description: 'msm=6 (all terms required)', body: body('6') }
  ]
}]
