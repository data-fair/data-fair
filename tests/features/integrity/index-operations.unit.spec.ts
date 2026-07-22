// Pure window sampling & projected-doc compare for the index-consistency verdict (A1).
import { test, expect } from '@playwright/test'
import { samplePivots, normalizeProjectedDoc, compareWindowDocs, docEvidence, PROJECTION_EXCLUDED_KEYS } from '../../../api/src/integrity/index-operations.ts'

test('samplePivots is deterministic for a seed, spread over the domain, sorted and deduped', () => {
  const a = samplePivots('seed-1', 8, 1, 1000000)
  const b = samplePivots('seed-1', 8, 1, 1000000)
  expect(a).toEqual(b)
  expect(a.length).toBeGreaterThan(0)
  expect(a.length).toBeLessThanOrEqual(8)
  expect([...a].sort((x, y) => x - y)).toEqual(a)
  for (const p of a) { expect(p).toBeGreaterThanOrEqual(1); expect(p).toBeLessThanOrEqual(1000000) }
  expect(samplePivots('seed-2', 8, 1, 1000000)).not.toEqual(a)
})

test('samplePivots handles degenerate domains', () => {
  expect(samplePivots('s', 4, 5, 5)).toEqual([5])
  expect(samplePivots('s', 4, 10, 5)).toEqual([])
})

test('normalizeProjectedDoc round-trips dates and strips excluded keys', () => {
  expect(PROJECTION_EXCLUDED_KEYS.has('_rand')).toBe(true)
  const d = new Date('2026-07-22T10:00:00.000Z')
  const doc = normalizeProjectedDoc({ a: 1, _updatedAt: d, _rand: 42 })
  expect(doc).toEqual({ a: 1, _updatedAt: '2026-07-22T10:00:00.000Z' })
})

test('normalizeProjectedDoc drops undefined keys (JSON round-trip parity with the bulk indexer)', () => {
  // the ES bulk serialization drops undefined-valued keys; the source projection must match, or a
  // key that is present-but-undefined on one side would read as a spurious edited divergence
  const doc = normalizeProjectedDoc({ a: 1, b: undefined, c: null })
  expect(doc).toEqual({ a: 1, c: null })
  expect('b' in doc).toBe(false)
})

test('compareWindowDocs finds edited, missing and surplus docs within the common span', () => {
  const src = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 2 } },
    { join: 'l3', i: 3, doc: { a: 3 } }
  ]
  const es = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 'tampered' } },
    { join: 'lX', i: 3, doc: { a: 99 } }
  ]
  const { checked, diverged } = compareWindowDocs(src, es, { sourceExhausted: true, esExhausted: true })
  expect(checked).toBe(3)
  expect(diverged.map(d => `${d.kind}:${d.key}`).sort()).toEqual(['edited:l2', 'missing:l3', 'surplus:lX'])
  const edited = diverged.find(d => d.kind === 'edited')!
  expect(edited.expected).toContain('"a":2')
  expect(edited.actual).toContain('"tampered"')
})

test('compareWindowDocs cuts at the shorter unexhausted side (span intersection)', () => {
  // es window filled up at i=2 (not exhausted): docs beyond i=2 on the source side are outside
  // the comparable span and must NOT read as missing
  const src = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 2 } },
    { join: 'l3', i: 3, doc: { a: 3 } }
  ]
  const es = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 2 } }
  ]
  const { checked, diverged } = compareWindowDocs(src, es, { sourceExhausted: true, esExhausted: false })
  expect(checked).toBe(2)
  expect(diverged).toEqual([])
})

test('compareWindowDocs does not flag surplus ES docs beyond an unexhausted source frontier', () => {
  // mirror of the missing-beyond-span case: the source window filled up at i=2 (not exhausted),
  // so ES docs beyond i=2 are outside the comparable span and must NOT read as surplus
  const src = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 2 } }
  ]
  const es = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 2 } },
    { join: 'l3', i: 3, doc: { a: 3 } }
  ]
  const { checked, diverged } = compareWindowDocs(src, es, { sourceExhausted: false, esExhausted: true })
  expect(checked).toBe(2)
  expect(diverged).toEqual([])
})

test('docEvidence caps the serialized excerpt', () => {
  const s = docEvidence({ big: 'x'.repeat(5000) }, 100)
  expect(s.length).toBeLessThanOrEqual(101)
})
