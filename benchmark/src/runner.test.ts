import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractSample, summarizeProfile } from './runner.ts'

const esResponse = {
  took: 42,
  hits: {
    total: { value: 10000, relation: 'gte' },
    hits: [{ _id: 'row-1' }, { _id: 'row-2' }]
  }
}

test('extractSample reads took, totals and hit ids', () => {
  const s = extractSample(esResponse, 55.5, 2048)
  assert.equal(s.took, 42)
  assert.equal(s.roundTripMs, 55.5)
  assert.equal(s.bytes, 2048)
  assert.equal(s.totalValue, 10000)
  assert.equal(s.totalRelation, 'gte')
  assert.equal(s.hitsReturned, 2)
  assert.deepEqual(s.topHitIds, ['row-1', 'row-2'])
})

test('summarizeProfile sums rewrite and top-level query time', () => {
  const profile = {
    shards: [{
      searches: [{
        rewrite_time: 1_000_000,
        query: [{ type: 'BooleanQuery', time_in_nanos: 5_000_000 }]
      }]
    }]
  }
  const s = summarizeProfile(profile)
  assert.equal(s.rewriteTimeMs, 1)
  assert.equal(s.totalTimeMs, 5)
  assert.deepEqual(s.topQueryTypes, [{ type: 'BooleanQuery', timeMs: 5 }])
})
