import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { bufferedSource } from '../../../api/src/datasets/routes/lines-source.ts'

test.describe('bufferedSource', () => {
  test('bulk-iterable hits + tail envelope (total read from the tail, like the streamed source)', async () => {
    const esResponse = { hits: { total: { value: 2 }, hits: [{ _id: 'a', _source: { x: 1 } }, { _id: 'b', _source: { x: 2 } }] }, aggregations: { g: { value: 9 } } }
    const src = bufferedSource(esResponse)
    // hits yields BULKS (arrays): the buffered source yields its whole array as a single bulk
    const bulks: any[][] = []
    for await (const bulk of src.hits) bulks.push(bulk)
    assert.equal(bulks.length, 1)
    assert.deepEqual(bulks[0].map(h => h._id), ['a', 'b'])
    const tail = await src.tail()
    assert.equal(tail.hits.total?.value, 2)
    assert.deepEqual(tail.aggregations, { g: { value: 9 } })
  })

  test('empty response yields no bulk at all', async () => {
    const src = bufferedSource({ hits: { total: { value: 0 }, hits: [] } })
    let n = 0
    for await (const bulk of src.hits) n += bulk.length
    assert.equal(n, 0)
    assert.equal((await src.tail()).hits.total?.value, 0)
  })
})
