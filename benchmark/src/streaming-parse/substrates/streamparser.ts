import { JSONParser } from '@streamparser/json'
import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// Emit one hit at a time using a value-path filter on hits.hits.*.
// paths: '$.hits.hits.*' fires onValue with the full hit object ({ _id, _source, ... }),
// so we can read both ._id and ._source from a single callback.
function eachHit (buf: Buffer, onHit: (hit: any) => void): void {
  const parser = new JSONParser({ paths: ['$.hits.hits.*'], keepStack: false })
  parser.onValue = ({ value }) => onHit(value as any)
  // write() is sufficient for a single JSON document: the TokenParser ends itself
  // automatically after parsing the first complete root value (no separator configured),
  // cascading to end the tokenizer. Calling end() after that would double-end the tokenizer.
  parser.write(buf)
}

// Resolve a possibly-dotted key + multivalue join, matching flatten semantics.
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) { v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source) }
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}

export const streamparser: Substrate = {
  name: 'streamparser',
  available: true,
  async t1 (buf, d: Descriptor) {
    let sum = 0
    eachHit(buf, hit => {
      if (d.selectIncludesId) sum += (hit._id as string).length
      for (const c of d.columns) { const v = extract(hit._source, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length }
    })
    return sum
  },
  async t2json (buf, d) {
    const out: any[] = []
    eachHit(buf, hit => {
      const o: Record<string, unknown> = {}
      if (d.selectIncludesId) o._id = hit._id
      for (const c of d.columns) o[c.outKey] = extract(hit._source, c.sourceKey, c.separator) ?? null
      out.push(o)
    })
    return Buffer.from(JSON.stringify(out))
  },
  async t2csv (buf, d) {
    let s = csvHeader(d.columns)
    eachHit(buf, hit => {
      s += d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'
    })
    return Buffer.from(s)
  }
}
