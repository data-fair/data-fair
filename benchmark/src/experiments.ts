import type { SchemaContext } from './generator.ts'
import { trackTotalHitsExperiments } from './experiments/track-total-hits.ts'
import { searchCatchallExperiments } from './experiments/search-catchall.ts'
import { minShouldMatchExperiments } from './experiments/min-should-match.ts'

export interface QueryVariant {
  name: string
  description: string
  /** Builds a raw ES _search body; ctx exposes the seeded preset's field names. */
  body: (ctx: SchemaContext) => Record<string, any>
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
  ...minShouldMatchExperiments
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
