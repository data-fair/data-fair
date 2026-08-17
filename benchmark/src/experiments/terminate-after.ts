import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// Measures the cost/correctness trade-off of `terminate_after` on a heavy scoring
// disjunction. terminate_after stops document collection after N docs per shard — so it
// caps the worst case for any unbounded query, but at the price of (a) `hits.total`
// becoming a lower bound and (b) possible top-k drift if the cap kicks in before the
// best-scoring docs are reached. With block-max-WAND already prioritising competitive
// blocks first, the top-k is usually found early; the question is how small a cap can
// go before top-20 drifts noticeably.
//
// bench-tall is a single shard (no shards override on the preset) so the per-shard cap
// is also the total cap.

const QUERY = 'analyse population transport'

const ft = (ctx: SchemaContext): string => `${ctx.fullTextFields[0]}.text`

function body (cap?: number) {
  return (ctx: SchemaContext) => {
    const b: Record<string, any> = {
      query: { simple_query_string: { query: QUERY, fields: [ft(ctx)], default_operator: 'or' } },
      size: 20
    }
    if (cap !== undefined) b.terminate_after = cap
    return b
  }
}

export const terminateAfterExperiments: Experiment[] = [{
  name: 'terminate-after:disjunction',
  description: 'heavy scoring disjunction with terminate_after capping per-shard doc visits',
  preset: 'tall',
  baseline: { name: 'none', description: 'no terminate_after (today\'s behaviour)', body: body() },
  variants: [
    { name: 'cap-1k', description: 'terminate_after: 1000', body: body(1_000) },
    { name: 'cap-10k', description: 'terminate_after: 10000', body: body(10_000) },
    { name: 'cap-100k', description: 'terminate_after: 100000', body: body(100_000) },
    { name: 'cap-1M', description: 'terminate_after: 1000000', body: body(1_000_000) }
  ]
}]
