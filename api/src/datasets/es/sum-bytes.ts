import { aliasName } from './commons.ts'
import es from '#es'

// total CSV-equivalent size of the indexed lines: sum of the _bytes field stamped
// on every doc by index-stream (see the indexed_bytes metric in storage.ts)
export default async (dataset: any): Promise<number> => {
  const esResponse: any = await es.client.search({
    index: aliasName(dataset),
    body: { size: 0, track_total_hits: false, aggs: { bytes: { sum: { field: '_bytes' } } } }
  })
  return Math.round((esResponse.aggregations?.bytes as any)?.value ?? 0)
}
