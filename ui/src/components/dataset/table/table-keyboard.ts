// Keyboard navigation between the cells of the dataset table (RGAA 7.3), pure part.
// Row 0 is the header row, data rows are 1..rows-1.

export type CellPosition = { row: number, col: number }
export type GridBounds = { rows: number, cols: number, pageRows: number }

const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max))

/** The cell a key moves to, or null when the key is not a navigation key. */
export function nextPosition (pos: CellPosition, event: { key: string, ctrlKey: boolean }, bounds: GridBounds): CellPosition | null {
  const lastRow = bounds.rows - 1
  const lastCol = bounds.cols - 1
  // the results may have shrunk since the position was taken (new search, sort)
  const row = clamp(pos.row, lastRow)
  const col = clamp(pos.col, lastCol)
  switch (event.key) {
    case 'ArrowDown': return { row: clamp(row + 1, lastRow), col }
    case 'ArrowUp': return { row: clamp(row - 1, lastRow), col }
    case 'ArrowRight': return { row, col: clamp(col + 1, lastCol) }
    case 'ArrowLeft': return { row, col: clamp(col - 1, lastCol) }
    case 'Home': return event.ctrlKey ? { row: 0, col: 0 } : { row, col: 0 }
    case 'End': return event.ctrlKey ? { row: lastRow, col: lastCol } : { row, col: lastCol }
    case 'PageDown': return { row: clamp(row + bounds.pageRows, lastRow), col }
    case 'PageUp': return { row: clamp(row - bounds.pageRows, lastRow), col }
    default: return null
  }
}

// The same in the card list display: cards are laid out in rows of perRow cards, all with the
// same fields from top to bottom.
export type CardPosition = { card: number, field: number }
export type CardBounds = { cards: number, fields: number, perRow: number }

/** The card field a key moves to, or null when the key is not a navigation key. */
export function nextCardPosition (pos: CardPosition, event: { key: string, ctrlKey: boolean }, bounds: CardBounds): CardPosition | null {
  const lastCard = bounds.cards - 1
  const lastField = bounds.fields - 1
  const card = clamp(pos.card, lastCard)
  const field = clamp(pos.field, lastField)
  const rowOf = (c: number) => Math.floor(c / bounds.perRow)
  switch (event.key) {
    case 'ArrowDown': {
      if (field < lastField) return { card, field: field + 1 }
      // the last row may have fewer cards: its last one is the closest below
      const below = Math.min(card + bounds.perRow, lastCard)
      return rowOf(below) > rowOf(card) ? { card: below, field: 0 } : { card, field }
    }
    case 'ArrowUp': {
      if (field > 0) return { card, field: field - 1 }
      return card - bounds.perRow >= 0 ? { card: card - bounds.perRow, field: lastField } : { card, field }
    }
    case 'ArrowRight': return { card: clamp(card + 1, lastCard), field }
    case 'ArrowLeft': return { card: clamp(card - 1, lastCard), field }
    case 'Home': return event.ctrlKey ? { card: 0, field: 0 } : { card, field: 0 }
    case 'End': return event.ctrlKey ? { card: lastCard, field: lastField } : { card, field: lastField }
    case 'PageDown': return { card: clamp(card + bounds.perRow, lastCard), field }
    case 'PageUp': return { card: clamp(card - bounds.perRow, lastCard), field }
    default: return null
  }
}
