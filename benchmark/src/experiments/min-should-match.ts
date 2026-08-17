import type { Experiment } from '../experiments.ts'

// On the wide-text preset, measure how minimum_should_match on a multi-term q
// affects cost and result-set drift. No track_total_hits override → ES default
// (10000), so block-max-WAND is enabled and interacts with the msm pruning.
// The query has 5 terms; variants use absolute thresholds so each yields a
// distinct, unambiguous required-term count (ES's default is "1 of 5").
// Investigation idea 4 maps the best speed/drift threshold to a percentage default.

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
  baseline: { name: 'none', description: 'no minimum_should_match (ES default: 1 of 5 terms)', body: () => sqs() },
  variants: [
    { name: 'msm-2', description: 'minimum_should_match: "2"', body: () => sqs('2') },
    { name: 'msm-3', description: 'minimum_should_match: "3"', body: () => sqs('3') },
    { name: 'msm-4', description: 'minimum_should_match: "4"', body: () => sqs('4') },
    { name: 'msm-5', description: 'minimum_should_match: "5" (all terms)', body: () => sqs('5') }
  ]
}]
