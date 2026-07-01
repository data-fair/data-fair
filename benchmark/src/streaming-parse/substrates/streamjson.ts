import parserFn from 'stream-json'
import Pick from 'stream-json/filters/Pick.js'
import StreamArray from 'stream-json/streamers/StreamArray.js'
import { Readable } from 'node:stream'
import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// Resolve a possibly-dotted key + multivalue join, matching flatten semantics.
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source)
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}

// stream-json pipeline: parse → pick hits.hits → streamArray → for await one hit at a time.
// parserFn() is the stream-json parser factory (module.exports = make).
// Pick.make / StreamArray.make are the static factory methods on each CJS class export.
async function eachHit (buf: Buffer, onHit: (hit: any) => void): Promise<void> {
  const pipeline = Readable.from([buf]).pipe(parserFn()).pipe(Pick.make({ filter: 'hits.hits' })).pipe(StreamArray.make())
  for await (const { value } of pipeline) onHit(value)
}

export const streamjson: Substrate = {
  name: 'stream-json',
  available: true,
  async t1 (buf, d: Descriptor) {
    let sum = 0
    await eachHit(buf, hit => {
      if (d.selectIncludesId) sum += String(hit._id).length
      for (const c of d.columns) { const v = extract(hit._source, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length }
    })
    return sum
  },
  async t2json (buf, d) {
    let s = '['
    let first = true
    await eachHit(buf, hit => {
      s += first ? '' : ','
      first = false
      let o = '{'
      let f = true
      if (d.selectIncludesId) { o += '"_id":' + JSON.stringify(hit._id); f = false }
      for (const c of d.columns) {
        if (!f) o += ','
        f = false
        o += JSON.stringify(c.outKey) + ':' + JSON.stringify(extract(hit._source, c.sourceKey, c.separator) ?? null)
      }
      s += o + '}'
    })
    return Buffer.from(s + ']')
  },
  async t2csv (buf, d) {
    let s = csvHeader(d.columns)
    await eachHit(buf, hit => {
      s += d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'
    })
    return Buffer.from(s)
  }
}
