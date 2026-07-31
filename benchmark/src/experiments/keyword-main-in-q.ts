import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// Measures the cost AND recall contribution of including the keyword-main fields in a `q`
// query. In wide-text (catch-all regime) the harness mirrors data-fair: qSearchFields =
// [_search, _search.text_standard, kw1..kw10]. The pure-keyword columns are NOT copy_to'd
// into `_search`, so dropping them from qSearchFields can lose recall for queries that
// target keyword values.
//
// Three query shapes:
//   - freetext: two analyzed words → keyword mains likely contribute nothing
//   - mixed:    one analyzed word + one keyword value → divergence on the kw side
//   - keyword:  a bare keyword value alone → keyword mains are the ONLY way to hit
//
// `track_total_hits` is bumped to 1_000_000 so totals are exact (not capped at 10000),
// which is what lets us compare recall directly.

function expt (name: string, description: string, query: string): Experiment {
  const withKwMains = (ctx: SchemaContext) => ({
    query: {
      simple_query_string: {
        query,
        fields: ['_search', '_search.text_standard', ...ctx.keywordFields]
      }
    },
    size: 20,
    track_total_hits: 1_000_000
  })
  const searchOnly = () => ({
    query: {
      simple_query_string: {
        query,
        fields: ['_search', '_search.text_standard']
      }
    },
    size: 20,
    track_total_hits: 1_000_000
  })
  return {
    name: `keyword-main-in-q:${name}`,
    description,
    preset: 'wide-text',
    baseline: { name: 'with-kw-mains', description: 'q over [_search pair, kw1..kw10] (today\'s catch-all qSearchFields)', body: withKwMains },
    variants: [
      { name: 'search-only', description: 'q over [_search, _search.text_standard] only — keyword mains dropped', body: searchOnly }
    ]
  }
}

export const keywordMainInQExperiments: Experiment[] = [
  expt('freetext', 'two analyzed words ("analyse population") — keyword mains should add nothing', 'analyse population'),
  expt('mixed', 'one analyzed word + one keyword value ("analyse cat-alpha")', 'analyse cat-alpha'),
  expt('keyword', 'bare keyword value alone ("cat-alpha") — only keyword mains can hit it', 'cat-alpha')
]
