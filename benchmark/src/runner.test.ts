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

test('extractSample extrapolates a random_sampler count into the total', () => {
  const response = {
    took: 3,
    hits: { hits: [] },
    aggregations: { sample: { doc_count: 3260, noop: { value: 12 } } }
  }
  const s = extractSample(response, 4, 512, 0.01)
  assert.equal(s.totalValue, 326000)
  assert.equal(s.totalRelation, 'estimate')
  // without a probability the sampler agg is ignored
  const raw = extractSample(response, 4, 512)
  assert.equal(raw.totalValue, 0)
  assert.equal(raw.totalRelation, 'eq')
})

test('extractSample extrapolates hits.total when the probability comes from the variant (no agg)', () => {
  // the _rand range-filter sampling shape: exact count of a 1% sample, no aggregations
  const response = {
    took: 2,
    hits: { total: { value: 8392, relation: 'eq' }, hits: [] }
  }
  const s = extractSample(response, 3, 256, 0.01)
  assert.equal(s.totalValue, 839200)
  assert.equal(s.totalRelation, 'estimate')
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
