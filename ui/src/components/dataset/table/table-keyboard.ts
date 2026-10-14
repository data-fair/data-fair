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
