# XLSX export cell-limit handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop xlsx exports from crashing on cells over Excel's 32,767-char limit by truncating the offending cells and recording a note in the metadata sheet.

**Architecture:** All export logic lives in the Piscina worker thread `api/src/datasets/threads/results2sheet.js`. We add a pure, unit-tested `truncateCells` helper, call it on the data sheet (and defensively on the auxiliary sheets) only when `bookType !== 'ods'`, and append a templated note row to the metadata sheet when truncation occurred. Two new i18n keys carry the note's label and message.

**Tech Stack:** Node ESM, `@e965/xlsx`, Piscina worker threads, Playwright test runner (`@playwright/test`) for both unit (`*.unit.spec.ts`) and API (`*.api.spec.ts`) tests.

Reference spec: `docs/superpowers/specs/2026-06-01-xlsx-export-cell-limit-design.md`

---

### Task 1: Pure `truncateCells` helper

**Files:**
- Modify: `api/src/datasets/threads/results2sheet.js` (add exports near the top, after the `XLSX` require on line 7)
- Test: `tests/features/datasets/query/export-cell-limit.unit.spec.ts` (create)

- [ ] **Step 1: Write the failing unit test**

Create `tests/features/datasets/query/export-cell-limit.unit.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/features/datasets/query/export-cell-limit.unit.spec.ts`
Expected: FAIL — `truncateCells`/`MAX_CELL_LENGTH` are not exported (import is undefined).

- [ ] **Step 3: Implement the helper**

In `api/src/datasets/threads/results2sheet.js`, immediately after line 7 (`const XLSX = require('@e965/xlsx')`), add:

```js
// Excel hard limit: a cell may not hold more than 32767 characters.
export const MAX_CELL_LENGTH = 32767

// Truncates string cells longer than MAX_CELL_LENGTH, in place. Skips the header
// row (row 0). Only strings can exceed the limit, so numbers/dates/nullish are
// ignored. The per-cell cost is a single O(1) length comparison; slice() runs
// only in the rare over-limit case.
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/query/export-cell-limit.unit.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/threads/results2sheet.js tests/features/datasets/query/export-cell-limit.unit.spec.ts
git commit -m "feat(export): add truncateCells helper for xlsx cell limit"
```

---

### Task 2: i18n note label + message

**Files:**
- Modify: `api/i18n/messages/en.json:90` (the `sheets` block, after the `"q"` key)
- Modify: `api/i18n/messages/fr.json:90` (the `sheets` block, after the `"q"` key)

- [ ] **Step 1: Add the English keys**

In `api/i18n/messages/en.json`, the `sheets` block currently ends:

```json
		"select": "Selected columns",
		"sort": "Sort",
		"q": "Text search"
	},
```

Change the `"q"` line to add a trailing comma and two new keys:

```json
		"select": "Selected columns",
		"sort": "Sort",
		"q": "Text search",
		"truncated": "Truncated cells",
		"truncatedValue": "{count} cell(s) exceeding Excel's limit of 32767 characters were truncated. Affected columns: {columns}."
	},
```

- [ ] **Step 2: Add the French keys**

In `api/i18n/messages/fr.json`, the `sheets` block currently ends:

```json
		"select": "Colonnes sélectionnées",
		"sort": "Tri",
		"q": "Recherche textuelle"
	},
```

Change the `"q"` line to add a trailing comma and two new keys:

```json
		"select": "Colonnes sélectionnées",
		"sort": "Tri",
		"q": "Recherche textuelle",
		"truncated": "Cellules tronquées",
		"truncatedValue": "{count} cellule(s) dépassant la limite Excel de 32767 caractères ont été tronquées. Colonnes concernées : {columns}."
	},
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('api/i18n/messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('api/i18n/messages/fr.json','utf8')); console.log('ok')"`
Expected: prints `ok` (no JSON parse error).

- [ ] **Step 4: Commit**

```bash
git add api/i18n/messages/en.json api/i18n/messages/fr.json
git commit -m "feat(export): add i18n for xlsx truncation note"
```

---

### Task 3: Wire truncation into the export builder + metadata note

**Files:**
- Modify: `api/src/datasets/threads/results2sheet.js` (the `export default` builder: data sheet around lines 41-43, metadata sheet around lines 50-95, schema/labels/query sheets around lines 114-144)
- Test: `tests/features/datasets/query/export-cell-limit.api.spec.ts` (create)

- [ ] **Step 1: Write the failing API test**

Create `tests/features/datasets/query/export-cell-limit.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const require = createRequire(import.meta.url)
const XLSX = require('@e965/xlsx')

const MAX = 32767
const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('xlsx export - cell limit', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('truncates over-long cells in xlsx and notes it in metadata, keeps ods intact', async () => {
    const ax = testUser1
    const big = 'x'.repeat(MAX + 5000)
    await ax.post('/api/v1/datasets/cell-limit', {
      isRest: true,
      title: 'cell limit',
      schema: [{ key: 'label', type: 'string' }, { key: 'big', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/cell-limit/lines', { label: 'a', big })
    await waitForFinalize(ax, 'cell-limit')

    // xlsx: 200, data cell truncated to the limit, metadata note present
    const xlsxRes = await ax.get('/api/v1/datasets/cell-limit/lines?format=xlsx', { responseType: 'arraybuffer' })
    assert.equal(xlsxRes.status, 200)
    const wb = XLSX.read(Buffer.from(xlsxRes.data), { type: 'buffer' })
    const dataRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    // header row 0: ['label','big']; first data row 1; 'big' is column index 1
    assert.equal(dataRows[1][1].length, MAX)
    const metaRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1 })
    const truncatedRow = metaRows.find((r) => r[0] === 'truncated')
    assert.ok(truncatedRow, 'metadata sheet should contain a "truncated" row')
    assert.ok(truncatedRow[2].includes('big'), 'note should mention the affected column')

    // ods: 200, full value preserved (no per-cell limit)
    const odsRes = await ax.get('/api/v1/datasets/cell-limit/lines?format=ods', { responseType: 'arraybuffer' })
    assert.equal(odsRes.status, 200)
    const odsWb = XLSX.read(Buffer.from(odsRes.data), { type: 'buffer' })
    const odsRows = XLSX.utils.sheet_to_json(odsWb.Sheets[odsWb.SheetNames[0]], { header: 1 })
    assert.equal(odsRows[1][1].length, MAX + 5000)
    const odsMeta = XLSX.utils.sheet_to_json(odsWb.Sheets[odsWb.SheetNames[1]], { header: 1 })
    assert.ok(!odsMeta.find((r) => r[0] === 'truncated'), 'ods must not get a truncation note')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/features/datasets/query/export-cell-limit.api.spec.ts`
Expected: FAIL — currently the xlsx request 500s (`Text length must not exceed 32767 characters`), so the status assertion / parse fails.

- [ ] **Step 3: Truncate the data sheet (xlsx only)**

In `results2sheet.js`, locate the data sheet block (currently lines 41-43):

```js
  const dataSheet = XLSX.utils.aoa_to_sheet(dataArray, { cellDates: true })
  dataSheet['!cols'] = fitToColumn(dataArray)
  XLSX.utils.book_append_sheet(workbook, dataSheet, labels.data)
```

Replace it with (add the `truncate` flag + capture stats before building the sheet):

```js
  const truncate = bookType !== 'ods'
  const truncation = truncate ? truncateCells(dataArray) : { count: 0, columns: [] }
  const dataSheet = XLSX.utils.aoa_to_sheet(dataArray, { cellDates: true })
  dataSheet['!cols'] = fitToColumn(dataArray)
  XLSX.utils.book_append_sheet(workbook, dataSheet, labels.data)
```

- [ ] **Step 4: Append the metadata note**

In `results2sheet.js`, find the metadata sheet build (currently lines 93-95):

```js
  const metadataSheet = XLSX.utils.aoa_to_sheet(metadataArray, { cellDates: true })
  metadataSheet['!cols'] = fitToColumn(metadataArray)
  XLSX.utils.book_append_sheet(workbook, metadataSheet, labels.metadata)
```

Insert the note row immediately before `aoa_to_sheet`, and defensively clamp this sheet too:

```js
  if (truncation.count > 0) {
    metadataArray.push([
      'truncated',
      labels.truncated,
      labels.truncatedValue
        .replace('{count}', truncation.count)
        .replace('{columns}', truncation.columns.join(', '))
    ])
  }
  if (truncate) truncateCells(metadataArray)
  const metadataSheet = XLSX.utils.aoa_to_sheet(metadataArray, { cellDates: true })
  metadataSheet['!cols'] = fitToColumn(metadataArray)
  XLSX.utils.book_append_sheet(workbook, metadataSheet, labels.metadata)
```

- [ ] **Step 5: Defensively clamp the remaining sheets (xlsx only)**

In `results2sheet.js`, add a `truncateCells` call before `aoa_to_sheet` for the schema, labels, and query sheets, so no value can crash the writer. The schema block (currently around line 114):

```js
  if (truncate) truncateCells(schemaArray)
  const schemaSheet = XLSX.utils.aoa_to_sheet(schemaArray, { cellDates: true })
```

The labels block (currently around line 129):

```js
  if (truncate) truncateCells(labelsArray)
  const labelsSheet = XLSX.utils.aoa_to_sheet(labelsArray, { cellDates: true })
```

The query block (currently around line 142):

```js
  if (truncate) truncateCells(queryArray)
  const querySheet = XLSX.utils.aoa_to_sheet(queryArray, { cellDates: true })
```

- [ ] **Step 6: Run the API test to verify it passes**

Run: `npx playwright test tests/features/datasets/query/export-cell-limit.api.spec.ts`
Expected: PASS.

- [ ] **Step 7: Run the existing export test to verify no regression**

Run: `npx playwright test tests/features/datasets/query/search-basic.api.spec.ts`
Expected: PASS (the existing `format=xlsx` / `format=ods` assertions still hold).

- [ ] **Step 8: Lint and type-check the changed files**

Run: `npm run lint && npm run check-types`
Expected: lint passes. (Note: `check-types` is pre-existingly broken in this repo with ~1796 errors — confirm you introduce no *new* errors in the files you touched rather than expecting a clean run.)

- [ ] **Step 9: Commit**

```bash
git add api/src/datasets/threads/results2sheet.js tests/features/datasets/query/export-cell-limit.api.spec.ts
git commit -m "fix(export): truncate over-long cells in xlsx export with metadata note"
```

---

## Self-Review notes

- **Spec coverage:** truncate-and-produce-file (Task 3 steps 3-5), metadata note (Task 3 step 4 + Task 2 i18n), xlsx-only gating (`truncate = bookType !== 'ods'`, Task 3), defensive aux-sheet clamp (Task 3 step 5), unit test of pure helper (Task 1), API test incl. ODS-intact assertion (Task 3 step 1). All spec sections map to a task.
- **Type consistency:** `truncateCells(dataArray) => { count, columns: string[] }` and `MAX_CELL_LENGTH` are used identically across Tasks 1 and 3. i18n keys `truncated` / `truncatedValue` defined in Task 2 are consumed verbatim in Task 3 step 4.
- **No placeholders:** every code/step block is concrete.
