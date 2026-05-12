# Extension validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `mandatory` flag on dataset extensions, generate a downloadable validation diagnostic file for file datasets, run mandatory extensions in-memory before MongoDB upsert for editable datasets, and reject oversized async bulk writes when a mandatory extension is configured.

**Architecture:** Two phases for file datasets stay separate (`validate-file.ts` then `extend.ts`); both phases share a new `DiagnosticWriter` that owns the lifecycle of one CSV file at `validationDiagnosticFilePath(dataset)`. For REST datasets, a synchronous `extendBatchSync` is extracted from the existing `ExtensionsStream` and invoked from `applyReqTransactions` between AJV validation and MongoDB bulk write when a mandatory extension is active. A new download endpoint exposes the file. Notifications and journal events reuse the existing `validation-error` event type, augmented with a `hasDiagnosticFile` flag.

**Tech Stack:** Node.js (TS + JS), Express, MongoDB, ElasticSearch, Vue 3 + Vuetify, Playwright (tests), filesStorage abstraction.

**Spec:** `docs/superpowers/specs/2026-04-29-extension-validation-design.md`.

---

## File Structure

### Files to create
- `api/src/datasets/utils/diagnostic-file.ts` — `DiagnosticWriter` class.
- `tests/features/datasets/validation-diagnostic.api.spec.ts` — integration tests for diagnostic file lifecycle and content (file dataset).
- `tests/features/datasets/extensions/extensions-mandatory.api.spec.ts` — integration tests for mandatory extensions on file and REST datasets.

### Files to modify
- `api/types/dataset/schema.js` (extensions array, lines 509–602) — add `mandatory` boolean.
- `api/types/dataset/index.d.ts` — regenerated from `schema.js` (typically by `npm run build-types`).
- `api/src/datasets/utils/files.ts` — add `validationDiagnosticFilePath()`.
- `api/src/datasets/utils/extensions.ts` — extract `extendBatchSync`, route exprEval errors through a per-row `onLineError(i, err)` callback instead of throwing, route remoteService `errorKey` results to the same callback when configured.
- `api/src/workers/batch-processor/validate-file.ts` — collect all errors, instantiate a `DiagnosticWriter`, journal `hasDiagnosticFile` flag, send notification.
- `api/src/workers/batch-processor/extend.ts` — instantiate `DiagnosticWriter`, propagate to `extend()`, throw `[noretry]` if any mandatory extension produced errors.
- `api/src/datasets/utils/rest.ts` — `applyReqTransactions` invokes `extendBatchSync` between AJV and MongoDB bulk write when at least one mandatory extension is active; bulk handler returns 400 when `contentLength > maxBulkChars` and a mandatory extension exists.
- `api/src/datasets/router.js` — `GET /:datasetId/validation-diagnostic.csv` route.
- `api/src/datasets/service.js` — in `cancelDraft`, remove the diagnostic file (existing draft-dir cleanup may already cover it; verify).
- `api/i18n/messages/fr.json` and `api/i18n/messages/en.json` — add `notifications.datasets.validation-error` (+ draft variant) keys.
- `ui/src/components/dataset/extension/dataset-extension-remote-service-card.vue` — mandatory toggle.
- `ui/src/components/dataset/extension/dataset-extension-expr-eval-card.vue` — mandatory toggle.
- `ui/src/components/journal-view.vue` — render diagnostic-download link when `event.hasDiagnosticFile === true`.

---

## Conventions

- File datasets and REST datasets share the same `mandatory` flag semantics, but the runtime path differs: file uses workers, REST uses the request hot path.
- A `mandatory` flag on a deactivated extension (`active: false`) is ignored — only `active && mandatory` extensions enforce.
- The CSV diagnostic file uses `;` as separator (consistent with the project's CSV defaults — verify by reading `data-streams.js` if needed; if `,` is the default, use `,`). UTF-8 with BOM for Excel compatibility.

---

## Task 1: Add `mandatory` to extension schema and types

**Files:**
- Modify: `api/types/dataset/schema.js:509-602`
- Modify: `api/types/dataset/index.d.ts` (regenerated)

- [ ] **Step 1: Read existing extensions schema**

Read `api/types/dataset/schema.js` lines 505–605 to confirm the structure.

- [ ] **Step 2: Add the `mandatory` property**

In `api/types/dataset/schema.js`, inside `extensions.items.properties` (around line 514), add after the `active` property:

```js
mandatory: {
  type: 'boolean',
  description: 'Si vrai, un échec d\'enrichissement sur une ligne est traité comme une erreur de validation.'
},
```

Place it right after `active` for grouping. Keep `oneOf` untouched.

- [ ] **Step 3: Regenerate type definitions**

Run: `npm run build-types`
Expected: regenerated `api/types/dataset/index.d.ts` includes `mandatory?: boolean` on the extension item type.

- [ ] **Step 4: Verify type build**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/types/dataset/schema.js api/types/dataset/index.d.ts
git commit -m "feat(types): add mandatory flag on dataset extensions"
```

---

## Task 2: Add `validationDiagnosticFilePath` helper

**Files:**
- Modify: `api/src/datasets/utils/files.ts` (after `fullFilePath`, around line 58)

- [ ] **Step 1: Write the failing test**

Create `api/test/utils/files-validation-diagnostic.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { validationDiagnosticFilePath } from '../../src/datasets/utils/files.ts'

test('validationDiagnosticFilePath returns a path under dataFilesDir', () => {
  const dataset: any = {
    owner: { type: 'user', id: 'u1' },
    id: 'ds1'
  }
  const p = validationDiagnosticFilePath(dataset)
  assert.match(p, /datasets\/ds1\/data-files\/validation-diagnostic\.csv$/)
})

test('validationDiagnosticFilePath uses draft sub-tree when in draft mode', () => {
  const dataset: any = {
    owner: { type: 'user', id: 'u1' },
    id: 'ds1',
    draftReason: { key: 'file-new' }
  }
  const p = validationDiagnosticFilePath(dataset)
  assert.match(p, /datasets-drafts\/ds1\/data-files\/validation-diagnostic\.csv$/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test api/test/utils/files-validation-diagnostic.spec.ts`
Expected: FAIL — `validationDiagnosticFilePath is not exported from files.ts`.

- [ ] **Step 3: Add the helper**

In `api/src/datasets/utils/files.ts`, after the `fullFilePath` export (around line 58):

```ts
export const validationDiagnosticFilePath = (dataset: any) => {
  return resolvePath(dataFilesDir(dataset), 'validation-diagnostic.csv')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test api/test/utils/files-validation-diagnostic.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/utils/files.ts api/test/utils/files-validation-diagnostic.spec.ts
git commit -m "feat: add validationDiagnosticFilePath helper"
```

---

## Task 3: Create `DiagnosticWriter` module

**Files:**
- Create: `api/src/datasets/utils/diagnostic-file.ts`
- Create: `api/test/utils/diagnostic-writer.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `api/test/utils/diagnostic-writer.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import path from 'node:path'
import os from 'node:os'
import { DiagnosticWriter } from '../../src/datasets/utils/diagnostic-file.ts'
import filesStorage from '../../src/files-storage/index.ts' // adjust to actual import

test.describe('DiagnosticWriter', () => {
  let dataset: any
  let dir: string

  test.beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diag-'))
    dataset = {
      owner: { type: 'user', id: 'u1' },
      id: 'ds-' + Date.now()
    }
  })

  test('finalize writes a CSV with header and rows when errors were added', async () => {
    const w = new DiagnosticWriter(dataset)
    await w.addError({ line: 5, type: 'validation', field: 'name', message: 'must be string', rawValue: '42' })
    await w.addError({ line: 9, type: 'extension', field: '_company', message: 'remote service: not found', rawValue: 'X' })
    const result = await w.finalize()
    assert.equal(result.count, 2)
    assert.equal(result.capped, false)
  })

  test('discard removes any pre-existing file at the path', async () => {
    const w1 = new DiagnosticWriter(dataset)
    await w1.addError({ line: 1, type: 'validation', field: 'a', message: 'x', rawValue: '' })
    await w1.finalize()
    const w2 = new DiagnosticWriter(dataset)
    await w2.discard()
    // expectation: filesStorage.pathExists(validationDiagnosticFilePath(dataset)) === false
  })

  test('caps at 10000 errors and reports capped:true', async () => {
    const w = new DiagnosticWriter(dataset)
    for (let i = 0; i < 10500; i++) {
      await w.addError({ line: i + 1, type: 'validation', field: 'k', message: 'm', rawValue: '' })
    }
    const result = await w.finalize()
    assert.equal(result.count, 10000)
    assert.equal(result.capped, true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test api/test/utils/diagnostic-writer.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `DiagnosticWriter`**

Create `api/src/datasets/utils/diagnostic-file.ts`:

```ts
import fs from 'fs-extra'
import path from 'node:path'
import filesStorage from '#files-storage'
import { tmpDir, validationDiagnosticFilePath } from './files.ts'
import type { Dataset } from '#types'

export type DiagnosticErrorType = 'validation' | 'extension'

export type DiagnosticErrorEntry = {
  line: number
  type: DiagnosticErrorType
  field: string
  message: string
  rawValue?: string
}

export const DIAGNOSTIC_FILE_CAP = 10000

export class DiagnosticWriter {
  private dataset: Dataset
  private targetPath: string
  private tmpPath: string
  private writeStream: fs.WriteStream | null = null
  private count = 0
  private capped = false
  private headerWritten = false

  constructor (dataset: Dataset) {
    this.dataset = dataset
    this.targetPath = validationDiagnosticFilePath(dataset)
    this.tmpPath = path.join(tmpDir, `validation-diagnostic-${dataset.id}-${Date.now()}.csv`)
  }

  private ensureStream () {
    if (this.writeStream) return
    fs.ensureDirSync(path.dirname(this.tmpPath))
    this.writeStream = fs.createWriteStream(this.tmpPath, { encoding: 'utf8' })
    // BOM for Excel
    this.writeStream.write('﻿')
    this.writeStream.write('line,error_type,field,message,raw_value\n')
    this.headerWritten = true
  }

  private csvEscape (v: string | undefined): string {
    if (v === undefined || v === null) return ''
    const s = String(v).replace(/"/g, '""')
    if (s.includes(',') || s.includes('\n') || s.includes('"')) return `"${s}"`
    return s
  }

  async addError (entry: DiagnosticErrorEntry) {
    if (this.count >= DIAGNOSTIC_FILE_CAP) {
      this.capped = true
      return
    }
    this.ensureStream()
    const truncated = entry.rawValue && entry.rawValue.length > 200
      ? entry.rawValue.slice(0, 200) + '…'
      : entry.rawValue
    const row = [
      entry.line,
      entry.type,
      this.csvEscape(entry.field),
      this.csvEscape(entry.message),
      this.csvEscape(truncated)
    ].join(',') + '\n'
    this.writeStream!.write(row)
    this.count += 1
  }

  /**
   * Persist the file (overwriting any prior diagnostic) if at least one error
   * was added. If no error was added, behaves like discard().
   */
  async finalize (): Promise<{ count: number, capped: boolean }> {
    if (!this.writeStream || this.count === 0) {
      await this.discard()
      return { count: 0, capped: false }
    }
    await new Promise<void>((resolve, reject) => {
      this.writeStream!.end((err: any) => err ? reject(err) : resolve())
    })
    await filesStorage.moveFromFs(this.tmpPath, this.targetPath)
    return { count: this.count, capped: this.capped }
  }

  /**
   * Close any open stream without persisting and remove a pre-existing
   * diagnostic file at the target path.
   */
  async discard (): Promise<void> {
    if (this.writeStream) {
      await new Promise<void>(resolve => this.writeStream!.end(() => resolve()))
      await fs.remove(this.tmpPath)
      this.writeStream = null
    }
    if (await filesStorage.pathExists(this.targetPath)) {
      await filesStorage.removeFile(this.targetPath)
    }
  }
}
```

Notes:
- The file is written to `tmpDir` first, then atomically moved via `filesStorage.moveFromFs` (matches existing pattern for `fullFilePath` in `extensions.ts:178`).
- `ensureStream` is lazy: if no error is added, no file is created.
- `discard()` always cleans the target — that's how a successful re-run clears stale diagnostic from a previous failed run.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test api/test/utils/diagnostic-writer.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/utils/diagnostic-file.ts api/test/utils/diagnostic-writer.spec.ts
git commit -m "feat: add DiagnosticWriter for validation diagnostic CSV"
```

---

## Task 4: Extract `extendBatchSync` and route per-row errors

**Files:**
- Modify: `api/src/datasets/utils/extensions.ts:251-410` (the `sendBuffer` method) and exports.

The goal is twofold:
1. Provide a function that can run the extension logic on an in-memory batch without going through a Node stream.
2. Stop aborting the whole run when an `exprEval` extension throws on a single row — route the error per-row to a callback instead.

- [ ] **Step 1: Write the failing test (extracting per-row error capture)**

Create `api/test/utils/extend-batch-sync.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { extendBatchSync } from '../../src/datasets/utils/extensions.ts'

test.describe('extendBatchSync — exprEval', () => {
  test('captures per-row exprEval throw without aborting the batch', async () => {
    const dataset: any = {
      id: 'ds1',
      owner: { type: 'user', id: 'u1' },
      schema: [
        { key: 'n', type: 'number' },
        { key: 'half', type: 'number', 'x-extension': 'half' }
      ]
    }
    const extensions: any[] = [
      {
        active: true,
        type: 'exprEval',
        expr: 'n / IF(n > 0, n, 0)', // throws on n === 0
        property: { key: 'half', type: 'number' }
      }
    ]
    const onLineError = []
    const lines = [{ n: 2 }, { n: 0 }, { n: 4 }]
    const result = await extendBatchSync(dataset, extensions, lines, {
      onLineError: (i, err) => onLineError.push({ i, err })
    })
    assert.equal(result.length, 3)
    assert.equal(onLineError.length, 1)
    assert.equal(onLineError[0].i, 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test api/test/utils/extend-batch-sync.spec.ts`
Expected: FAIL — `extendBatchSync` not exported.

- [ ] **Step 3: Refactor `ExtensionsStream` to delegate to `extendBatchSync`**

In `api/src/datasets/utils/extensions.ts`:

a. Add the new exported function near the bottom of the file:

```ts
export type ExtendBatchOptions = {
  onlyEmitChanges?: boolean
  /**
   * Called for each line that fails an extension (exprEval throw or remoteService
   * errorKey populated). i is the index in the input `lines` array.
   */
  onLineError?: (i: number, err: { extensionType: 'remoteService' | 'exprEval', mandatory: boolean, propertyKey: string, message: string }) => void
}

/**
 * Apply a list of extensions to an in-memory batch of lines.
 * Returns the same array with enriched lines (mutated). Per-row failures
 * are surfaced via options.onLineError instead of throwing.
 */
export const extendBatchSync = async (
  dataset: Dataset,
  extensions: any[],
  lines: any[],
  options: ExtendBatchOptions = {}
): Promise<any[]> => {
  const detailed: any[] = []
  for (const extension of extensions) {
    if (!extension.active) continue
    if (extension.type === 'remoteService') {
      // same prep as in `extend()` but inline — copy the block from extensions.ts
      // (lines 107–123) so the function is self-contained.
      const accessFilter: Filter<WithId<Document>>[] = [{ public: true }]
      accessFilter.push({ privateAccess: { $elemMatch: { type: dataset.owner.type, id: dataset.owner.id } } })
      const remoteService = await mongo.remoteServices.findOne({ id: extension.remoteService, $or: accessFilter })
      if (!remoteService) throw new Error(`Try to apply extension on dataset ${dataset.id} but remote service ${extension.action} was not found.`)
      const action = remoteService.actions.find((a: any) => a.id === extension.action)
      if (!action) throw new Error(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but action ${extension.action} was not found.`)
      const extensionKey = getExtensionKey(extension)
      const inputMapping = await prepareInputMapping(action, dataset, extensionKey, extension.select)
      const errorKey = action.output.find((o: any) => o.name === '_error') ? '_error' : 'error'
      const idInput = action.input.find((input: any) => input.concept === 'http://schema.org/identifier')
      if (!idInput) throw new Error('A field with concept "http://schema.org/identifier" is required and missing in the remote service action', action)
      detailed.push({ ...extension, extensionKey, inputMapping, remoteService, action, errorKey, idInput })
    } else if (extension.type === 'exprEval') {
      const property = dataset.schema?.find(p => p.key === extension.property.key)
      try {
        const evaluate = compileExpression(extension.expr, property)
        detailed.push({ ...extension, evaluate })
      } catch (err: any) {
        // expression compile error is dataset-level — surface as throw, this is not a per-row error
        throw new Error(`[noretry] échec de l'analyse de l'expression "${extension.expr}" : ${err.message}`)
      }
    }
  }

  // Re-use the existing stream class to keep the remoteService HTTP/cache logic in one place.
  // We feed it our buffer and capture per-row results via the same hook.
  const stream = new ExtensionsStream({ extensions: detailed, dataset, onlyEmitChanges: !!options.onlyEmitChanges, onLineError: options.onLineError })
  stream.buffer = lines.slice()
  await stream.sendBuffer()
  return lines
}
```

b. Modify the `ExtensionsStream` constructor and `sendBuffer` to accept and call an `onLineError` hook. In `api/src/datasets/utils/extensions.ts:213-249`:

Change the constructor signature:

```ts
type ExtensionStreamOptions = {
  extensions: any[],
  dataset: Dataset,
  onlyEmitChanges: boolean,
  onLineError?: (i: number, err: { extensionType: 'remoteService' | 'exprEval', mandatory: boolean, propertyKey: string, message: string }) => void
}

class ExtensionsStream extends Transform {
  // existing fields...
  onLineError?: ExtensionStreamOptions['onLineError']
  constructor ({ extensions, dataset, onlyEmitChanges, onLineError }: ExtensionStreamOptions) {
    super({ objectMode: true })
    this.i = 0
    this.dataset = dataset
    this.extensions = extensions
    this.onlyEmitChanges = onlyEmitChanges
    this.buffer = []
    this.onLineError = onLineError
  }
  // ...
}
```

c. In `sendBuffer`, modify the remoteService result loop and the `exprEval` loop to call `this.onLineError` per failing row instead of throwing:

For remoteService results (around line 346 currently):

```ts
for (const result of results) {
  // ...existing select / cache code...
  const i = result[extension.idInput.name]
  if (result[extension.errorKey] && this.onLineError) {
    this.onLineError(Number(i), {
      extensionType: 'remoteService',
      mandatory: !!extension.mandatory,
      propertyKey: extension.extensionKey,
      message: String(result[extension.errorKey])
    })
  }
  // ... existing applyExtensionResult call (unchanged) ...
}
```

The existing call to `applyExtensionResult` remains unchanged — when a row has both an enriched value and an error, the row is still mutated as today. The hook is purely additive.

For `exprEval` (currently around line 366-401), wrap the per-row `try/catch` so it routes to `this.onLineError` instead of throwing:

```ts
} else if (extension.evaluate && extension.property) {
  for (const i in this.buffer) {
    let value
    try {
      const data = { ...this.buffer[i] }
      // ... existing schema flattening ...
      value = extension.evaluate(data)
    } catch (err: any) {
      const message = `échec de l'évaluation de l'expression "${extension.expr}" : ${err.message}`
      if (this.onLineError) {
        this.onLineError(Number(i), {
          extensionType: 'exprEval',
          mandatory: !!extension.mandatory,
          propertyKey: extension.property.key,
          message
        })
        // leave the property unset for this row
        continue
      } else {
        // backwards-compat path: legacy callers that did not opt into onLineError
        throw new Error(`[noretry] ${message}`)
      }
    }
    // ... existing changesIndexes / value assignment ...
  }
}
```

Note: keep the legacy `throw` when `onLineError` is not provided so unrelated callers (currently every caller of `extend()` that did not pass the hook) keep their current behavior; we plumb the hook through `extend()` in Task 6 below.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test api/test/utils/extend-batch-sync.spec.ts`
Expected: PASS — three input lines, one captured per-row error at index 1.

- [ ] **Step 5: Run all extension tests to confirm no regression**

Run: `npx playwright test tests/features/datasets/extensions/`
Expected: PASS — existing extension tests are unaffected because they do not pass `onLineError`.

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/utils/extensions.ts api/test/utils/extend-batch-sync.spec.ts
git commit -m "feat(extensions): extract extendBatchSync and add per-row onLineError hook"
```

---

## Task 5: Wire `DiagnosticWriter` into `validate-file.ts`

**Files:**
- Modify: `api/src/workers/batch-processor/validate-file.ts`

The current `ValidateStream` collects up to 3 errors into a journal summary. We change it to (a) collect ALL errors into a `DiagnosticWriter`, (b) keep the 3-error inline summary for the journal, (c) flag the journal event with `hasDiagnosticFile: true`.

- [ ] **Step 1: Write the failing test**

In `tests/features/datasets/validation-diagnostic.api.spec.ts` (new file):

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForDatasetError } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('validation diagnostic file', () => {
  test.beforeEach(() => clean())

  test('produces a CSV diagnostic with every invalid row when validation fails', async () => {
    const schema = [
      { key: 'id', type: 'string', pattern: '^[a-z]+$' },
      { key: 'nb', type: 'number' }
    ]
    const csv = 'id,nb\n' + [
      'abc,1',   // valid
      '123,2',   // id pattern fail
      'def,xx',  // nb type fail
      'GHI,4',   // id pattern fail
      'jkl,5'    // valid
    ].join('\n')
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'invalid.csv')
    form.append('schema', JSON.stringify(schema))
    const ds = (await testUser1.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    await waitForDatasetError(testUser1, ds.id)

    // journal event has hasDiagnosticFile flag
    const journal = (await testUser1.get(`/api/v1/datasets/${ds.id}/journal`)).data
    const errEvent = journal.find((e: any) => e.type === 'validation-error')
    assert.ok(errEvent)
    assert.equal(errEvent.hasDiagnosticFile, true)

    // diagnostic file is downloadable and contains 3 rows
    const diag = (await testUser1.get(`/api/v1/datasets/${ds.id}/validation-diagnostic.csv`, { responseType: 'text' })).data
    const rows = diag.replace(/^﻿/, '').trim().split('\n')
    assert.equal(rows[0], 'line,error_type,field,message,raw_value')
    // 3 invalid rows
    assert.equal(rows.length, 1 + 3)
    assert.ok(rows.some(r => r.startsWith('2,validation,')))
    assert.ok(rows.some(r => r.startsWith('3,validation,')))
    assert.ok(rows.some(r => r.startsWith('4,validation,')))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/validation-diagnostic.api.spec.ts`
Expected: FAIL — `hasDiagnosticFile` flag missing, download endpoint missing.

- [ ] **Step 3: Modify `ValidateStream` to collect all errors via writer**

In `api/src/workers/batch-processor/validate-file.ts`:

Replace the `ValidateStream` class (lines 23–56) with:

```ts
class ValidateStream extends Writable {
  validate: CustomAjvValidate
  inlineErrors: string[] = []
  nbErrors = 0
  i = 0
  writer: DiagnosticWriter
  schema: any[]

  constructor (options: { dataset: DatasetInternal, writer: DiagnosticWriter }) {
    super({ objectMode: true })
    this.schema = (options.dataset.schema ?? []).filter(p => !p['x-calculated'] && !p['x-extension'])
    const schema = jsonSchema(this.schema)
    this.validate = ajv.compile(schema, false)
    this.writer = options.writer
  }

  _write (chunk: any, encoding: string, callback: (err?: Error | null) => void) {
    this.i++
    const valid = this.validate(chunk)
    if (!valid) {
      this.nbErrors++
      const errs = this.validate.errors ?? []
      // inline summary keeps the 3-first behavior
      if (this.nbErrors <= 3) this.inlineErrors.push(`Ligne ${this.i}: ${JSON.stringify(errs)}`)
      // write every error to the diagnostic
      ;(async () => {
        for (const err of errs) {
          const field = (err.instancePath ?? '').replace(/^\//, '') || (err.params as any)?.missingProperty || ''
          const rawValue = field ? String(chunk?.[field] ?? '') : ''
          await this.writer.addError({
            line: this.i,
            type: 'validation',
            field,
            message: err.message ?? JSON.stringify(err),
            rawValue
          })
        }
        callback()
      })().catch(callback)
    } else {
      callback()
    }
  }

  errorsSummary () {
    if (!this.nbErrors) return null
    const leftOut = this.nbErrors - 3
    let msg = `${Math.round(100 * (this.nbErrors / this.i))}% des lignes ont une erreur de validation.\n<br>`
    msg += this.inlineErrors.map(e => truncateMiddle(e, 80, 60, '...')).join('\n<br>')
    if (leftOut > 0) msg += `\n<br>${leftOut} autres erreurs...`
    return msg
  }
}
```

(The previous `maxErrors = 3` constant is no longer module-scoped — we hard-code 3 in `errorsSummary`.)

Then modify the worker default export (around lines 102–122) to instantiate the writer, finalize/discard at the end, and add the journal flag:

```ts
if (datasetUtils.schemaHasValidationRules(dataset.schema)) {
  debug('Run validator stream')
  const progress = taskProgress(dataset.id, eventsPrefix, 100)
  await progress.inc(0)
  const readStreams = await getReadStreams(dataset, false, false, true, progress)
  const writer = new DiagnosticWriter(dataset)
  const validateStream = new ValidateStream({ dataset, writer })
  await pump(...readStreams, validateStream)
  debug('Validator stream ok')

  if (validateStream.nbErrors > 0) {
    const fileResult = await writer.finalize()
    const errorsSummary = validateStream.errorsSummary() ?? ''
    const journalEvent: any = {
      type: 'validation-error',
      data: errorsSummary,
      hasDiagnosticFile: true,
      diagnosticErrorCount: fileResult.count,
      diagnosticCapped: fileResult.capped
    }
    await journals.log('datasets', dataset, journalEvent)
    await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validation-error', {
      params: {
        nbErrors: String(validateStream.nbErrors),
        diagnosticUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/validation-diagnostic.csv`
      }
    })
    delete patch.validateDraft
    if (dataset.draftReason?.validationMode === 'compatibleOrCancel') {
      await cancelDraft()
      return
    } else {
      throw new Error(`[noretry] ${errorsSummary}`)
    }
  } else {
    // success: drop any stale diagnostic from a previous failed attempt
    await writer.discard()
  }
}
```

Add the imports at the top of the file:

```ts
import config from '#config'
import { DiagnosticWriter } from '../../datasets/utils/diagnostic-file.ts'
```

- [ ] **Step 4: Run the failing test**

Run: `npx playwright test tests/features/datasets/validation-diagnostic.api.spec.ts`
Expected: still FAIL (download endpoint not yet created — that's Task 9). The journal flag should now be set; verify with the journal-only assertion. Comment out the download-file portion of the test temporarily, OR mark it as `test.fixme` until Task 9 is done; we'll un-fixme in Task 9. For TDD pacing, leave a `console.log` of the response and accept the test will fully pass after Task 9.

Acceptable interim: the journal assertions pass, the download assertion fails. Note this in the commit message.

- [ ] **Step 5: Run existing file-validation tests for regression**

Run: `npx playwright test tests/features/datasets/upload/file-validation.api.spec.ts`
Expected: PASS (the inline 3-error summary is preserved; behavior on valid datasets unchanged).

- [ ] **Step 6: Commit**

```bash
git add api/src/workers/batch-processor/validate-file.ts
git commit -m "feat(workers): write all validation errors to diagnostic CSV"
```

---

## Task 6: Wire `DiagnosticWriter` into `extend.ts` for mandatory extensions

**Files:**
- Modify: `api/src/datasets/utils/extensions.ts:91-186` (signature of `extend`)
- Modify: `api/src/workers/batch-processor/extend.ts`

- [ ] **Step 1: Write the failing test**

In `tests/features/datasets/extensions/extensions-mandatory.api.spec.ts` (new file):

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForDatasetError, waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('mandatory extension — file dataset', () => {
  test.beforeEach(() => clean())

  test('mandatory exprEval failure on a row produces a diagnostic file and blocks finalize', async () => {
    const schema = [
      { key: 'n', type: 'number' }
    ]
    const csv = 'n\n2\n0\n4\n'
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'small.csv')
    form.append('schema', JSON.stringify(schema))
    form.append('extensions', JSON.stringify([{
      active: true,
      mandatory: true,
      type: 'exprEval',
      expr: '10 / n',
      property: { key: 'half', type: 'number' }
    }]))
    const ds = (await testUser1.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    await waitForDatasetError(testUser1, ds.id)

    const journal = (await testUser1.get(`/api/v1/datasets/${ds.id}/journal`)).data
    const errEvent = journal.find((e: any) => e.type === 'validation-error')
    assert.ok(errEvent)
    assert.equal(errEvent.hasDiagnosticFile, true)
    assert.equal(errEvent.diagnosticErrorCount, 1)
  })

  test('non-mandatory exprEval failure does not block finalize but is captured', async () => {
    const schema = [
      { key: 'n', type: 'number' }
    ]
    const csv = 'n\n2\n0\n4\n'
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'small.csv')
    form.append('schema', JSON.stringify(schema))
    form.append('extensions', JSON.stringify([{
      active: true,
      mandatory: false,
      type: 'exprEval',
      expr: '10 / n',
      property: { key: 'half', type: 'number' }
    }]))
    const ds = (await testUser1.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    const finalized = await waitForFinalize(testUser1, ds.id)
    assert.equal(finalized.status, 'finalized')

    const journal = (await testUser1.get(`/api/v1/datasets/${ds.id}/journal`)).data
    const errEvent = journal.find((e: any) => e.type === 'validation-error')
    // for non-mandatory, we still flag a diagnostic if any row failed
    assert.ok(errEvent || journal.find((e: any) => e.hasDiagnosticFile))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/extensions/extensions-mandatory.api.spec.ts`
Expected: FAIL — extension worker doesn't currently produce a diagnostic.

- [ ] **Step 3: Add `onLineError` plumbing to `extend()`**

In `api/src/datasets/utils/extensions.ts`, modify the signature of `extend` (line 92) to accept the hook and propagate it to `ExtensionsStream`:

```ts
export const extend = async (
  dataset: Dataset,
  extensions: any[],
  updateMode?: 'all' | 'updatedLines' | 'lineIds' | 'updatedExtensions',
  ignoreDraftLimit?: boolean,
  lineIds?: string[],
  simulationLine?: DatasetLine,
  onLineError?: ExtensionStreamOptions['onLineError']
) => {
  // ... existing code unchanged until ExtensionsStream construction at line 174 ...
  await pump(
    ...inputStreams,
    new ExtensionsStream({ extensions: detailedExtensions, dataset, onlyEmitChanges: updateMode === 'updatedExtensions', onLineError }),
    ...writeStreams
  )
  // ...
}
```

- [ ] **Step 4: Wire the writer into the worker**

In `api/src/workers/batch-processor/extend.ts`, before the `extend()` call (line 35), instantiate the writer and pass `onLineError`. After the call, decide finalize vs discard and throw if any mandatory error was captured:

```ts
import { DiagnosticWriter } from '../../datasets/utils/diagnostic-file.ts'
import * as journals from '../../misc/utils/journals.ts'
import { sendResourceEvent } from '../../misc/utils/notifications.ts'
import config from '#config'

// ... inside the default-export function:

const writer = new DiagnosticWriter(dataset)
let blockingErrors = 0
let totalErrors = 0

debug('apply extensions', dataset.extensions)
await extensionsUtils.extend(
  dataset,
  extensions,
  updateMode,
  dataset.validateDraft,
  undefined,
  undefined,
  async (i, err) => {
    totalErrors++
    if (err.mandatory) blockingErrors++
    await writer.addError({
      line: i + 1, // ExtensionsStream is 0-based per buffer; convert to 1-based row position
      type: 'extension',
      field: err.propertyKey,
      message: err.message,
      rawValue: ''
    })
  }
)
debug('extensions ok')

if (totalErrors > 0) {
  const fileResult = await writer.finalize()
  await journals.log('datasets', dataset, {
    type: 'validation-error',
    data: `${totalErrors} ligne(s) avec un échec d'enrichissement` + (blockingErrors > 0 ? ' (dont ' + blockingErrors + ' obligatoire(s))' : ''),
    hasDiagnosticFile: true,
    diagnosticErrorCount: fileResult.count,
    diagnosticCapped: fileResult.capped
  } as any)

  if (blockingErrors > 0) {
    await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validation-error', {
      params: {
        nbErrors: String(blockingErrors),
        diagnosticUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/validation-diagnostic.csv`
      }
    })
    throw new Error(`[noretry] ${blockingErrors} ligne(s) en échec d'enrichissement obligatoire`)
  }
} else {
  await writer.discard()
}
```

Note about the line index: `ExtensionsStream` calls `onLineError(i, ...)` where `i` is the index in the *current batch* (`this.buffer`). Across multiple 1000-row batches, `i` resets every batch. To produce stable line numbers, we need a running offset:

In `api/src/datasets/utils/extensions.ts`, in `ExtensionsStream.sendBuffer`, change calls to pass an absolute index. Track an internal offset that increments by `this.buffer.length` after each `sendBuffer` invocation:

```ts
class ExtensionsStream extends Transform {
  // ...
  private offset = 0
  // ...
  async sendBuffer () {
    if (!this.buffer.length) return
    // ... existing body, replace `this.onLineError(Number(i), ...)` with `this.onLineError(this.offset + Number(i), ...)`
    this.offset += this.buffer.length
    this.buffer = []
  }
}
```

Then in the worker, use `i + 1` (1-based for human display in the CSV).

- [ ] **Step 5: Run the failing test**

Run: `npx playwright test tests/features/datasets/extensions/extensions-mandatory.api.spec.ts`
Expected: the mandatory test should now pass (modulo the download endpoint, like Task 5). The non-mandatory test passes as well: dataset finalizes, and a diagnostic event is logged.

- [ ] **Step 6: Run existing extension tests for regression**

Run: `npx playwright test tests/features/datasets/extensions/`
Expected: PASS — existing tests don't pass `onLineError`, the legacy throw path kicks in for un-hooked exprEval failures, and remoteService remains unchanged when no error key is set.

- [ ] **Step 7: Commit**

```bash
git add api/src/datasets/utils/extensions.ts api/src/workers/batch-processor/extend.ts tests/features/datasets/extensions/extensions-mandatory.api.spec.ts
git commit -m "feat(workers): write extension errors to diagnostic file, block on mandatory failures"
```

---

## Task 7: REST in-memory mandatory extension in `applyReqTransactions`

**Files:**
- Modify: `api/src/datasets/utils/rest.ts:492-526`

We insert a call to `extendBatchSync` between the AJV-validation loop (line 526) and the bulk Mongo write (line 565). Only operations that survived schema validation are passed to it.

- [ ] **Step 1: Write the failing test**

Append to `tests/features/datasets/extensions/extensions-mandatory.api.spec.ts`:

```ts
test.describe('mandatory extension — REST dataset', () => {
  test.beforeEach(() => clean())

  test('single-line POST is rejected when mandatory exprEval fails', async () => {
    const ds = (await testUser1.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-mandatory',
      schema: [{ key: 'n', type: 'number' }],
      extensions: [{
        active: true,
        mandatory: true,
        type: 'exprEval',
        expr: '10 / n',
        property: { key: 'half', type: 'number' }
      }]
    })).data
    await waitForFinalize(testUser1, ds.id)

    // valid line: passes
    const ok = await testUser1.post(`/api/v1/datasets/${ds.id}/lines`, { n: 2 })
    assert.equal(ok.status, 201)

    // invalid line (n=0 -> exprEval throws): should fail with 4xx, no row persisted
    let failed = false
    try {
      await testUser1.post(`/api/v1/datasets/${ds.id}/lines`, { n: 0 })
    } catch (err: any) {
      failed = true
      assert.equal(err.response.status, 400)
    }
    assert.ok(failed, 'expected POST with n=0 to fail')

    // confirm only one line exists
    const lines = (await testUser1.get(`/api/v1/datasets/${ds.id}/lines`)).data
    assert.equal(lines.total, 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/extensions/extensions-mandatory.api.spec.ts -g "single-line POST"`
Expected: FAIL — POST with n=0 currently succeeds because the exprEval extension is async.

- [ ] **Step 3: Add the in-memory mandatory step to `applyReqTransactions`**

In `api/src/datasets/utils/rest.ts`, after the schema-validation loop ends at line 526 and before the create/update existence check at line 528:

```ts
// In-memory mandatory extension pass — runs only when at least one mandatory
// extension is active. Lines that fail are flagged like a schema-validation failure.
const mandatoryExtensions = (req.dataset.extensions ?? []).filter((e: any) => e.active && e.mandatory)
if (mandatoryExtensions.length) {
  const lines = []
  const operationsByIndex = []
  for (const operation of operations) {
    if (operation._action === 'delete') continue
    if (operation._status && operation._status >= 300) continue
    operationsByIndex.push(operation)
    lines.push({ ...operation.fullBody })
  }
  if (lines.length) {
    await extensionsUtils.extendBatchSync(req.dataset, mandatoryExtensions, lines, {
      onLineError: (i, err) => {
        if (!err.mandatory) return
        const operation = operationsByIndex[i]
        operation._status = 400
        operation._error = `enrichissement obligatoire en échec (${err.propertyKey}): ${err.message}`
      }
    })
    // copy enriched values back into operation.fullBody for the lines that did NOT fail
    for (let i = 0; i < lines.length; i++) {
      const operation = operationsByIndex[i]
      if (operation._error) continue
      Object.assign(operation.fullBody, lines[i])
    }
  }
}
```

Add an import at the top of the file:

```ts
import * as extensionsUtils from './extensions.ts'
```

(Verify the import name is not already taken — the file imports `restDatasetsUtils` but not `extensionsUtils`. Adjust to a unique name if needed.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/extensions/extensions-mandatory.api.spec.ts -g "single-line POST"`
Expected: PASS.

- [ ] **Step 5: Run all REST tests for regression**

Run: `npx playwright test tests/features/datasets/`
Expected: PASS. Datasets without mandatory extensions are unchanged (the new block is gated by `mandatoryExtensions.length`).

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/utils/rest.ts tests/features/datasets/extensions/extensions-mandatory.api.spec.ts
git commit -m "feat(rest): run mandatory extensions in-memory before MongoDB upsert"
```

---

## Task 8: REST bulk-async reject when mandatory + oversize

**Files:**
- Modify: `api/src/datasets/utils/rest.ts:1036` (around the bulk handler) — add an early-return 400.

- [ ] **Step 1: Write the failing test**

Append to `tests/features/datasets/extensions/extensions-mandatory.api.spec.ts`:

```ts
test('bulk async write is rejected with 400 when a mandatory extension is configured', async () => {
  const ds = (await testUser1.post('/api/v1/datasets', {
    isRest: true,
    title: 'rest-mandatory-bulk',
    schema: [{ key: 'n', type: 'number' }],
    extensions: [{
      active: true,
      mandatory: true,
      type: 'exprEval',
      expr: '10 / n',
      property: { key: 'half', type: 'number' }
    }]
  })).data
  await waitForFinalize(testUser1, ds.id)

  // build a bulk body large enough to exceed maxBulkChars (default ~ a few MB)
  const big = Array.from({ length: 200000 }, (_, i) => ({ _action: 'create', n: i + 1 }))
  let failed = false
  try {
    await testUser1.post(`/api/v1/datasets/${ds.id}/_bulk_lines`, big)
  } catch (err: any) {
    failed = true
    assert.equal(err.response.status, 400)
    assert.match(err.response.data, /obligatoire/)
  }
  assert.ok(failed)
})
```

(If the default `maxBulkChars` is too high to easily exceed in a test, the test can stub the threshold by writing directly to the test config — confirm at execution time. If needed, lower `config.elasticsearch.maxBulkChars` for the test environment in `api/test/.env` or equivalent.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/extensions/extensions-mandatory.api.spec.ts -g "bulk async"`
Expected: FAIL.

- [ ] **Step 3: Add the early reject in the bulk handler**

In `api/src/datasets/utils/rest.ts`, in the bulk-lines handler near line 998 (right after `const contentLength = Number(req.get('content-length'))` and before the body is consumed):

```ts
const mandatoryExtensions = (req.dataset.extensions ?? []).filter((e: any) => e.active && e.mandatory)
if (mandatoryExtensions.length && (!isNaN(contentLength) && contentLength > config.elasticsearch.maxBulkChars)) {
  return res.status(400).type('text/plain').send(
    `Une extension obligatoire est configurée. La requête doit être traitée en mémoire et ne peut donc pas dépasser ${config.elasticsearch.maxBulkChars} caractères. Découpez la requête en plus petits lots.`
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/extensions/extensions-mandatory.api.spec.ts -g "bulk async"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/utils/rest.ts tests/features/datasets/extensions/extensions-mandatory.api.spec.ts
git commit -m "feat(rest): reject async bulk writes when a mandatory extension is configured"
```

---

## Task 9: Add the diagnostic-file download endpoint

**Files:**
- Modify: `api/src/datasets/router.js` (after the `/full` route, around line 1333)

- [ ] **Step 1: Write the failing test**

This is already covered by the test in Task 5 (`validation-diagnostic.api.spec.ts`) but currently fails on the download portion. Confirm by running that test now.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/validation-diagnostic.api.spec.ts`
Expected: FAIL — endpoint returns 404 or wrong content.

- [ ] **Step 3: Add the route**

In `api/src/datasets/router.js`, after line 1333:

```js
router.get('/:datasetId/validation-diagnostic.csv', readDataset({ noCache: true }), apiKeyMiddlewareRead, permissions.middleware('readJournal', 'readAdvanced'), cacheHeaders.noCache, async (req, res, next) => {
  const filePath = datasetUtils.validationDiagnosticFilePath(req.dataset)
  if (!await filesStorage.pathExists(filePath)) {
    return res.status(404).type('text/plain').send('Aucun fichier de diagnostic disponible')
  }
  res.setHeader('content-disposition', contentDisposition(`${req.dataset.slug}-validation-diagnostic.csv`))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  await downloadFileFromStorage(filePath, req, res)
})
```

Permission rationale: same as `readJournal` — anyone who can read the validation-error event in the journal can read the diagnostic that explains it.

Verify `datasetUtils.validationDiagnosticFilePath` is reachable through the existing `datasetUtils` import in this file. If `datasetUtils` is imported as `* as datasetUtils from '../utils/...'`, the new export from Task 2 is visible. Otherwise add the symbol to the import list.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/validation-diagnostic.api.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run extension mandatory tests**

Run: `npx playwright test tests/features/datasets/extensions/extensions-mandatory.api.spec.ts`
Expected: PASS — file-dataset tests now have a downloadable file.

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/router.js
git commit -m "feat(api): add validation diagnostic download endpoint"
```

---

## Task 10: Add `validation-error` notification i18n keys

**Files:**
- Modify: `api/i18n/messages/fr.json`, `api/i18n/messages/en.json`

- [ ] **Step 1: Inspect the existing notification block**

Read `api/i18n/messages/fr.json` lines 56–114 to confirm the `notifications.datasets` block layout.

- [ ] **Step 2: Add the new keys (FR)**

In `api/i18n/messages/fr.json`, inside `notifications.datasets`, add:

```json
"validation-error": {
  "title": "Erreurs de validation sur le jeu de données {{label}}",
  "body": "Le jeu de données {{label}} a {{nbErrors}} ligne(s) en erreur. Téléchargez le fichier de diagnostic : {{diagnosticUrl}}"
},
"draft-validation-error": {
  "title": "Erreurs de validation sur le brouillon {{label}}",
  "body": "Le brouillon du jeu de données {{label}} a {{nbErrors}} ligne(s) en erreur. Téléchargez le fichier de diagnostic : {{diagnosticUrl}}"
},
```

- [ ] **Step 3: Add the new keys (EN)**

In `api/i18n/messages/en.json`, mirror in English:

```json
"validation-error": {
  "title": "Validation errors on dataset {{label}}",
  "body": "Dataset {{label}} has {{nbErrors}} row(s) with errors. Download the diagnostic file: {{diagnosticUrl}}"
},
"draft-validation-error": {
  "title": "Validation errors on draft {{label}}",
  "body": "Draft of dataset {{label}} has {{nbErrors}} row(s) with errors. Download the diagnostic file: {{diagnosticUrl}}"
},
```

- [ ] **Step 4: Verify the worker notification call resolves the key**

Re-run the validation-diagnostic spec end-to-end:

Run: `npx playwright test tests/features/datasets/validation-diagnostic.api.spec.ts`
Expected: PASS — and no `missing i18n for event key` thrown by `sendResourceEvent` (notifications.ts:33).

- [ ] **Step 5: Commit**

```bash
git add api/i18n/messages/fr.json api/i18n/messages/en.json
git commit -m "i18n: add validation-error notification keys"
```

---

## Task 11: Make sure `cancelDraft` removes the diagnostic file

**Files:**
- Modify: `api/src/datasets/service.js` (locate `cancelDraft`)

The existing draft-directory cleanup may already cover the new file (it lives under `dir(dataset)`). Verify and add an explicit removal if needed.

- [ ] **Step 1: Read `cancelDraft` and confirm coverage**

Run: `grep -n "cancelDraft" api/src/datasets/service.js | head -5` — locate the function. Read 30 lines around it and confirm whether the draft `dir()` removal covers `data-files`.

- [ ] **Step 2: Write the failing test**

Append to `tests/features/datasets/validation-diagnostic.api.spec.ts`:

```ts
test('cancelling a draft with diagnostic file removes the file', async () => {
  const schema = [{ key: 'n', type: 'number' }]
  const csv = 'n\nabc\n' // invalid: not a number
  const form = new FormData()
  form.append('file', Buffer.from(csv), 'bad.csv')
  form.append('schema', JSON.stringify(schema))
  const ds = (await testUser1.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
  await waitForDatasetError(testUser1, ds.id)
  // confirm file exists
  await testUser1.get(`/api/v1/datasets/${ds.id}/validation-diagnostic.csv`)

  // cancel draft
  await testUser1.delete(`/api/v1/datasets/${ds.id}/draft`)

  // file should now be gone
  let status404 = false
  try {
    await testUser1.get(`/api/v1/datasets/${ds.id}/validation-diagnostic.csv`)
  } catch (err: any) {
    status404 = err.response.status === 404
  }
  assert.ok(status404)
})
```

- [ ] **Step 3: Run test to verify it fails (or passes)**

Run: `npx playwright test tests/features/datasets/validation-diagnostic.api.spec.ts -g "cancelling"`
- If it PASSES, the existing cleanup is sufficient; commit nothing in this task and skip to Step 5.
- If it FAILS, proceed to Step 4.

- [ ] **Step 4: Add explicit removal**

In `cancelDraft` (in `api/src/datasets/service.js`), add a call to `filesStorage.removeFile(datasetUtils.validationDiagnosticFilePath(dataset))` before/after the existing draft directory cleanup, with a guard via `pathExists`. Keep the change minimal.

- [ ] **Step 5: Re-run test**

Run: `npx playwright test tests/features/datasets/validation-diagnostic.api.spec.ts -g "cancelling"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/service.js tests/features/datasets/validation-diagnostic.api.spec.ts
git commit -m "fix(datasets): clean up validation diagnostic on draft cancel"
```

---

## Task 12: UI — mandatory toggle in extension cards

**Files:**
- Modify: `ui/src/components/dataset/extension/dataset-extension-remote-service-card.vue`
- Modify: `ui/src/components/dataset/extension/dataset-extension-expr-eval-card.vue`

- [ ] **Step 1: Add the toggle to the remoteService card**

In `ui/src/components/dataset/extension/dataset-extension-remote-service-card.vue`, after the existing `v-checkbox` for `autoUpdate` (line 62-66), add:

```vue
<v-checkbox
  v-model="extension.mandatory"
  :label="t('mandatory')"
  :hint="t('mandatoryHint')"
  persistent-hint
  :disabled="!canWrite"
  density="comfortable"
  hide-details="auto"
/>
```

In the `<i18n>` block at the bottom, add the translations:

```yaml
fr:
  mandatory: Enrichissement obligatoire
  mandatoryHint: Une ligne dont l'enrichissement échoue est traitée comme une erreur de validation.
en:
  mandatory: Mandatory enrichment
  mandatoryHint: A row whose enrichment fails is treated as a validation error.
```

- [ ] **Step 2: Add the toggle to the exprEval card**

In `ui/src/components/dataset/extension/dataset-extension-expr-eval-card.vue`, inside `<v-card-text class="pb-0">` (after the `v-text-field` at line 18-25), add the same checkbox.

Add the same i18n keys to the file's `<i18n>` block.

- [ ] **Step 3: Manual verification**

Start the dev UI (the user manages the dev server — ask them to confirm). Open a dataset, navigate to the extensions section, toggle "Mandatory" on an extension, save, and verify the change is persisted in the API by reading `GET /api/v1/datasets/:id` and looking at `extensions[i].mandatory`.

If you cannot run the UI, state so explicitly. Type checking and linting are not sufficient to validate UI behavior.

Run: `npm run lint && npm run check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/dataset/extension/dataset-extension-remote-service-card.vue ui/src/components/dataset/extension/dataset-extension-expr-eval-card.vue
git commit -m "feat(ui): add mandatory toggle on dataset extensions"
```

---

## Task 13: UI — diagnostic download link in journal view

**Files:**
- Modify: `ui/src/components/journal-view.vue`

- [ ] **Step 1: Render the link when `event.hasDiagnosticFile === true`**

In `ui/src/components/journal-view.vue`, in the `<v-list-item-title>` block (around lines 25-36), append after the existing message:

```vue
<v-btn
  v-if="event.type === 'validation-error' && (event as any).hasDiagnosticFile && type === 'dataset'"
  variant="text"
  size="small"
  color="error"
  :href="`/api/v1/datasets/${(event as any).resourceId ?? datasetId}/validation-diagnostic.csv`"
  target="_blank"
>
  {{ t('downloadDiagnostic') }}
</v-btn>
```

The component currently doesn't receive the dataset id directly — it receives the journal events. Confirm by reading `dataset-status.vue` (which uses `journal-view`) for how to pass the id. Add a `datasetId?: string` prop to `journal-view.vue` if needed and pass it from the parent.

In the `<i18n>` block:

```yaml
fr:
  downloadDiagnostic: Télécharger le diagnostic
en:
  downloadDiagnostic: Download diagnostic
```

- [ ] **Step 2: Manual verification**

Open a dataset that has failed validation in the dev UI. Look at the journal — the validation-error event should display a "Télécharger le diagnostic" button that downloads the CSV.

If you cannot run the UI, state so explicitly.

Run: `npm run lint && npm run check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/journal-view.vue
git commit -m "feat(ui): show diagnostic download button on validation-error events"
```

---

## Task 14: Final regression sweep and PR prep

- [ ] **Step 1: Run the full lint + types**

Run: `npm run lint && npm run check-types`
Expected: PASS.

- [ ] **Step 2: Run all dataset and extension tests**

Run: `npx playwright test tests/features/datasets/`
Expected: PASS.

- [ ] **Step 3: If failures appear, debug them with the systematic-debugging skill**

Do not paper over failures. Use the `superpowers:systematic-debugging` skill.

- [ ] **Step 4: Update the spec status**

In `docs/superpowers/specs/2026-04-29-extension-validation-design.md`, change `Status: draft, awaiting user review.` to `Status: implemented`.

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/specs/2026-04-29-extension-validation-design.md
git commit -m "docs: mark extension-validation spec as implemented"
```

- [ ] **Step 6: Hand off**

The branch is ready for review. The user can open a PR to `master` with `gh pr create` (do not run automatically — wait for explicit instruction).
