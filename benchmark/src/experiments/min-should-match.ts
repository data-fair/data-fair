import type { Experiment } from '../experiments.ts'

// On the wide-text preset, measure how minimum_should_match on a multi-term q
// affects cost and result-set drift. No track_total_hits override → ES default
// (10000), so block-max-WAND is enabled and interacts with the msm pruning.

const QUERY = 'analyse population transport énergie commune'

function sqs (msm?: string): Record<string, any> {
  const clause: Record<string, any> = {
    query: QUERY,
    fields: ['_search', '_search.text_standard'],
    default_operator: 'or'
  }
  if (msm) clause.minimum_should_match = msm
  return { query: { simple_query_string: clause }, size: 20 }
}

export const minShouldMatchExperiments: Experiment[] = [{
  name: 'min-should-match:wide-q',
  description: 'minimum_should_match on a 5-term q over the _search field',
  preset: 'wide-text',
  baseline: { name: 'none', description: 'no minimum_should_match', body: () => sqs() },
  variants: [
    { name: 'msm-1', description: 'minimum_should_match: "1"', body: () => sqs('1') },
    { name: 'msm-2', description: 'minimum_should_match: "2"', body: () => sqs('2') },
    { name: 'msm-75pct', description: 'minimum_should_match: "75%"', body: () => sqs('75%') },
    { name: 'msm-neg25', description: 'minimum_should_match: "-25%"', body: () => sqs('-25%') }
  ]
}]
