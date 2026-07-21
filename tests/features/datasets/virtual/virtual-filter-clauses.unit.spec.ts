import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { virtualFilterClauses, descendantsFilterClause } from '../../../../api/src/datasets/es/operations.ts'

test.describe('virtualFilterClauses', () => {
  test('translates in/nin filters to term/terms clauses', () => {
    assert.deepEqual(virtualFilterClauses([{ key: 'id', values: ['a'] }]), [{ term: { id: 'a' } }])
    assert.deepEqual(virtualFilterClauses([{ key: 'id', values: ['a', 'b'] }]), [{ terms: { id: ['a', 'b'] } }])
    assert.deepEqual(virtualFilterClauses([{ key: 'id', operator: 'nin', values: ['a'] }]),
      [{ bool: { must_not: { term: { id: 'a' } } } }])
    assert.deepEqual(virtualFilterClauses([{ key: 'id', operator: 'nin', values: ['a', 'b'] }]),
      [{ bool: { must_not: { terms: { id: ['a', 'b'] } } } }])
  })

  test('skips filters without values', () => {
    assert.deepEqual(virtualFilterClauses([{ key: 'id', values: [] }, { key: 'id' }]), [])
  })
})

test.describe('descendantsFilterClause', () => {
  test('builds a should clause with unfiltered terms and per-descendant filtered clauses', () => {
    const clause = descendantsFilterClause({
      indicesPrefix: 'dataset',
      unfilteredIds: ['ds1', 'ds2'],
      filtered: [{ id: 'ds3', filters: [{ key: 'id', values: ['koumoul'] }] }]
    })
    assert.deepEqual(clause, {
      bool: {
        minimum_should_match: 1,
        should: [
          { terms: { _index: ['dataset-ds1', 'dataset-ds2'] } },
          { bool: { filter: [{ term: { _index: 'dataset-ds3' } }, { term: { id: 'koumoul' } }] } }
        ]
      }
    })
  })

  test('omits the unfiltered clause when every descendant is filtered', () => {
    const clause = descendantsFilterClause({
      indicesPrefix: 'dataset',
      unfilteredIds: [],
      filtered: [{ id: 'ds1', filters: [{ key: 'id', values: ['a', 'b'] }] }]
    })
    assert.deepEqual(clause.bool.should, [
      { bool: { filter: [{ term: { _index: 'dataset-ds1' } }, { terms: { id: ['a', 'b'] } }] } }
    ])
  })
})
