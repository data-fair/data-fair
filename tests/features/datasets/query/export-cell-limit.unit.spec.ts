import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { truncateCells, MAX_CELL_LENGTH } from '../../../../api/src/datasets/threads/results2sheet.js'

test.describe('xlsx export - truncateCells', () => {
  test('truncates string cells over the limit and reports stats', () => {
    const big = 'x'.repeat(MAX_CELL_LENGTH + 100)
    const data = [
      ['label', 'geometry'],
      ['a', big],
      ['b', 'short']
    ]
    const stats = truncateCells(data)
    assert.equal(data[1][1].length, MAX_CELL_LENGTH)
    assert.equal(data[2][1], 'short')
    assert.equal(stats.count, 1)
    assert.deepEqual(stats.columns, ['geometry'])
  })

  test('leaves short strings, numbers, dates and nullish values untouched', () => {
    const data = [
      ['label', 'n', 'd'],
      ['ok', 12345, new Date('2020-01-01')],
      [undefined, null, 'x'.repeat(MAX_CELL_LENGTH)]
    ]
    const stats = truncateCells(data)
    assert.equal(stats.count, 0)
    assert.deepEqual(stats.columns, [])
    assert.equal(data[1][1], 12345)
    assert.equal(data[2][2].length, MAX_CELL_LENGTH)
  })

  test('never truncates the header row and dedupes columns', () => {
    const big = 'x'.repeat(MAX_CELL_LENGTH + 1)
    const longHeader = 'h'.repeat(MAX_CELL_LENGTH + 1)
    const data = [
      [longHeader, 'geometry'],
      ['a', big],
      ['b', big]
    ]
    const stats = truncateCells(data)
    assert.equal(data[0][0].length, MAX_CELL_LENGTH + 1) // header untouched
    assert.equal(stats.count, 2)
    assert.deepEqual(stats.columns, ['geometry'])
  })
})
