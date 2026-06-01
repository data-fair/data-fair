# XLSX export: graceful handling of Excel's 32,767-char cell limit

Date: 2026-06-01
Branch: `fix-xlsx-export-size`

## Problem

Exporting dataset lines as xlsx (`GET /api/v1/datasets/:id/lines?format=xlsx`) sometimes
crashes with:

```
Text length must not exceed 32767 characters
```

This is Excel's hard per-cell limit, enforced by the `@e965/xlsx` writer. The realistic
trigger is a large value in a data cell — typically a long GeoJSON geometry (e.g. a
multi-line). The export runs in a Piscina worker thread
(`api/src/datasets/threads/results2sheet.js`); the throw propagates up through
`results2sheet()` (`api/src/datasets/utils/outputs.js`) to the router
(`api/src/datasets/router.js:986`) with no special handling, surfacing as a generic 500.

The limit itself is unavoidable. The goal is to handle it gracefully instead of crashing.

## Decisions (agreed in brainstorming)

1. **Truncate + warn** — truncate over-long cells so the file is always produced, and
   record a warning. No 500, no abort.
2. **Warning location: metadata sheet only** — a note row in the existing "metadata"
   sheet (sheet 2). No HTTP response header, no inline cell marker.
3. **XLSX only** — ODS (OpenDocument) has no per-cell limit, so ODS exports are left
   untouched (full data preserved). Truncation is gated on `bookType !== 'ods'`.
4. **Defensive clamp on auxiliary sheets** — for xlsx, also clamp cells on the other
   sheets (metadata/schema/labels/query) so no value (e.g. a pathologically long
   description) can crash the writer. These do not contribute to the reported note.

## Performance

This is a hot path, so the truncation must add negligible cost:

- **Gated on format**: the whole step runs only when `bookType !== 'ods'`; ODS pays zero
  cost.
- **Cheap per-cell work**: the only per-cell operation is
  `typeof value === 'string' && value.length > MAX_CELL_LENGTH` — an O(1) length
  comparison on an already-materialized string, with no allocation. `slice()` runs only
  in the rare over-limit case.
- **No heavy new work**: one O(n) pass of integer comparisons over the data cells. It is
  negligible relative to what the path already does per cell — notably `fitToColumn`'s
  `toLocaleString()` on every cell — and relative to `XLSX.write()` serialization, which
  dominates. The only extra allocation is a small `Set` of affected column names, bounded
  by the column count.
- The truncation is implemented as a single pure pass (`truncateCells`) so the exact
  production code is what the unit test exercises; the cost of that one pass is in the
  noise versus the existing passes.

## Design

All changes are contained in:
- `api/src/datasets/threads/results2sheet.js` (the export thread)
- `api/i18n/messages/en.json` and `api/i18n/messages/fr.json` (the `sheets` block)
- tests

### 1. Constant + pure helper (new, exported for unit test)

In `results2sheet.js`:

```js
export const MAX_CELL_LENGTH = 32767

// Truncates string cells longer than MAX_CELL_LENGTH, in place.
// Skips the header row (row 0). Returns truncation stats.
// Only strings can exceed the limit; numbers/dates are ignored.
// @returns {{ count: number, columns: string[] }}
export const truncateCells = (dataArray) => {
  let count = 0
  const columns = new Set()
  const header = dataArray[0]
  for (let r = 1; r < dataArray.length; r++) {
    const row = dataArray[r]
    for (let c = 0; c < row.length; c++) {
      const v = row[c]
      if (typeof v === 'string' && v.length > MAX_CELL_LENGTH) {
        row[c] = v.slice(0, MAX_CELL_LENGTH)
        count++
        columns.add(header[c])
      }
    }
  }
  return { count, columns: [...columns] }
}
```

The header row holds column display names (`prop['x-originalName'] || prop.key`), so
`columns` reports user-facing names.

### 2. Wiring in the default export

In the builder (`export default (...)`):

- Compute `const truncate = bookType !== 'ods'`.
- After `dataArray` is built and before `aoa_to_sheet`, if `truncate`, call
  `const truncation = truncateCells(dataArray)` and keep `truncation`.
- For the auxiliary sheets (metadata/schema/labels/query), if `truncate`, run
  `truncateCells` on each of their arrays as a defensive safety net (tiny arrays, no
  meaningful perf cost). Their return values are ignored — they do not feed the note.
- The data sheet is built first, so `truncation` is known by the time the metadata sheet
  is assembled.

### 3. Metadata-sheet note

When `truncate && truncation.count > 0`, append one row to `metadataArray` (before
`aoa_to_sheet` for the metadata sheet):

```js
metadataArray.push([
  'truncated',
  labels.truncated,
  labels.truncatedValue
    .replace('{count}', truncation.count)
    .replace('{columns}', truncation.columns.join(', '))
])
```

The row follows the same `[key, label, value]` shape as the rest of the metadata sheet.

### 4. i18n

Add two keys to the `sheets` block in both `en.json` and `fr.json`:

- `truncated` — the label (metaLabel column):
  - en: `"Truncated cells"`
  - fr: `"Cellules tronquées"`
- `truncatedValue` — the templated message (metaValue column):
  - en: `"{count} cell(s) exceeding Excel's limit of 32767 characters were truncated. Affected columns: {columns}."`
  - fr: `"{count} cellule(s) dépassant la limite Excel de 32767 caractères ont été tronquées. Colonnes concernées : {columns}."`

The thread does literal `{count}` / `{columns}` substitution (no i18n framework call
inside the thread; `labels` is the already-resolved `req.__('sheets')` object passed in).

## Error handling

No new error path is introduced. The previously-fatal over-long-cell condition becomes a
successful 200 response with a truncation note in the metadata sheet.

## Testing

### Unit test (pure function)

Target `truncateCells` directly (no Piscina/config needed):

- A string of length > 32767 is truncated to exactly 32767; `count` and `columns` report
  it (column name taken from the header row).
- Strings ≤ 32767, numbers, dates, `undefined`/`null` are left untouched.
- The header row (row 0) is never truncated.
- Multiple over-long cells in the same column report that column once; cells in different
  columns report each column.

### API test (new spec)

`tests/features/datasets/.../export-cell-limit.api.spec.ts` (final location follows
existing conventions, e.g. alongside `query/search-basic.api.spec.ts`):

- Create a dataset with a field whose value exceeds 32767 characters.
- `GET ...?format=xlsx` → 200 (not 500). Parse the returned buffer with `@e965/xlsx`:
  - the offending data cell is exactly 32767 characters;
  - the metadata sheet contains a row whose key is `truncated` and whose value mentions
    the affected column.
- `GET ...?format=ods` → 200, and the same cell retains its full (> 32767) length,
  confirming ODS is not truncated.

## Out of scope

- Changing the per-cell limit or the writer library.
- HTTP response headers or inline cell markers for the warning (explicitly excluded).
- Refactoring the existing `fitToColumn` / build passes for performance.
