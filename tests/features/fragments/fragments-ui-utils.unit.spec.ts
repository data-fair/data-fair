import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { pickerPartOf } from '../../../ui/src/utils/fragments.ts'

test.describe('fragments ui utils', () => {
  test('pickerPartOf: own fragments for a parent, siblings for a fragment', () => {
    assert.equal(pickerPartOf('application', { id: 'a' }), 'false,application:a')
    assert.equal(pickerPartOf('dataset', { id: 'v' }), 'false,dataset:v')
    assert.equal(pickerPartOf('application', { id: 'sub', partOf: { type: 'application', id: 'a' } }), 'false,application:a')
  })
})
