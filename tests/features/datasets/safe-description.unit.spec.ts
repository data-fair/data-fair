import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { safeDescription, safeSchema } from '../../../api/src/datasets/operations.ts'

test.describe('safeDescription', () => {
  test('keeps the metadata, flags the result and drops anything else', () => {
    const safe = safeDescription({
      id: 'ds',
      title: 'A dataset',
      isRest: true,
      rest: { lineOwnership: true },
      userPermissions: ['readSafeDescription'],
      count: 4,
      bbox: [0, 0, 1, 1],
      finalizedAt: '2026-01-01T00:00:00Z',
      someFutureDataDerivedField: 42,
      schema: [{ key: 'col1', type: 'string', title: 'Col 1', enum: ['a', 'b'], 'x-cardinality': 2 }]
    })
    assert.deepEqual(safe, {
      id: 'ds',
      title: 'A dataset',
      isRest: true,
      rest: { lineOwnership: true },
      userPermissions: ['readSafeDescription'],
      schema: [{ key: 'col1', type: 'string', title: 'Col 1' }],
      safe: true
    })
  })

  test('safeSchema does not mutate its input', () => {
    const schema = [{ key: 'col1', type: 'string', enum: ['a'], 'x-cardinality': 1 }]
    assert.deepEqual(safeSchema(schema), [{ key: 'col1', type: 'string' }])
    assert.deepEqual(schema[0].enum, ['a'])
  })
})
