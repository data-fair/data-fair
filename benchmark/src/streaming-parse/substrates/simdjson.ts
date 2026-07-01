import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// Attempt to load the native simdjson addon; if unavailable, export an inert stub.
// The lazyParse API keeps the document on the C++ tape and pulls only requested key
// paths into JS, avoiding full DOM materialisation. This version uses lazyParse.
let lib: any = null; let available = true
try { const m = await import('simdjson'); lib = m.default ?? m } catch { available = false }

// Resolve an array value with separator join, matching the v8 extract semantics.
function applyJoin (v: unknown, separator: string | null): unknown {
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}

// Pull one field from the tape for hit[i]. sourceKey may be dotted (e.g. "a.b") which
// maps naturally to the valueForKeyPath dot notation.
function tapePull (tape: any, i: number, sourceKey: string, separator: string | null): unknown {
  const v = tape.valueForKeyPath(`hits.hits.${i}._source.${sourceKey}`)
  return applyJoin(v, separator)
}

function hitsCount (tape: any): number { return tape.valueForKeyPath('hits.total.value') as number }

export const simdjson: Substrate = {
  name: 'simdjson',
  available,
  async t1 (buf, d: Descriptor) {
    if (!available) return 0
    const tape = (lib as any).lazyParse(buf.toString())
    const n = hitsCount(tape)
    let sum = 0
    for (let i = 0; i < n; i++) {
      if (d.selectIncludesId) { const id = tape.valueForKeyPath(`hits.hits.${i}._id`) as string; sum += id.length }
      for (const c of d.columns) { const v = tapePull(tape, i, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length }
    }
    return sum
  },
  async t2json (buf, d) {
    if (!available) return Buffer.alloc(0)
    const tape = (lib as any).lazyParse(buf.toString())
    const n = hitsCount(tape)
    const out: any[] = []
    for (let i = 0; i < n; i++) {
      const o: Record<string, unknown> = {}
      if (d.selectIncludesId) o._id = tape.valueForKeyPath(`hits.hits.${i}._id`)
      for (const c of d.columns) o[c.outKey] = tapePull(tape, i, c.sourceKey, c.separator) ?? null
      out.push(o)
    }
    return Buffer.from(JSON.stringify(out))
  },
  async t2csv (buf, d) {
    if (!available) return Buffer.alloc(0)
    const tape = (lib as any).lazyParse(buf.toString())
    const n = hitsCount(tape)
    let s = csvHeader(d.columns)
    for (let i = 0; i < n; i++) {
      s += d.columns.map(c => csvCell(tapePull(tape, i, c.sourceKey, c.separator), c.type)).join(',') + '\n'
    }
    return Buffer.from(s)
  }
}
