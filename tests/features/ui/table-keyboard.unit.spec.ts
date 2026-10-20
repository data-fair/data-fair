import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { nextPosition, nextCardPosition } from '../../../ui/src/components/dataset/table/table-keyboard.ts'

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

// 10 cards of 3 fields, 4 cards per visual row: cards 0-3, 4-7, 8-9
const cardBounds = { cards: 10, fields: 3, perRow: 4 }

test.describe('card list keyboard nextCardPosition', () => {
  test('ArrowUp and ArrowDown move between the fields, then to the card above or below', () => {
    assert.deepEqual(nextCardPosition({ card: 1, field: 0 }, key('ArrowDown'), cardBounds), { card: 1, field: 1 })
    assert.deepEqual(nextCardPosition({ card: 1, field: 2 }, key('ArrowDown'), cardBounds), { card: 5, field: 0 })
    assert.deepEqual(nextCardPosition({ card: 5, field: 0 }, key('ArrowUp'), cardBounds), { card: 1, field: 2 })
    assert.deepEqual(nextCardPosition({ card: 5, field: 1 }, key('ArrowUp'), cardBounds), { card: 5, field: 0 })
  })

  test('ArrowLeft and ArrowRight move to the previous or next card, on the same field', () => {
    assert.deepEqual(nextCardPosition({ card: 3, field: 1 }, key('ArrowRight'), cardBounds), { card: 4, field: 1 })
    assert.deepEqual(nextCardPosition({ card: 4, field: 1 }, key('ArrowLeft'), cardBounds), { card: 3, field: 1 })
  })

  test('the moves stop at the edges, a last row with fewer cards included', () => {
    assert.deepEqual(nextCardPosition({ card: 0, field: 0 }, key('ArrowUp'), cardBounds), { card: 0, field: 0 })
    assert.deepEqual(nextCardPosition({ card: 0, field: 0 }, key('ArrowLeft'), cardBounds), { card: 0, field: 0 })
    assert.deepEqual(nextCardPosition({ card: 9, field: 1 }, key('ArrowRight'), cardBounds), { card: 9, field: 1 })
    assert.deepEqual(nextCardPosition({ card: 9, field: 2 }, key('ArrowDown'), cardBounds), { card: 9, field: 2 })
    // no card below card 7: the last card is the closest one
    assert.deepEqual(nextCardPosition({ card: 7, field: 2 }, key('ArrowDown'), cardBounds), { card: 9, field: 0 })
  })

  test('Home and End go to the ends of the card, with Ctrl to the first and last field', () => {
    assert.deepEqual(nextCardPosition({ card: 5, field: 1 }, key('Home'), cardBounds), { card: 5, field: 0 })
    assert.deepEqual(nextCardPosition({ card: 5, field: 1 }, key('End'), cardBounds), { card: 5, field: 2 })
    assert.deepEqual(nextCardPosition({ card: 5, field: 1 }, key('Home', true), cardBounds), { card: 0, field: 0 })
    assert.deepEqual(nextCardPosition({ card: 5, field: 1 }, key('End', true), cardBounds), { card: 9, field: 2 })
  })

  test('PageUp and PageDown move by a row of cards, clamped', () => {
    assert.deepEqual(nextCardPosition({ card: 1, field: 1 }, key('PageDown'), cardBounds), { card: 5, field: 1 })
    assert.deepEqual(nextCardPosition({ card: 7, field: 1 }, key('PageDown'), cardBounds), { card: 9, field: 1 })
    assert.deepEqual(nextCardPosition({ card: 2, field: 1 }, key('PageUp'), cardBounds), { card: 0, field: 1 })
  })

  test('other keys are not handled, a position outside shrunk bounds is clamped first', () => {
    assert.equal(nextCardPosition({ card: 1, field: 1 }, key('Enter'), cardBounds), null)
    assert.deepEqual(nextCardPosition({ card: 50, field: 9 }, key('ArrowLeft'), cardBounds), { card: 8, field: 2 })
  })
})
