import type { SchemaContext } from './generator.ts'
import { trackTotalHitsExperiments } from './experiments/track-total-hits.ts'
import { searchCatchallExperiments } from './experiments/search-catchall.ts'
import { searchCatchallCurveExperiments } from './experiments/search-catchall-curve.ts'
import { keywordMainInQExperiments } from './experiments/keyword-main-in-q.ts'
import { minShouldMatchExperiments } from './experiments/min-should-match.ts'
import { msmSearchVsSplitExperiments } from './experiments/msm-search-vs-split.ts'
import { terminateAfterExperiments } from './experiments/terminate-after.ts'
import { msmSkewedExperiments } from './experiments/msm-skewed.ts'
import { countSplitExperiments } from './experiments/count-split.ts'

export interface QueryVariant {
  name: string
  description: string
  /** Builds a raw ES _search body; ctx exposes the seeded preset's field names. */
  body: (ctx: SchemaContext) => Record<string, any>
  /** For count-sampling variants that carry no random_sampler agg (e.g. a `_rand`
   *  range filter): the sampling probability used to extrapolate hits.total. */
  samplerProbability?: number
}

export interface Experiment {
  name: string
  description: string
  preset: string
  baseline: QueryVariant
  variants: QueryVariant[]
}

export const allExperiments: Experiment[] = [
  ...trackTotalHitsExperiments,
  ...searchCatchallExperiments,
  ...searchCatchallCurveExperiments,
  ...keywordMainInQExperiments,
  ...minShouldMatchExperiments,
  ...msmSearchVsSplitExperiments,
  ...terminateAfterExperiments,
  ...msmSkewedExperiments,
  ...countSplitExperiments
]

const byName = new Map(allExperiments.map(e => [e.name, e]))

/** Resolve `all`, an exact experiment name, or a `group` prefix (e.g. `track-total-hits`). */
export function selectExperiments (name: string): Experiment[] {
  if (name === 'all') return allExperiments
  const exact = byName.get(name)
  if (exact) return [exact]
  const prefixed = allExperiments.filter(e => e.name.startsWith(`${name}:`))
  if (prefixed.length > 0) return prefixed
  throw new Error(`unknown experiment "${name}" — available: ${[...byName.keys()].join(', ')}`)
}
