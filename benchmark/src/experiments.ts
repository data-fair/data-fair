import { generateSchema, schemaContext, type SchemaContext, type SchemaField } from './generator.ts'
import { getPreset } from './presets.ts'
import { trackTotalHitsExperiments } from './experiments/track-total-hits.ts'
import { searchCatchallExperiments } from './experiments/search-catchall.ts'
import { searchCatchallCurveExperiments } from './experiments/search-catchall-curve.ts'
import { keywordMainInQExperiments } from './experiments/keyword-main-in-q.ts'
import { minShouldMatchExperiments } from './experiments/min-should-match.ts'
import { msmSearchVsSplitExperiments } from './experiments/msm-search-vs-split.ts'
import { terminateAfterExperiments } from './experiments/terminate-after.ts'
import { msmSkewedExperiments } from './experiments/msm-skewed.ts'
import { countSplitExperiments } from './experiments/count-split.ts'
import { textAnalyzerExperiments } from './experiments/text-analyzer.ts'
import { textAnalyzerWideExperiments } from './experiments/text-analyzer-wide.ts'

export interface QueryVariant {
  name: string
  description: string
  /** Builds a raw ES _search body; ctx exposes the seeded preset's field names. */
  body: (ctx: SchemaContext) => Record<string, any>
  /** For count-sampling variants that carry no random_sampler agg (e.g. a `_rand`
   *  range filter): the sampling probability used to extrapolate hits.total. */
  samplerProbability?: number
}

/** What a self-building experiment (see `Experiment.setup`) hands back to the runner. */
export interface ExperimentSetup {
  /** Number of documents each built index holds — reported as the experiment's row count. */
  rows: number
  /** The ES index each variant queries, keyed by variant name. */
  indexes: Record<string, string>
  /** Measurements the A/B latency table can't express (index size, sanity checks, corpus stats).
   *  Printed under the report and persisted with the results JSON. */
  findings?: Record<string, unknown>
}

export interface Experiment {
  name: string
  description: string
  /** Seeded preset the experiment queries — omitted when `setup` builds its own indexes. */
  preset?: string
  /** Schema of the self-built indexes, used to derive the query ctx in place of a preset's. */
  schema?: SchemaField[]
  /** Experiments whose whole point is the index shape (mappings/analyzers differ per variant)
   *  can't share one seeded preset index: they build their own here instead. Must be idempotent
   *  and memoized — a group of experiments sharing a setup builds the indexes once. */
  setup?: (rows?: number) => Promise<ExperimentSetup>
  baseline: QueryVariant
  variants: QueryVariant[]
}

/** The field context an experiment's variant bodies are built against. */
export function experimentContext (exp: Experiment): SchemaContext {
  if (exp.schema) return schemaContext(exp.schema)
  if (!exp.preset) throw new Error(`experiment "${exp.name}" declares neither a preset nor a schema`)
  return schemaContext(generateSchema(getPreset(exp.preset)))
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
  ...countSplitExperiments,
  ...textAnalyzerExperiments,
  ...textAnalyzerWideExperiments
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
