import es from '#es'
import { unicityAggField, unicityKeyPartLabel } from './operations.ts'

export type DuplicateGroup = { keyLabel: string, lines: number[], count: number }

const PAGE_SIZE = 1000
const HITS_PER_GROUP = 10

/**
 * Stream a composite aggregation over the constraint columns of a concrete index,
 * returning up to maxGroups groups that have 2+ rows sharing the same key.
 * Memory-flat: pages via after_key, keeps only duplicate groups.
 */
export const findUnicityDuplicates = async (
  indexName: string,
  constraint: { properties: string[] },
  schema: any[],
  maxGroups: number
): Promise<DuplicateGroup[]> => {
  const byKey = new Map(schema.map(p => [p.key, p]))
  // defensive: a dangling constraint (referencing a column removed by a schema-only patch
  // that slipped past checkConstraints) must never crash the indexer — skip it instead of
  // calling unicityAggField(undefined), which would throw a TypeError.
  if (!constraint.properties.every(key => byKey.has(key))) return []
  const sources = constraint.properties.map(key => {
    const prop = byKey.get(key)
    return { [key]: { terms: { field: unicityAggField(prop) } } }
  })

  const duplicates: DuplicateGroup[] = []
  let afterKey: any
  while (duplicates.length < maxGroups) {
    const composite: any = { size: PAGE_SIZE, sources }
    if (afterKey) composite.after = afterKey
    const resp: any = await es.client.search({
      index: indexName,
      size: 0,
      track_total_hits: false,
      aggs: {
        dups: {
          composite,
          aggs: { lines: { top_hits: { size: HITS_PER_GROUP, _source: ['_i'] } } }
        }
      }
    })
    const agg = resp.aggregations?.dups
    if (!agg || !agg.buckets.length) break
    for (const bucket of agg.buckets) {
      if (bucket.doc_count >= 2) {
        const lines: number[] = bucket.lines.hits.hits
          .map((h: any) => h._source?._i)
          .filter((i: any) => typeof i === 'number')
        duplicates.push({
          keyLabel: constraint.properties.map(k => unicityKeyPartLabel(byKey.get(k), bucket.key[k])).join(' | '),
          lines,
          count: bucket.doc_count
        })
        if (duplicates.length >= maxGroups) break
      }
    }
    afterKey = agg.after_key
    if (!afterKey) break
  }
  return duplicates
}
