import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { foreignReferences, pickerPartOf } from '../../../ui/src/utils/fragments.ts'

test.describe('fragments ui utils', () => {
  test('pickerPartOf: own fragments for a parent, siblings for a fragment', () => {
    assert.equal(pickerPartOf('application', { id: 'a' }), 'false,application:a')
    assert.equal(pickerPartOf('dataset', { id: 'v' }), 'false,dataset:v')
    assert.equal(pickerPartOf('application', { id: 'sub', partOf: { type: 'application', id: 'a' } }), 'false,application:a')
  })

  test('foreignReferences: users outside the parent family', () => {
    const partOf = { type: 'application' as const, id: 'a' }
    const refs = [
      { type: 'application' as const, id: 'a' }, // the parent
      { type: 'application' as const, id: 'sibling', partOf: { type: 'application' as const, id: 'a' } },
      { type: 'application' as const, id: 'b' }, // another dashboard
      { type: 'application' as const, id: 'c', partOf: { type: 'application' as const, id: 'b' } }, // a fragment of another one
      { type: 'dataset' as const, id: 'a' } // a virtual dataset that happens to share the parent id
    ]
    assert.deepEqual(foreignReferences(partOf, refs).map(r => r.type + ':' + r.id), ['application:b', 'application:c', 'dataset:a'])
    assert.deepEqual(foreignReferences(partOf, refs.slice(0, 2)), [])
  })
})
