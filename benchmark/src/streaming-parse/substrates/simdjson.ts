import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// Attempt to load the native simdjson addon; if unavailable, export an inert stub.
//
// HONEST CHARACTERISATION: this substrate measures SIMD-parse-to-JS-objects, NOT a
// lazy field pull. The "schema-driven lazy pull off the tape" vision is impractical
// with this binding: valueForKeyPath re-scans the tape from root on every call, so a
// per-(row, column) lazy pull is O(N²×cols) and unusably slow on wide buffers (see
// `simdjsonLazyT1` below and the report's characterisation row `simdjson-lazy@300`).
// Strategy used here instead: one valueForKeyPath('hits.hits') call materialises the
// hits array in a single forward tape pass (O(N)), then _source fields are read via
// plain JS property access — i.e. SIMD parse into JS objects, then materialise.
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

// Characterisation only — NOT the shipped substrate. This is the ORIGINAL lazy
// per-field approach: one valueForKeyPath call per (row, column). Each call re-scans
// the tape from the root, so this is O(N²×cols) and impractical. Exported purely to
// quantify the per-field boundary cost at a small row count for the report.
export function simdjsonLazyT1 (buf: Buffer, d: Descriptor): number {
  if (!available) return 0
  const tape = (lib as any).lazyParse(buf.toString())
  const total = tape.valueForKeyPath('hits.total.value') as number
  let sum = 0
  for (let i = 0; i < total; i++) {
    if (d.selectIncludesId) sum += String(tape.valueForKeyPath(`hits.hits.${i}._id`)).length
    for (const c of d.columns) {
      const v = applyJoin(tape.valueForKeyPath(`hits.hits.${i}._source.${c.sourceKey}`), c.separator)
      sum += v == null ? 0 : String(v).length
    }
  }
  return sum
}

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
