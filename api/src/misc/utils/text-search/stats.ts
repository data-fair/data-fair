import memoize from 'memoizee'
import { fieldKey } from './definition.ts'
import type { ResolvedDefinition } from './definition.ts'
import type { CorpusStats } from './query.ts'

/** The subset of a mongo Collection this module uses — so it never imports the driver. */
export interface StatsCollection {
  estimatedDocumentCount (): Promise<number>
  countDocuments (filter: any): Promise<number>
  aggregate (pipeline: any[]): { toArray (): Promise<any[]> }
}

export interface StatsProvider {
  get (terms: string[], ownerScope?: Record<string, any>): Promise<CorpusStats>
}

/**
 * Counts corpus statistics at query time and memoizes them. There is deliberately no stored
 * table and no background rebuild: a rare term costs under a millisecond to count, and a 10% df
 * error moves idf by less than 10% — far inside the noise that separates a good ranking from a
 * bad one. See the spec's §7.
 */
export const createStatsProvider = (
  collection: StatsCollection,
  def: ResolvedDefinition,
  options: { dfMaxAge?: number, avgLenMaxAge?: number } = {}
): StatsProvider => {
  const scopeKey = (scope?: Record<string, any>) => scope ? JSON.stringify(scope) : ''

  const countTerm = memoize(
    async (term: string, key: string) => collection.countDocuments({ ...(key ? JSON.parse(key) : {}), _terms: term }),
    { promise: true, maxAge: options.dfMaxAge ?? 5 * 60 * 1000, max: 5000, primitive: true }
  )

  const countAll = memoize(
    async (key: string) => key ? collection.countDocuments(JSON.parse(key)) : collection.estimatedDocumentCount(),
    { promise: true, maxAge: options.dfMaxAge ?? 5 * 60 * 1000, max: 500, primitive: true }
  )

  // a full pass, so it gets a much longer TTL than df; it also changes far more slowly
  const averageLengths = memoize(
    async (key: string) => {
      const group: any = { _id: null }
      // $group output keys cannot contain dots, so we use sanitised keys and translate back at the boundary
      for (const field of Object.keys(def.fields)) group[fieldKey(field)] = { $avg: `$_len.${fieldKey(field)}` }
      const pipeline: any[] = []
      if (key) pipeline.push({ $match: JSON.parse(key) })
      pipeline.push({ $group: group })
      const [row] = await collection.aggregate(pipeline).toArray()
      const avgLen: Record<string, number> = {}
      // Read from the sanitised output key but store under the original dotted field name
      for (const field of Object.keys(def.fields)) avgLen[field] = row?.[fieldKey(field)] || 1
      return avgLen
    },
    { promise: true, maxAge: options.avgLenMaxAge ?? 60 * 60 * 1000, max: 500, primitive: true }
  )

  return {
    async get (terms, ownerScope) {
      const key = scopeKey(ownerScope)
      const [n, avgLen, counts] = await Promise.all([
        countAll(key),
        averageLengths(key),
        Promise.all(terms.map(async term => [term, await countTerm(term, key)] as const))
      ])
      return { n, avgLen, df: Object.fromEntries(counts) }
    }
  }
}
