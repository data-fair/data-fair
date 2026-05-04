import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { computeModified } from '../../../api/src/datasets/utils/compute-modified.ts'

test.describe('computeModified', () => {
  test('returns updatedAt when only updatedAt is set', () => {
    assert.equal(
      computeModified({ updatedAt: '2026-01-15T10:00:00.000Z' }),
      '2026-01-15T10:00:00.000Z'
    )
  })

  test('returns dataUpdatedAt when set, ignoring updatedAt', () => {
    assert.equal(
      computeModified({
        updatedAt: '2026-02-20T10:00:00.000Z',
        dataUpdatedAt: '2026-02-15T10:00:00.000Z'
      }),
      '2026-02-15T10:00:00.000Z'
    )
  })

  test('returns modified expanded to ISO date-time when set, ignoring others', () => {
    assert.equal(
      computeModified({
        modified: '2026-03-10',
        dataUpdatedAt: '2026-02-15T10:00:00.000Z',
        updatedAt: '2026-02-20T10:00:00.000Z'
      }),
      '2026-03-10T00:00:00.000Z'
    )
  })

  test('handles modified already as full date-time string', () => {
    assert.equal(
      computeModified({ modified: '2026-03-10T08:30:00.000Z', updatedAt: '2026-02-20T10:00:00.000Z' }),
      '2026-03-10T08:30:00.000Z'
    )
  })

  test('returns undefined when none of the three are set', () => {
    assert.equal(computeModified({}), undefined)
  })

  test('treats empty-string modified as unset (DCAT field cleared)', () => {
    assert.equal(
      computeModified({ modified: '', updatedAt: '2026-02-20T10:00:00.000Z' }),
      '2026-02-20T10:00:00.000Z'
    )
  })

  test('treats null modified as unset', () => {
    assert.equal(
      computeModified({ modified: null, updatedAt: '2026-02-20T10:00:00.000Z' }),
      '2026-02-20T10:00:00.000Z'
    )
  })
})
