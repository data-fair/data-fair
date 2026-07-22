// Pure functions for the index-consistency verdict (A1): seeded window sampling and
// projected-doc comparison. No es/mongo/config imports (unit-tested directly).
import crypto from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export type DivergedEntry = { key: string, kind: 'edited' | 'missing' | 'surplus', expected?: string, actual?: string }
export type WindowDoc = { join: string, i: number, doc: Record<string, any> }

// index-time fields that cannot be re-derived from the source: _rand is Math.random() at index
// time (extensions.ts). _file/_file_raw cannot occur: enrollment refuses attachment datasets.
export const PROJECTION_EXCLUDED_KEYS = new Set(['_rand'])

// W pivots derived from the seed by hashing — deterministic per seed (test aiming), uniform over
// [minI, maxI]. The nightly caller draws a fresh crypto-random seed per run and never persists it
// before use, so an adversary cannot know which rows tonight's windows will visit.
export const samplePivots = (seed: string, windows: number, minI: number, maxI: number): number[] => {
  if (maxI < minI) return []
  const span = BigInt(maxI - minI + 1)
  const pivots = new Set<number>()
  for (let n = 0; n < windows; n++) {
    const h = crypto.createHash('sha256').update(`${seed}:${n}`).digest()
    pivots.add(minI + Number(h.readBigUInt64BE(0) % span))
  }
  return [...pivots].sort((a, b) => a - b)
}

// JSON round-trip (Dates → ISO strings, undefined dropped — exactly what the bulk indexer's
// serialization produced) + strip the non-derivable keys from either side of the compare
export const normalizeProjectedDoc = (doc: Record<string, any>): Record<string, any> => {
  const out = JSON.parse(JSON.stringify(doc))
  for (const k of PROJECTION_EXCLUDED_KEYS) delete out[k]
  return out
}

export const docEvidence = (doc: Record<string, any>, cap = 800): string => {
  const s = JSON.stringify(doc)
  return s.length > cap ? s.slice(0, cap) + '…' : s
}

// Compare two _i-ordered window slices over their common span. A side that filled its window
// (not exhausted) bounds the span at its last _i: rows beyond it on the other side are outside
// the comparable range, not divergences.
export const compareWindowDocs = (source: WindowDoc[], es: WindowDoc[], bounds: { sourceExhausted: boolean, esExhausted: boolean }): { checked: number, diverged: DivergedEntry[] } => {
  let spanEnd = Infinity
  // Number.isFinite guards mirror deepCompare's: callers peel off non-finite `_i` before a doc
  // reaches here, so the last `.i` is finite in practice — the guard is an internal-consistency
  // fallback that stops a stray non-finite frontier collapsing spanEnd to NaN (which would filter
  // every doc out of both the slice and the carry, silently uncompared).
  const sLastI = source.length ? source[source.length - 1].i : undefined
  const esLastI = es.length ? es[es.length - 1].i : undefined
  if (!bounds.sourceExhausted && Number.isFinite(sLastI)) spanEnd = Math.min(spanEnd, sLastI as number)
  if (!bounds.esExhausted && Number.isFinite(esLastI)) spanEnd = Math.min(spanEnd, esLastI as number)
  const s = source.filter(d => d.i <= spanEnd)
  const esByJoin = new Map(es.filter(d => d.i <= spanEnd).map(d => [d.join, d]))
  const diverged: DivergedEntry[] = []
  for (const d of s) {
    const match = esByJoin.get(d.join)
    if (!match) { diverged.push({ key: d.join, kind: 'missing', expected: docEvidence(d.doc) }); continue }
    esByJoin.delete(d.join)
    if (!isDeepStrictEqual(d.doc, match.doc)) {
      diverged.push({ key: d.join, kind: 'edited', expected: docEvidence(d.doc), actual: docEvidence(match.doc) })
    }
  }
  for (const [join, d] of esByJoin) diverged.push({ key: join, kind: 'surplus', actual: docEvidence(d.doc) })
  return { checked: s.length, diverged }
}
