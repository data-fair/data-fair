import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// Attempt to load the native simdjson addon; if unavailable, export an inert stub.
// The lazyParse API keeps the document on the C++ tape and pulls only requested key
// paths into JS, avoiding full DOM materialisation for most paths.
// Strategy: use one valueForKeyPath('hits.hits') call to materialise the hits array
// in a single forward tape pass (O(N)), then access _source fields via JS property
// access. Calling valueForKeyPath per (row, column) is O(N²) due to repeated tape
// traversal from root, which is impractical for wide buffers.
let lib: any = null; let available = true
try { const m = await import('simdjson'); lib = m.default ?? m } catch { available = false }

// Resolve an array value with separator join, matching the v8 extract semantics.
function applyJoin (v: unknown, separator: string | null): unknown {
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}

// Pull one field from an already-materialised _source object.
// Dotted sourceKey (e.g. "a.b") falls back to nested property traversal.
function extractSource (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) { v = sourceKey.split('.').reduce((o: any, k: string) => (o == null ? o : o[k]), source) }
  return applyJoin(v, separator)
}

// One valueForKeyPath call traverses the tape once to materialise hits as a JS array.
function allHits (tape: any): any[] { return tape.valueForKeyPath('hits.hits') as any[] }

export const simdjson: Substrate = {
  name: 'simdjson',
  available,
  async t1 (buf, d: Descriptor) {
    if (!available) return 0
    const tape = (lib as any).lazyParse(buf.toString())
    let sum = 0
    for (const hit of allHits(tape)) {
      if (d.selectIncludesId) sum += (hit._id as string).length
      for (const c of d.columns) { const v = extractSource(hit._source, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length }
    }
    return sum
  },
  async t2json (buf, d) {
    if (!available) return Buffer.alloc(0)
    const tape = (lib as any).lazyParse(buf.toString())
    const out: any[] = []
    for (const hit of allHits(tape)) {
      const o: Record<string, unknown> = {}
      if (d.selectIncludesId) o._id = hit._id
      for (const c of d.columns) o[c.outKey] = extractSource(hit._source, c.sourceKey, c.separator) ?? null
      out.push(o)
    }
    return Buffer.from(JSON.stringify(out))
  },
  async t2csv (buf, d) {
    if (!available) return Buffer.alloc(0)
    const tape = (lib as any).lazyParse(buf.toString())
    let s = csvHeader(d.columns)
    for (const hit of allHits(tape)) {
      s += d.columns.map(c => csvCell(extractSource(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'
    }
    return Buffer.from(s)
  }
}
