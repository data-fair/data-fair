import { createAnalyzer } from './analysis.ts'
import { validateDefinition, type TextSearchDefinition, type ResolvedDefinition } from './definition.ts'
import { buildIndexFields, type IndexFields } from './indexing.ts'
import { parseQuery, planQuery, queryTerms, type QueryPlan } from './query.ts'
import { matchFilter, scoreExpression, sortSpec, INDEX_FIELD_NAMES } from './pipeline.ts'
import type { StatsProvider } from './stats.ts'

export type { TextSearchDefinition, ResolvedDefinition } from './definition.ts'
export type { IndexFields } from './indexing.ts'
export type { QueryPlan, CorpusStats } from './query.ts'
export { createStatsProvider, type StatsProvider, type ClearableStatsProvider, type StatsCollection } from './stats.ts'
export { INDEX_FIELD_NAMES, RESPONSE_EXCLUDED_FIELD_NAMES } from './pipeline.ts'

export interface TextSearch {
  definition: ResolvedDefinition
  buildIndexFields (doc: any): IndexFields | null
  /** null when no positive term survives — the caller MUST return no results */
  plan (q: string, statsProvider: StatsProvider, ownerScope?: Record<string, any>): Promise<QueryPlan | null>
  matchFilter (plan: QueryPlan): any
  scoreExpression (plan: QueryPlan): any
  sortSpec (): Record<string, number>
  indexFieldNames: readonly string[]
}

export const defineTextSearch = (def: TextSearchDefinition): TextSearch => {
  const definition = validateDefinition(def)
  const analyzer = createAnalyzer(definition.language, definition.stemmers)
  return {
    definition,
    buildIndexFields: (doc) => buildIndexFields(doc, definition, analyzer),
    async plan (q, statsProvider, ownerScope) {
      const parsed = parseQuery(q, analyzer)
      const terms = queryTerms(parsed)
      if (!terms.length) return null
      const stats = await statsProvider.get(terms, ownerScope)
      return planQuery(parsed, stats, definition)
    },
    matchFilter: (plan) => matchFilter(plan, definition),
    scoreExpression: (plan) => scoreExpression(plan, definition),
    sortSpec: () => sortSpec(definition),
    indexFieldNames: INDEX_FIELD_NAMES
  }
}
