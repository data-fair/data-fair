import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { mergeActivity } from '../../../api/src/activity/operations.ts'

test.describe('mergeActivity', () => {
  test('tags each item with its type and renames updatedAt to date', () => {
    const results = mergeActivity(
      [{ id: 'd1', title: 'Dataset 1', updatedAt: '2026-01-02' }],
      [{ id: 'a1', title: 'App 1', updatedAt: '2026-01-01' }],
      10
    )
    assert.deepEqual(results, [
      { id: 'd1', title: 'Dataset 1', type: 'dataset', date: '2026-01-02' },
      { id: 'a1', title: 'App 1', type: 'application', date: '2026-01-01' }
    ])
  })

  test('sorts datasets and applications together by date descending', () => {
    const results = mergeActivity(
      [{ id: 'd1', updatedAt: '2026-01-01' }, { id: 'd2', updatedAt: '2026-03-01' }],
      [{ id: 'a1', updatedAt: '2026-02-01' }],
      10
    )
    assert.deepEqual(results.map(r => r.id), ['d2', 'a1', 'd1'])
  })

  test('limits the merged feed to size', () => {
    const results = mergeActivity(
      [{ id: 'd1', updatedAt: '2026-01-03' }, { id: 'd2', updatedAt: '2026-01-02' }],
      [{ id: 'a1', updatedAt: '2026-01-01' }],
      2
    )
    assert.equal(results.length, 2)
    assert.deepEqual(results.map(r => r.id), ['d1', 'd2'])
  })
})
