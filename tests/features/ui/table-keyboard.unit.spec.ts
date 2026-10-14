import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { nextPosition } from '../../../ui/src/components/dataset/table/table-keyboard.ts'

// row 0 is the header row, data rows are 1..rows-1
const bounds = { rows: 101, cols: 5, pageRows: 10 }
const key = (k: string, ctrlKey = false) => ({ key: k, ctrlKey })

test.describe('table keyboard nextPosition', () => {
  test('arrows move by one cell', () => {
    assert.deepEqual(nextPosition({ row: 3, col: 2 }, key('ArrowDown'), bounds), { row: 4, col: 2 })
    assert.deepEqual(nextPosition({ row: 3, col: 2 }, key('ArrowUp'), bounds), { row: 2, col: 2 })
    assert.deepEqual(nextPosition({ row: 3, col: 2 }, key('ArrowRight'), bounds), { row: 3, col: 3 })
    assert.deepEqual(nextPosition({ row: 3, col: 2 }, key('ArrowLeft'), bounds), { row: 3, col: 1 })
  })

  test('arrows stop at the edges, the header row included', () => {
    assert.deepEqual(nextPosition({ row: 0, col: 0 }, key('ArrowUp'), bounds), { row: 0, col: 0 })
    assert.deepEqual(nextPosition({ row: 0, col: 0 }, key('ArrowLeft'), bounds), { row: 0, col: 0 })
    assert.deepEqual(nextPosition({ row: 100, col: 4 }, key('ArrowDown'), bounds), { row: 100, col: 4 })
    assert.deepEqual(nextPosition({ row: 100, col: 4 }, key('ArrowRight'), bounds), { row: 100, col: 4 })
  })

  test('Home and End go to the ends of the row, with Ctrl to the first and last cell', () => {
    assert.deepEqual(nextPosition({ row: 7, col: 2 }, key('Home'), bounds), { row: 7, col: 0 })
    assert.deepEqual(nextPosition({ row: 7, col: 2 }, key('End'), bounds), { row: 7, col: 4 })
    assert.deepEqual(nextPosition({ row: 7, col: 2 }, key('Home', true), bounds), { row: 0, col: 0 })
    assert.deepEqual(nextPosition({ row: 7, col: 2 }, key('End', true), bounds), { row: 100, col: 4 })
  })

  test('PageUp and PageDown move by a screen of rows, clamped', () => {
    assert.deepEqual(nextPosition({ row: 5, col: 1 }, key('PageDown'), bounds), { row: 15, col: 1 })
    assert.deepEqual(nextPosition({ row: 95, col: 1 }, key('PageDown'), bounds), { row: 100, col: 1 })
    assert.deepEqual(nextPosition({ row: 5, col: 1 }, key('PageUp'), bounds), { row: 0, col: 1 })
  })

  test('other keys are not handled', () => {
    assert.equal(nextPosition({ row: 1, col: 1 }, key('a'), bounds), null)
    assert.equal(nextPosition({ row: 1, col: 1 }, key('Enter'), bounds), null)
  })

  test('a position outside shrunk bounds is clamped first', () => {
    // results replaced by a search with fewer lines
    assert.deepEqual(nextPosition({ row: 50, col: 9 }, key('ArrowLeft'), { rows: 11, cols: 5, pageRows: 10 }), { row: 10, col: 3 })
  })
})
