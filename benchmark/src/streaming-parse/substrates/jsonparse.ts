import Parser from 'jsonparse'
import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// Resolve a possibly-dotted key + multivalue join, matching flatten semantics.
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) { v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source) }
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}

// jsonparse fires onValue for EVERY completed value.  We detect hit-level _id and _source
// by checking this.stack.length === 4 (root → hits-obj → hits-array → hit-obj).  That
// guards against a field literally named "_source" or "_id" nested deeper inside _source
// (those fire with stack.length >= 5).
// Within each hit, "_id" appears before "_source" in the JSON, so we cache pendingId and
// flush it when _source fires for the same hit.
function eachHit (buf: Buffer, onHit: (id: string, src: any) => void): void {
  const p: any = new Parser()
  let pendingId: string | undefined
  p.onValue = function (value: any) {
    if (this.stack.length !== 4) return
    if (this.key === '_id' && typeof value === 'string') {
      pendingId = value
    } else if (this.key === '_source' && value !== null && typeof value === 'object') {
      onHit(pendingId ?? '', value)
      pendingId = undefined
    }
  }
  p.write(buf)
}

export const jsonparse: Substrate = {
  name: 'jsonparse',
  available: true,
  async t1 (buf, d: Descriptor) {
    let sum = 0
    eachHit(buf, (id, src) => {
      if (d.selectIncludesId) sum += id.length
      for (const c of d.columns) { const v = extract(src, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length }
    })
    return sum
  },
  async t2json (buf, d) {
    let s = '['
    let first = true
    eachHit(buf, (id, src) => {
      const o: Record<string, unknown> = {}
      if (d.selectIncludesId) o._id = id
      for (const c of d.columns) o[c.outKey] = extract(src, c.sourceKey, c.separator) ?? null
      s += (first ? '' : ',') + JSON.stringify(o)
      first = false
    })
    return Buffer.from(s + ']')
  },
  async t2csv (buf, d) {
    let s = csvHeader(d.columns)
    eachHit(buf, (_, src) => {
      s += d.columns.map(c => csvCell(extract(src, c.sourceKey, c.separator), c.type)).join(',') + '\n'
    })
    return Buffer.from(s)
  }
}
