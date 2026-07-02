import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { streamToSource } from '../../../api/src/datasets/es/hits-stream.ts'

// Same envelope shape as the hits-splitter fuzz test (Task 1): a realistic ES `_search` response body.
const envelope = (hits: any[], aggs?: any) => Buffer.from(JSON.stringify({ took: 3, timed_out: false, _shards: { total: 1, successful: 1 }, hits: { total: { value: hits.length, relation: 'eq' }, max_score: null, hits }, ...(aggs ? { aggregations: aggs } : {}) }))

// A Node Readable that emits the buffer in fixed-size chunks (drives the splitter across boundaries).
const chunked = (buf: Buffer, size: number) => Readable.from((function * () { for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size) })())

// Hits deliberately contain characters that would break a naive splitter: braces/brackets/quotes/newlines.
const genHits = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: `id-${i}`, _score: null, sort: [i], _source: { a: { b: `d "${i}" }{`, c: i }, tags: [`t${i % 3}`, 'x]y', 'q\\z'], label: `l\n★ ${i}`, n: i * 3 } }))

test.describe('search-stream: streamToSource', () => {
  test('hits in order, tail envelope with total — across tiny chunk sizes', async () => {
    const hits = genHits(9)
    const aggs = { totalCollapse: { value: 9 } }
    const buf = envelope(hits, aggs)
    for (const size of [1, 2, 3, 5, 13, 64, buf.length]) {
      const src = streamToSource(chunked(buf, size))
      const got: any[] = []
      for await (const bulk of src.hits) got.push(...bulk)
      assert.deepEqual(got, hits, `hits in order (chunk ${size})`)
      const env = await src.tail()
      assert.deepEqual(env.aggregations, aggs, `tail aggregations (chunk ${size})`)
      assert.equal(env.hits.total.value, 9, `tail total (chunk ${size})`)
      assert.deepEqual(env.hits.hits, [], `tail empties hits (chunk ${size})`)
    }
  })

  test('empty hits: no hits, tail envelope with total 0', async () => {
    const buf = envelope([], undefined)
    const src = streamToSource(chunked(buf, 4))
    const got: any[] = []
    for await (const bulk of src.hits) got.push(...bulk)
    assert.deepEqual(got, [])
    const env = await src.tail()
    assert.equal(env.hits.total.value, 0)
    assert.deepEqual(env.hits.hits, [])
  })

  test('tail() alone (without draining hits) still consumes stream and returns envelope', async () => {
    const hits = genHits(5)
    const buf = envelope(hits, { g: { value: 5 } })
    const src = streamToSource(chunked(buf, 7))
    const env = await src.tail()
    assert.deepEqual(env.aggregations, { g: { value: 5 } })
    assert.equal(env.hits.total.value, 5)
  })

  test('destroy() destroys the underlying ES stream (releases the transport connection)', async () => {
    const buf = envelope(genHits(2))
    const stream = chunked(buf, 16)
    const src = streamToSource(stream)
    src.destroy!()
    assert.ok(stream.destroyed)
  })

  test('no hits.total (track_total_hits:false, i.e. after= pages / count=false): no pre-pump, hits stay incremental', async () => {
    const hits = Array.from({ length: 500 }, (_, i) => ({ _id: 'h' + i, _source: { n: i, pad: 'x'.repeat(100) } }))
    // same envelope as ES emits with track_total_hits:false — NO hits.total at all
    const body = Buffer.from(JSON.stringify({ took: 3, timed_out: false, _shards: { total: 1, successful: 1 }, hits: { max_score: null, hits } }))
    const chunkSize = 1024
    const totalChunks = Math.ceil(body.length / chunkSize)
    let pulled = 0
    const stream = Readable.from((function * () {
      for (let i = 0; i < body.length; i += chunkSize) { pulled++; yield body.subarray(i, i + chunkSize) }
    })())
    const src = streamToSource(stream)
    // no pre-pump at all: creation must not consume the stream (Readable.from may prefetch a handful)
    assert.ok(pulled < totalChunks / 2, `streamToSource pre-pumped ${pulled}/${totalChunks} chunks`)
    let count = 0
    for await (const bulk of src.hits) count += bulk.length
    assert.equal(count, 500)
    const tail = await src.tail()
    assert.equal(tail.hits.total, undefined) // total legitimately absent — pipeline omits it from the body
    assert.deepEqual(tail.hits.hits, [])
  })
})
