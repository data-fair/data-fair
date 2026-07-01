import assert from 'node:assert/strict'
import { createHitSplitter } from './splitter.ts'

// deterministic PRNG
function mulberry32 (seed: number) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

function genHit (r: () => number, i: number) {
  // include tricky content: braces/brackets in strings, escaped quotes, unicode
  return {
    _id: `id-${i}`,
    _score: null,
    sort: [i],
    _source: {
      a: { b: `deep "${i}" }{`, c: i },
      tags: [`t${i % 3}`, 'x]y', 'q\\z'],
      label: r() < 0.5 ? `line\nbreak ★ ${i}` : `plain ${i}`,
      n: Math.floor(r() * 1e6),
      f: (r() - 0.5) * 1000,
      nul: null
    }
  }
}
function envelope (hits: any[]) {
  return Buffer.from(JSON.stringify({ took: 3, timed_out: false, _shards: { total: 1 }, hits: { total: { value: hits.length, relation: 'eq' }, max_score: null, hits } }))
}

for (let seed = 1; seed <= 200; seed++) {
  const r = mulberry32(seed)
  const n = Math.floor(r() * 40)
  const hits = Array.from({ length: n }, (_, i) => genHit(r, i))
  const buf = envelope(hits)
  const chunkSize = 1 + Math.floor(r() * 64)   // tiny random chunks to stress boundaries
  const got: any[] = []
  const sp = createHitSplitter(b => got.push(JSON.parse(b.toString())))
  for (let i = 0; i < buf.length; i += chunkSize) sp.write(buf.subarray(i, i + chunkSize))
  sp.end()
  assert.deepEqual(got, hits, `hits seed ${seed} (n=${n}, chunk=${chunkSize})`)
  assert.equal(sp.total, n, `total seed ${seed}`)
}
console.log('splitter.test OK')
