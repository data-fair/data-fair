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

/** What answering a query needs: statistics in, nothing else. */
export interface StatsProvider {
  get (terms: string[], ownerScope?: Record<string, any>): Promise<CorpusStats>
}

/**
 * What OWNING the provider adds. Kept off StatsProvider deliberately: the search façade only ever
 * reads statistics, so requiring a cache control on the query contract would make every caller
 * and every test double carry a method none of them can meaningfully implement.
 */
export interface ClearableStatsProvider extends StatsProvider {
  /**
   * Drop every memoized statistic. Ranking depends on corpus-wide values (n, avgLen) that no
   * document carries, so a corpus replaced wholesale — as the test environment does between
   * cases — is still scored against the previous one until the TTLs expire, and avgLen's is an
   * hour. Production never needs this: there the corpus drifts slowly, which is the whole
   * premise of caching these.
   */
  clear (): void
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
): ClearableStatsProvider => {
  const scopeKey = (scope?: Record<string, any>) => scope ? JSON.stringify(scope) : ''

  const countTerm = memoize(
    async (term: string, key: string) => collection.countDocuments({ ...(key ? JSON.parse(key) : {}), _terms: term }),
    { promise: true, maxAge: options.dfMaxAge ?? 5 * 60 * 1000, max: 5000, primitive: true }
  )
  // Never memoize a zero: planQuery drops any term whose df is 0 as unknown, so a stale non-zero
  // df only shifts ranking a little (the module doc's "10% df error" noise), but a stale zero
  // removes the term from the query plan altogether — a document that gains the term while the
  // zero is cached stays unfindable by it for the rest of the TTL. Counting an absent term is
  // also the cheapest possible count (an empty index range), and it is exactly the term most
  // likely to gain documents soon, so evicting it costs nothing and buys correctness.
  const countTermChecked = async (term: string, key: string) => {
    const df = await countTerm(term, key)
    if (df === 0) countTerm.delete(term, key)
    return df
  }

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
    clear () {
      countTerm.clear()
      countAll.clear()
      averageLengths.clear()
    },
    async get (terms, ownerScope) {
      const key = scopeKey(ownerScope)
      const [n, avgLen, counts] = await Promise.all([
        countAll(key),
        averageLengths(key),
        Promise.all(terms.map(async term => [term, await countTermChecked(term, key)] as const))
      ])
      return { n, avgLen, df: Object.fromEntries(counts) }
    }
  }
}
