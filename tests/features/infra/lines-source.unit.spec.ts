import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { bufferedSource } from '../../../api/src/datasets/routes/lines-source.ts'

test.describe('bufferedSource', () => {
  test('exposes total, iterable hits, tail envelope', async () => {
    const esResponse = { hits: { total: { value: 2 }, hits: [{ _id: 'a', _source: { x: 1 } }, { _id: 'b', _source: { x: 2 } }] }, aggregations: { g: { value: 9 } } }
    const src = bufferedSource(esResponse)
    assert.equal(src.total, 2)
    const got: any[] = []; for await (const h of src.hits) got.push(h._id)
    assert.deepEqual(got, ['a', 'b'])
    assert.deepEqual((await src.tail()).aggregations, { g: { value: 9 } })
  })
})
