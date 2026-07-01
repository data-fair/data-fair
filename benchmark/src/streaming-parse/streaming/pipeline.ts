import { createHitSplitter } from './splitter.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

export interface Sink { write (bytes: string): void }
export function collectSink () { const parts: string[] = []; return { sink: { write: (b: string) => parts.push(b) }, get: () => Buffer.from(parts.join('')) } }
export function nullSink (): Sink { return { write: (_b: string) => {} } }
export function chunked (buf: Buffer, chunkSize = 65536): Buffer[] { const out: Buffer[] = []; for (let i = 0; i < buf.length; i += chunkSize) out.push(buf.subarray(i, i + chunkSize)); return out.length ? out : [buf.subarray(0, 0)] }

// shared with the bake-off v8 substrate semantics (flatten + multivalue join)
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source)
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}
function emitRowJson (sink: Sink, first: boolean, hit: any, d: Descriptor) {
  let o = first ? '{' : ',{'; let f = true
  if (d.selectIncludesId) { o += '"_id":' + JSON.stringify(hit._id); f = false }
  for (const c of d.columns) { if (!f) o += ','; f = false; o += JSON.stringify(c.outKey) + ':' + JSON.stringify(extract(hit._source, c.sourceKey, c.separator) ?? null) }
  sink.write(o + '}')
}
function emitRowCsv (sink: Sink, hit: any, d: Descriptor) {
  sink.write(d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n')
}

// current path: parse whole -> build all -> serialize ONE requested format
export function bufferedV8 (buf: Buffer, d: Descriptor, format: 'json' | 'csv', sink: Sink, sample: () => void): void {
  const hits = JSON.parse(buf.toString()).hits.hits            // parse whole
  let out: string
  if (format === 'json') {
    const rows = hits.map((hit: any) => {                     // build all rows
      const o: Record<string, unknown> = {}
      if (d.selectIncludesId) o._id = hit._id
      for (const c of d.columns) o[c.outKey] = extract(hit._source, c.sourceKey, c.separator) ?? null
      return o
    })
    out = JSON.stringify(rows)                                 // serialize whole (one format only)
  } else {
    let s = csvHeader(d.columns)
    for (const hit of hits) s += d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'
    out = s
  }
  sample()                                                     // high-water: parsed objects + ONE output
  sink.write(out)
}

// streaming: split -> batch K hits -> JSON.parse batch -> transform -> serialize -> drop
export function streaming (chunks: Buffer[], d: Descriptor, format: 'json' | 'csv', K: number, sink: Sink, sample: () => void): void {
  if (format === 'csv') sink.write(csvHeader(d.columns))
  else sink.write('[')
  let firstRow = true
  let batch: Buffer[] = []
  const flush = () => {
    if (!batch.length) return
    const arr = JSON.parse('[' + batch.map(b => b.toString()).join(',') + ']')  // K hits materialized
    for (const hit of arr) {
      if (format === 'csv') emitRowCsv(sink, hit, d)
      else { emitRowJson(sink, firstRow, hit, d); firstRow = false }
    }
    batch = []
    sample()                               // high-water: only K hits live here
  }
  const sp = createHitSplitter(hitBytes => { batch.push(Buffer.from(hitBytes)); if (batch.length >= K) flush() })
  for (const c of chunks) sp.write(c)
  sp.end()
  flush()
  if (format !== 'csv') sink.write(']')
}
