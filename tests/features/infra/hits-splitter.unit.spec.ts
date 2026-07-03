import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createHitSplitter } from '../../../api/src/datasets/es/hits-splitter.ts'

function mulberry32 (seed: number) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const genHit = (r: () => number, i: number) => ({ _id: `id-${i}`, _score: null, sort: [i], _source: { a: { b: `d "${i}" }{`, c: i }, tags: [`t${i % 3}`, 'x]y', 'q\\z'], label: r() < 0.5 ? `l\n★ ${i}` : `p ${i}`, n: (i * 2654435761) % 1e6 } })
const envelope = (hits: any[], aggs?: any) => Buffer.from(JSON.stringify({ took: 3, timed_out: false, _shards: { total: 1 }, hits: { total: { value: hits.length, relation: 'eq' }, max_score: null, hits }, ...(aggs ? { aggregations: aggs } : {}) }))

test.describe('hits-splitter', () => {
  test('slices hits + recovers envelope across tiny chunks, 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = mulberry32(seed)
      const n = Math.floor(r() * 40)
      const hits = Array.from({ length: n }, (_, i) => genHit(r, i))
      const aggs = r() < 0.5 ? { totalCollapse: { value: n } } : undefined
      const buf = envelope(hits, aggs)
      const chunk = 1 + Math.floor(r() * 64)
      const got: any[] = []
      const sp = createHitSplitter(b => got.push(JSON.parse(b.toString())))
      for (let i = 0; i < buf.length; i += chunk) sp.write(buf.subarray(i, i + chunk))
      sp.end()
      assert.deepEqual(got, hits, `hits seed ${seed}`)
      const env = sp.envelope()
      assert.equal(env.hits.total.value, n, `total seed ${seed}`)
      assert.deepEqual(env.hits.hits, [], `skeleton empties hits seed ${seed}`)
      if (aggs) assert.deepEqual(env.aggregations, aggs, `aggs seed ${seed}`)
    }
  })

  test('does not mis-anchor on a pre-hits key whose raw bytes contain "hits":[', () => {
    // key `weird"hits` serializes as `"weird\"hits"` — the raw bytes contain QUOTE h i t s QUOTE ':' '[',
    // which a naive needle matches. The anchor must skip it (inside a string) and find the real array.
    const body = Buffer.from('{"took":1,"weird\\"hits":[1,2],"hits":{"total":{"value":1},"hits":[{"_id":"a","_source":{}}]}}')
    const emitted: Buffer[] = []
    const splitter = createHitSplitter(b => emitted.push(b))
    splitter.write(body)
    splitter.end()
    assert.equal(emitted.length, 1)
    assert.equal(JSON.parse(emitted[0].toString())._id, 'a')
    assert.equal(splitter.envelope().hits.total.value, 1)
  })

  test('envelope() surfaces a descriptive error on a non-ES body, not a bare SyntaxError', () => {
    const splitter = createHitSplitter(() => {})
    splitter.write(Buffer.from('this is not an ES response'))
    splitter.end()
    assert.throws(() => splitter.envelope(), /unexpected ES response envelope/)
  })
})
