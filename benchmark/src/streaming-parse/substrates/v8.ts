import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// resolve a possibly-dotted key + multivalue join, matching flatten semantics
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) { v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source) }
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}

function rows (buf: Buffer): any[] { return JSON.parse(buf.toString()).hits.hits }

export const v8: Substrate = {
  name: 'v8',
  available: true,
  async t1 (buf, d: Descriptor) {
    let sum = 0
    for (const hit of rows(buf)) {
      if (d.selectIncludesId) sum += hit._id.length
      for (const c of d.columns) { const v = extract(hit._source, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length }
    }
    return sum
  },
  async t2json (buf, d) {
    const out: any[] = []
    for (const hit of rows(buf)) {
      const o: Record<string, unknown> = {}
      if (d.selectIncludesId) o._id = hit._id
      for (const c of d.columns) o[c.outKey] = extract(hit._source, c.sourceKey, c.separator) ?? null
      out.push(o)
    }
    return Buffer.from(JSON.stringify(out))
  },
  async t2csv (buf, d) {
    let s = csvHeader(d.columns)
    for (const hit of rows(buf)) {
      s += d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'
    }
    return Buffer.from(s)
  }
}

export async function referenceOutput (buf: Buffer, d: Descriptor) {
  return { json: await v8.t2json(buf, d), csv: await v8.t2csv(buf, d) }
}

// sync version for streaming pipeline (no actual i/o — avoids promise overhead in benchmarks)
export function referenceOutputSync (buf: Buffer, d: Descriptor): { json: Buffer, csv: Buffer } {
  const hitsArr = rows(buf)
  const out: any[] = []
  for (const hit of hitsArr) {
    const o: Record<string, unknown> = {}
    if (d.selectIncludesId) o._id = hit._id
    for (const c of d.columns) o[c.outKey] = extract(hit._source, c.sourceKey, c.separator) ?? null
    out.push(o)
  }
  let s = csvHeader(d.columns)
  for (const hit of hitsArr) {
    s += d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'
  }
  return { json: Buffer.from(JSON.stringify(out)), csv: Buffer.from(s) }
}
