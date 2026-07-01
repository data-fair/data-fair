import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { streamToSource, chooseStreamMode, collectResponse } from '../../../api/src/datasets/es/hits-stream.ts'

// Same envelope shape as the hits-splitter fuzz test (Task 1): a realistic ES `_search` response body.
const envelope = (hits: any[], aggs?: any) => Buffer.from(JSON.stringify({ took: 3, timed_out: false, _shards: { total: 1, successful: 1 }, hits: { total: { value: hits.length, relation: 'eq' }, max_score: null, hits }, ...(aggs ? { aggregations: aggs } : {}) }))

// A Node Readable that emits the buffer in fixed-size chunks (drives the splitter across boundaries).
const chunked = (buf: Buffer, size: number) => Readable.from((function * () { for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size) })())

// Hits deliberately contain characters that would break a naive splitter: braces/brackets/quotes/newlines.
const genHits = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: `id-${i}`, _score: null, sort: [i], _source: { a: { b: `d "${i}" }{`, c: i }, tags: [`t${i % 3}`, 'x]y', 'q\\z'], label: `l\n★ ${i}`, n: i * 3 } }))

test.describe('search-stream: streamToSource', () => {
  test('total available before iterating, hits in order, tail envelope — across tiny chunk sizes', async () => {
    const hits = genHits(9)
    const aggs = { totalCollapse: { value: 9 } }
    const buf = envelope(hits, aggs)
    for (const size of [1, 2, 3, 5, 13, 64, buf.length]) {
      const src = await streamToSource(chunked(buf, size))
      // total MUST be known before any hit is pulled (streamJson writes it in the head)
      assert.equal(src.total, 9, `total before hits (chunk ${size})`)
      const got: any[] = []
      for await (const h of src.hits) got.push(h)
      assert.deepEqual(got, hits, `hits in order (chunk ${size})`)
      const env = await src.tail()
      assert.deepEqual(env.aggregations, aggs, `tail aggregations (chunk ${size})`)
      assert.equal(env.hits.total.value, 9, `tail total (chunk ${size})`)
      assert.deepEqual(env.hits.hits, [], `tail empties hits (chunk ${size})`)
    }
  })

  test('empty hits: total 0, no hits, tail envelope', async () => {
    const buf = envelope([], undefined)
    const src = await streamToSource(chunked(buf, 4))
    assert.equal(src.total, 0)
    const got: any[] = []
    for await (const h of src.hits) got.push(h)
    assert.deepEqual(got, [])
    const env = await src.tail()
    assert.equal(env.hits.total.value, 0)
    assert.deepEqual(env.hits.hits, [])
  })

  test('tail() alone (without draining hits) still consumes stream and returns envelope', async () => {
    const hits = genHits(5)
    const buf = envelope(hits, { g: { value: 5 } })
    const src = await streamToSource(chunked(buf, 7))
    assert.equal(src.total, 5)
    const env = await src.tail()
    assert.deepEqual(env.aggregations, { g: { value: 5 } })
    assert.equal(env.hits.total.value, 5)
  })
})

test.describe('search-stream: content-length mode decision', () => {
  test('below minBytes → buffered; at/above → streamed', () => {
    assert.equal(chooseStreamMode({ 'content-length': '499999' }, false, { minBytes: 500000 }), 'buffered')
    assert.equal(chooseStreamMode({ 'content-length': '500000' }, false, { minBytes: 500000 }), 'streamed')
    assert.equal(chooseStreamMode({ 'content-length': '900000' }, false, { minBytes: 500000 }), 'streamed')
  })

  test('forceStream always streams, even below the threshold', () => {
    assert.equal(chooseStreamMode({ 'content-length': '10' }, false, { minBytes: 500000, forceStream: true }), 'streamed')
  })

  test('unknown size streams (safe default): absent content-length, or gzip-compressed length', () => {
    assert.equal(chooseStreamMode({}, false, { minBytes: 500000 }), 'streamed')
    assert.equal(chooseStreamMode({ 'content-length': 'nope' }, false, { minBytes: 500000 }), 'streamed')
    // gzip-encoded: content-length is the COMPRESSED size, untrustworthy for the decompressed threshold → stream
    assert.equal(chooseStreamMode({ 'content-length': '10' }, true, { minBytes: 500000 }), 'streamed')
  })

  test('collectResponse parses a chunked identity body into the buffered esResponse shape', async () => {
    const hits = genHits(4)
    const buf = envelope(hits, { totalCollapse: { value: 4 } })
    const esResponse = await collectResponse(chunked(buf, 5))
    assert.deepEqual(esResponse.hits.hits, hits)
    assert.equal(esResponse.hits.total.value, 4)
    assert.deepEqual(esResponse.aggregations, { totalCollapse: { value: 4 } })
  })
})
