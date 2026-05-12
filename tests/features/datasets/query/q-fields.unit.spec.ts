import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Q_SEARCH_FIELDS_THRESHOLD, hasManyQSearchFields } from '../../../../api/src/datasets/es/commons.js'

// a string column produces both a .text and a .text_standard inner field -> counts as 2
const stringFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 's' + i, type: 'string' }))
// an integer (or date) column produces only a .text_standard inner field -> counts as 1
const intFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 'i' + i, type: 'integer' }))
const boolFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 'b' + i, type: 'boolean' }))

test.describe('hasManyQSearchFields', () => {
  test('threshold is 30', () => {
    assert.equal(Q_SEARCH_FIELDS_THRESHOLD, 30)
  })
  test('counts .text and .text_standard separately', () => {
    // string columns have both -> 15 columns == 30 inner fields (not over), 16 == 32 (over)
    assert.equal(hasManyQSearchFields(stringFields(15)), false)
    assert.equal(hasManyQSearchFields(stringFields(16)), true)
    // integer/date columns have only .text_standard -> 30 columns == 30 (not over), 31 == 31 (over)
    assert.equal(hasManyQSearchFields(intFields(30)), false)
    assert.equal(hasManyQSearchFields(intFields(31)), true)
  })
  test('ignores fields with no text inner field, and _id', () => {
    assert.equal(hasManyQSearchFields([...stringFields(16), ...boolFields(50), { key: '_id', type: 'string' }]), true)
    assert.equal(hasManyQSearchFields([...stringFields(10), ...boolFields(50)]), false) // 20 inner fields
  })
  test('tolerates a missing schema', () => {
    assert.equal(hasManyQSearchFields(undefined), false)
    assert.equal(hasManyQSearchFields(null), false)
  })
})
