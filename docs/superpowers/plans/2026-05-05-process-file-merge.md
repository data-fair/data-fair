# Process-file merge implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the file-dataset validation worker (`validate-file.ts`) and the file-dataset half of the extension worker (`extend.ts`) into one worker function (`process-file.ts`), so a single processing attempt can record both schema-validation errors and mandatory-extension errors in the same diagnostic CSV. Preserve the 2-phase progress UX. Reduce `extend.ts` to its REST-only responsibilities.

**Architecture:** A single async function in `api/src/workers/batch-processor/process-file.ts` owns one `DiagnosticWriter` for the run. It emits the `validate-start` / `validate-end` journal events itself (the framework no longer auto-emits them — `validateFile` task loses its `eventsPrefix`), then runs `ValidateStream` populating the writer, then (if any active extensions) emits `extend-start`, runs `extensionsUtils.extend(...)` with an `onLineError` hook that pipes mandatory failures into the same writer, then `extend-end`. After both phases, if the writer collected any errors it finalizes, logs one combined `validation-error` event with breakdown counts, and throws `[validation-error]`. The `extend` task in `tasks.ts` drops its file-dataset filters and is renamed `extend-rest.ts` on disk.

**Tech Stack:** Node.js (TypeScript), Express, MongoDB, Playwright (tests), `csv-stringify`, `fs-extra`.

**Spec:** `docs/superpowers/specs/2026-05-05-process-file-merge-design.md`.

---

## File Structure

### Files to create
None.

### Files to rename
- `api/src/workers/batch-processor/validate-file.ts` → `api/src/workers/batch-processor/process-file.ts` (with body rewrite during the move)
- `api/src/workers/batch-processor/extend.ts` → `api/src/workers/batch-processor/extend-rest.ts` (with body trim during the move)

### Files to modify
- `api/src/datasets/utils/diagnostic-file.ts` — add public `count` getter
- `api/src/workers/batch-processor/index.ts` — update the dynamic imports to the new file paths
- `api/src/workers/tasks.ts` — drop `eventsPrefix` from the `validateFile` task entry; narrow the `extend` task's `mongoFilter` to REST-only branches
- `tests/features/datasets/extensions/validation-diagnostic.api.spec.ts` — add new combined-errors tests, update assertions to expect new breakdown fields when present

### Conventions
- Existing `pump` helper from `api/src/misc/utils/pipe.ts` for pipelines.
- Journal events are logged via `journals.log('datasets', dataset, { type: '<event-type>' } as any)` (the cast is the existing pattern in `validate-file.ts`).
- `taskProgress(dataset.id, '<prefix>', 100)` creates a per-phase progress reporter; `await progress.inc(0)` initializes it; `await progress.inc(n)` reports progress.
- `[validation-error]` thrown error tag is recognized by the worker framework as a non-retryable terminal failure. (See git log entry `feat(workers): only write blocking failures to the diagnostic file` for prior behavior.)
- Tests use Playwright's `test`/`assert`/`testUser1.get|post|patch` patterns; helpers live in `tests/support/`.

---

## Task 1: Add `count` getter to `DiagnosticWriter`

**Files:**
- Modify: `api/src/datasets/utils/diagnostic-file.ts`

**Why:** `process-file.ts` needs to branch on whether the writer has any rows (to decide finalize vs. discard). Today `count` is private. Adding a one-line getter is the minimum change.

- [ ] **Step 1: Read current `DiagnosticWriter`**

Run: `cat api/src/datasets/utils/diagnostic-file.ts`
Expected: confirm `private count = 0` field at line ~39 and no public `count` accessor.

- [ ] **Step 2: Add the getter**

In `api/src/datasets/utils/diagnostic-file.ts`, immediately after the `private count = 0` field (around line 39), add:

```ts
  get errorCount (): number {
    return this.count
  }
```

(We use `errorCount` rather than `count` so we don't shadow the private field name and to be explicit about what is counted.)

- [ ] **Step 3: Run lint + types**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/src/datasets/utils/diagnostic-file.ts
git commit -m "feat(diagnostic): expose error count via getter"
```

---

## Task 2: Write the failing combined-errors integration test

**Files:**
- Modify: `tests/features/datasets/extensions/validation-diagnostic.api.spec.ts`

**Why:** Establish a red-light test that captures the desired behavior (both `,validation,` and `,extension,` rows in the diagnostic from a single attempt) before changing production code. Today's flow throws on validation, so extension never runs and the file contains only `,validation,` rows. This test must fail against the current `validate-file.ts`.

- [ ] **Step 1: Read existing test file to confirm helpers/imports**

Run: `grep -n "import\|sendDataset\|setupMockRoute\|waitForDatasetError" tests/features/datasets/extensions/validation-diagnostic.api.spec.ts | head -30`
Expected: confirm imports of `axiosAuth`, `clean`, `checkPendingTasks`, `waitForFinalize`, `sendDataset`, `waitForDatasetError`, `setupMockRoute`, `clearMockRoutes`.

- [ ] **Step 2: Add the failing test**

In `tests/features/datasets/extensions/validation-diagnostic.api.spec.ts`, append inside the `test.describe('validation diagnostic file', () => { ... })` block, just before the closing `})`:

```ts
  test('combined validation + exprEval errors land in the same diagnostic CSV', async () => {
    // Schema rejects rows with non-alpha id.
    // exprEval `10 / n` throws on n === 0.
    // Some rows fail validation only, some fail extension only, some fail both, some pass.
    const schema = [
      { key: 'id', type: 'string', pattern: '^[a-z]+$' },
      { key: 'n', type: 'number' }
    ]
    const csv = 'id,n\n' + [
      'abc,2',   // line 2: passes both
      '123,4',   // line 3: validation fail (id), extension passes
      'def,0',   // line 4: validation passes, extension fail (10/0)
      '456,0',   // line 5: validation fail AND extension fail
      'jkl,5'    // line 6: passes both
    ].join('\n') + '\n'
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'combined.csv')
    form.append('schema', JSON.stringify(schema))
    form.append('extensions', JSON.stringify([{
      active: true,
      type: 'exprEval',
      expr: '10 / n',
      property: { key: 'half', type: 'number' }
    }]))
    const ds = (await testUser1.post('/api/v1/datasets', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    })).data
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    assert.ok(errEvent, 'expected a single validation-error event')
    assert.equal(errEvent.hasDiagnosticFile, true)
    assert.ok((errEvent.validationErrorCount ?? 0) > 0, 'expected validationErrorCount > 0')
    assert.ok((errEvent.extensionErrorCount ?? 0) > 0, 'expected extensionErrorCount > 0')

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^﻿/, '').trim().split('\n')
    assert.equal(rows[0], 'line,error_type,field,message,raw_value')
    const dataRows = rows.slice(1)
    const validationRows = dataRows.filter((r: string) => r.includes(',validation,'))
    const extensionRows = dataRows.filter((r: string) => r.includes(',extension,'))
    assert.ok(validationRows.length >= 1, `expected validation rows in diagnostic, got: ${diag.data}`)
    assert.ok(extensionRows.length >= 1, `expected extension rows in diagnostic, got: ${diag.data}`)
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/extensions/validation-diagnostic.api.spec.ts -g "combined validation"`
Expected: FAIL — diagnostic only contains `,validation,` rows; the assertion `extensionRows.length >= 1` fails.

- [ ] **Step 4: Commit the failing test (red commit)**

```bash
git add tests/features/datasets/extensions/validation-diagnostic.api.spec.ts
git commit -m "test: add failing combined validation+extension diagnostic test"
```

---

## Task 3: Update task registry — drop `eventsPrefix` from `validateFile`, narrow `extend` to REST

**Files:**
- Modify: `api/src/workers/tasks.ts`

**Why:** After the merge `validate-file.ts` will manually emit `validate-start`/`validate-end` and `extend-start`/`extend-end`. The framework's auto-emission keyed off `eventsPrefix` would duplicate the validate events. And the file-dataset branches of `extend`'s filter are about to point to a worker that no longer handles file datasets.

- [ ] **Step 1: Read the current `validateFile` and `extend` task entries**

Run: `sed -n '180,210p' api/src/workers/tasks.ts`
Expected: confirm `validateFile` at lines ~182-191 and `extend` at lines ~192-203.

- [ ] **Step 2: Drop `eventsPrefix` from `validateFile` task**

In `api/src/workers/tasks.ts`, change the `validateFile` task entry from:

```ts
}, {
  name: 'validateFile',
  eventsPrefix: 'validate',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { file: { $exists: true }, status: { $in: ['analyzed', 'validation-updated'] }, ...noActiveDraftFilter },
      { 'draft.file': { $exists: true }, 'draft.status': { $in: ['analyzed', 'validation-updated'] } }
    ]
  })
}
```

to (remove the `eventsPrefix` line):

```ts
}, {
  name: 'validateFile',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { file: { $exists: true }, status: { $in: ['analyzed', 'validation-updated'] }, ...noActiveDraftFilter },
      { 'draft.file': { $exists: true }, 'draft.status': { $in: ['analyzed', 'validation-updated'] } }
    ]
  })
}
```

- [ ] **Step 3: Narrow the `extend` task's `mongoFilter` to REST-only**

In the same file, change the `extend` task entry from:

```ts
}, {
  name: 'extend',
  eventsPrefix: 'extend',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isValidatedMongoFilter(), noActiveDraftFilter, activeExtensionMongoFilter()] },
      { $and: [isValidatedMongoFilter('draft.'), activeExtensionMongoFilter(true)] },
      { isRest: true, status: 'finalized', 'extensions.active': true, _partialRestStatus: 'updated' },
      { isRest: true, status: 'finalized', extensions: { $elemMatch: { active: true, needsUpdate: true } }, _partialRestStatus: null }
    ]
  })
}
```

to:

```ts
}, {
  name: 'extend',
  eventsPrefix: 'extend',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { isRest: true, status: 'finalized', 'extensions.active': true, _partialRestStatus: 'updated' },
      { isRest: true, status: 'finalized', extensions: { $elemMatch: { active: true, needsUpdate: true } }, _partialRestStatus: null }
    ]
  })
}
```

(`eventsPrefix: 'extend'` stays — REST datasets will continue to use the framework's auto-emission. After the merge `process-file.ts` emits `extend-*` events directly, but those datasets never go through this `extend` task so there's no overlap.)

- [ ] **Step 4: Verify type check still passes**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 5: Do NOT run integration tests yet**

The pipeline is now in a transient broken state: file datasets in `validated` status will not progress to `extended` because no task picks them up. `process-file.ts` (rewritten in the next task) is what closes the gap. We commit anyway because the next task takes ~one diff-cycle to land.

- [ ] **Step 6: Commit**

```bash
git add api/src/workers/tasks.ts
git commit -m "chore(workers): drop eventsPrefix from validateFile, narrow extend to REST"
```

---

## Task 4: Rewrite `validate-file.ts` to merge phases (still named `validate-file.ts`)

**Files:**
- Modify: `api/src/workers/batch-processor/validate-file.ts`

**Why:** Core change. The single worker function emits its own phase markers, runs both phases against one writer, and decides finalize/throw at the end. We rewrite in place first (keeping the old filename) so we can verify the behavior change in isolation; the file rename happens in the next task once the merge is proven green.

- [ ] **Step 1: Read the current file end-to-end**

Run: `cat api/src/workers/batch-processor/validate-file.ts`
Expected: confirm structure described in design §3.1.

- [ ] **Step 2: Replace the file body**

Open `api/src/workers/batch-processor/validate-file.ts` and replace its entire contents with:

```ts
import { Writable } from 'stream'
import config from '#config'
import * as journals from '../../misc/utils/journals.ts'
import { jsonSchema } from '../../datasets/utils/data-schema.ts'
import * as ajv from '../../misc/utils/ajv.ts'
import pump from '../../misc/utils/pipe.ts'
import { sendResourceEvent } from '../../misc/utils/notifications.ts'
import * as datasetUtils from '../../datasets/utils/index.js'
import * as datasetsService from '../../datasets/service.js'
import * as schemaUtils from '../../datasets/utils/data-schema.ts'
import taskProgress from '../../datasets/utils/task-progress.ts'
import { readStreams as getReadStreams } from '../../datasets/utils/data-streams.js'
import { DiagnosticWriter } from '../../datasets/utils/diagnostic-file.ts'
import * as extensionsUtils from '../../datasets/utils/extensions.ts'
import { updateStorage } from '../../datasets/utils/storage.ts'
import truncateMiddle from 'truncate-middle'
import debugLib from 'debug'
import mongo from '#mongo'
import type { DatasetInternal } from '#types'
import type { CustomAjvValidate } from '../../misc/utils/ajv.ts'

// File-dataset processor: runs schema validation then (if extensions exist) runs
// extensions, accumulating every row error into a single DiagnosticWriter. Throws
// [validation-error] at the end if any error was collected.

const inlineErrorsLimit = 3

class ValidateStream extends Writable {
  validate: CustomAjvValidate
  inlineErrors: string[] = []
  nbErrors = 0
  i = 0
  writer: DiagnosticWriter

  constructor (options: { dataset: DatasetInternal, writer: DiagnosticWriter }) {
    super({ objectMode: true })
    const schema = jsonSchema((options.dataset.schema ?? []).filter(p => !p['x-calculated'] && !p['x-extension']))
    this.validate = ajv.compile(schema, false)
    this.writer = options.writer
  }

  _write (chunk: any, encoding: string, callback: (err?: Error | null) => void) {
    this.i++
    let rawErrors: any[] = []
    const valid = this.validate(chunk, 'fr', errs => { rawErrors = errs ?? [] })
    if (valid) {
      callback()
      return
    }
    this.nbErrors++
    if (this.nbErrors <= inlineErrorsLimit) {
      this.inlineErrors.push(`Ligne ${this.i}: ${this.validate.errors}`)
    }
    const lineNumber = this.i
    const writerErrors = rawErrors.length
      ? rawErrors.map(err => {
        const field = (err?.instancePath ?? '').replace(/^\//, '') || err?.params?.missingProperty || ''
        const rawValue = field ? String((chunk as any)?.[field] ?? '') : ''
        return {
          field,
          message: err?.message ?? JSON.stringify(err),
          rawValue
        }
      })
      : [{ field: '', message: this.validate.errors ?? 'invalid row', rawValue: '' }]
    ;(async () => {
      for (const e of writerErrors) {
        await this.writer.addError({
          line: lineNumber,
          type: 'validation',
          field: e.field,
          message: e.message,
          rawValue: e.rawValue
        })
      }
    })().then(() => callback(), callback)
  }

  errorsSummary () {
    if (!this.nbErrors) return null
    const leftOut = this.nbErrors - inlineErrorsLimit
    let msg = `${Math.round(100 * (this.nbErrors / this.i))}% des lignes ont une erreur de validation.\n`
    msg += this.inlineErrors.map(err => truncateMiddle(err, 80, 60, '...')).join('\n')
    if (leftOut > 0) msg += `\n${leftOut} autres erreurs...`
    return msg
  }
}

export default async function (dataset: DatasetInternal) {
  const debug = debugLib(`worker:process-file:${dataset.id}`)

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape validation.')
  if (dataset.isRest) throw new Error('Un jeu de données éditable ne devrait pas passer par l\'étape validation.')

  const patch: Partial<DatasetInternal> = {}
  // status default — overwritten when extensions run successfully
  patch.status = dataset.status === 'validation-updated' ? 'finalized' : 'validated'

  const cancelDraft = async () => {
    await journals.log('datasets', dataset, { type: 'draft-cancelled', data: 'annulation automatique' } as any)
    await datasetsService.cancelDraft(dataset)
    await datasetsService.applyPatch({ ...dataset, draftReason: null }, { draft: null })
  }

  // ----- existing draft compatibility checks (breaking schema changes) -----
  if (dataset.draftReason) {
    if (dataset.draftReason.validationMode !== 'never') {
      patch.validateDraft = true
    }

    const datasetFull = await mongo.datasets.findOne({ id: dataset.id })
    if (!datasetFull) throw new Error('missing dataset')
    if (datasetFull.status === 'draft' && !datasetFull.schema?.length) {
      // nothing pre-existing schema to compare to
    } else {
      if (datasetFull.draft) Object.assign(datasetFull.draft, patch)
      const datasetDraft = datasetUtils.mergeDraft({ ...datasetFull })
      const breakingChanges = schemaUtils.getSchemaBreakingChanges(datasetFull.schema ?? [], datasetDraft.schema, false, true)
      if (breakingChanges.length) {
        const validationError = 'La structure du fichier contient des ruptures de compatibilité : ' + breakingChanges.map(b => b.summary).join(', ')
        await journals.log('datasets', dataset, { type: 'validation-error', data: validationError } as any)

        if (dataset.draftReason.validationMode === 'compatible') {
          delete patch.validateDraft
        }
        if (dataset.draftReason.validationMode === 'compatibleOrCancel') {
          delete patch.validateDraft
          await cancelDraft()
          return
        }
      }
    }
  }

  // ----- single DiagnosticWriter for the whole run -----
  const writer = new DiagnosticWriter(dataset)

  // ----- Phase A: schema validation (if any rules) -----
  let validationStream: ValidateStream | null = null
  if (datasetUtils.schemaHasValidationRules(dataset.schema)) {
    debug('phase A: validate')
    await journals.log('datasets', dataset, { type: 'validate-start' } as any)
    const progress = taskProgress(dataset.id, 'validate', 100)
    await progress.inc(0)
    const readStreams = await getReadStreams(dataset, false, false, true, progress)
    validationStream = new ValidateStream({ dataset, writer })
    await pump(...readStreams, validationStream)
    await journals.log('datasets', dataset, { type: 'validate-end' } as any)
    debug('phase A: done', { nbErrors: validationStream.nbErrors })

    // compatibleOrCancel + row-level errors → cancel the draft, no diagnostic
    if (validationStream.nbErrors > 0 && dataset.draftReason?.validationMode === 'compatibleOrCancel') {
      await writer.discard()
      delete patch.validateDraft
      await cancelDraft()
      return
    }
  }

  const nbValidationErrors = validationStream?.nbErrors ?? 0

  // ----- Phase B: extensions (if any active) -----
  const activeExtensions = (dataset.extensions ?? []).filter((e: any) => e.active)
  let blockingExtensionErrors = 0
  let totalExtensionErrors = 0
  if (activeExtensions.length) {
    debug('phase B: extend')
    await extensionsUtils.checkExtensions(dataset.schema!, activeExtensions)
    await journals.log('datasets', dataset, { type: 'extend-start' } as any)
    await extensionsUtils.extend(
      dataset,
      activeExtensions,
      'all',
      dataset.validateDraft,
      undefined,
      undefined,
      async (absoluteIndex: number, err: any) => {
        totalExtensionErrors++
        if (!err.mandatory) return // non-mandatory remoteService stays in row.error, not in diagnostic
        blockingExtensionErrors++
        await writer.addError({
          line: absoluteIndex + 1,
          type: 'extension',
          field: err.propertyKey,
          message: err.message,
          rawValue: ''
        })
      }
    )
    await journals.log('datasets', dataset, { type: 'extend-end' } as any)
    debug('phase B: done', { totalExtensionErrors, blockingExtensionErrors })
  }

  // ----- Aggregate decision -----
  if (writer.errorCount > 0) {
    const fileResult = await writer.finalize()
    const summaryParts: string[] = []
    if (nbValidationErrors > 0) {
      const validationSummary = validationStream?.errorsSummary() ?? `${nbValidationErrors} ligne(s) en erreur de validation`
      summaryParts.push(validationSummary)
    }
    if (blockingExtensionErrors > 0) {
      summaryParts.push(`${blockingExtensionErrors} ligne(s) en échec d'enrichissement obligatoire`)
    }
    const summary = summaryParts.join('\n')
    await journals.log('datasets', dataset, {
      type: 'validation-error',
      data: summary,
      hasDiagnosticFile: true,
      diagnosticErrorCount: fileResult.count,
      diagnosticCapped: fileResult.capped,
      validationErrorCount: nbValidationErrors,
      extensionErrorCount: blockingExtensionErrors
    } as any)
    await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validation-error', {
      params: {
        nbErrors: String(fileResult.count),
        diagnosticUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/validation-diagnostic.csv`
      }
    })
    delete patch.validateDraft
    throw new Error(`[validation-error] ${summary}`)
  } else {
    await writer.discard()
  }

  // ----- Success path: bookkeeping -----
  if (activeExtensions.length) {
    // status advances directly to 'extended' (skipping the old intermediate 'validated')
    if (dataset.status !== 'validation-updated') patch.status = 'extended'
    // clear needsUpdate flags on extensions, mirroring today's extend.ts post-loop
    if (dataset.extensions) {
      patch.extensions = dataset.extensions.map((e: any) => {
        const doneE = { ...e }
        delete doneE.needsUpdate
        return doneE
      })
    }
  }

  if (patch.validateDraft) {
    await journals.log('datasets', dataset, { type: 'draft-validated', data: 'validation automatique' } as any)
    await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'draft-validated', {
      localizedParams: { fr: { cause: 'validation automatique' }, en: { cause: 'automatic validation' } }
    })
  }

  await datasetsService.applyPatch(dataset, patch)
  if (activeExtensions.length && !dataset.draftReason) await updateStorage(dataset, false, true)
}
```

(The exported `eventsPrefix` constant is removed because the worker emits its events itself; nothing imports it.)

- [ ] **Step 3: Run the previously-failing combined-errors test**

Run: `npx playwright test tests/features/datasets/extensions/validation-diagnostic.api.spec.ts -g "combined validation"`
Expected: PASS — diagnostic now contains both `,validation,` and `,extension,` rows; `validationErrorCount` and `extensionErrorCount` are populated.

If it does not pass, debug with the systematic-debugging skill before moving on. Common pitfalls:
- `extensionsUtils.checkExtensions` may throw on the test's exprEval extension if the schema lacks the `half` property; the test's `extensions` payload should already include the `property` field via `extensionsUtils.prepareExtensions`. If not, add `prepareExtensionsSchema` from `extensions.ts` before the call.
- `dataset.validateDraft` is undefined on a non-draft create; `extensionsUtils.extend(... ignoreDraftLimit ...)` accepts `undefined` so this is fine.

- [ ] **Step 4: Run all existing diagnostic tests**

Run: `npx playwright test tests/features/datasets/extensions/validation-diagnostic.api.spec.ts`
Expected: PASS — all 5 tests (4 original + 1 new combined). The original tests work because:
- "validation only" — phase A populates the writer; phase B has no active extensions; throw.
- "exprEval throwing on every row" — phase A finds nothing (file is schema-valid); phase B populates; throw.
- "mandatory remoteService failing on every row" — same as above.
- "non-mandatory remoteService" — phase A finds nothing; phase B's onLineError sees `mandatory: false` and skips; writer.errorCount === 0; discard; dataset finalizes.

- [ ] **Step 5: Run the broader extension test suites for regression**

Run: `npx playwright test tests/features/datasets/extensions/`
Expected: PASS — `extensions-core`, `extensions-expressions`, `mandatory-rest`, `validation-diagnostic`.

If `mandatory-rest` regresses, the issue is likely unrelated (REST path is unchanged here); investigate. The other two test file-dataset extension flows that now run through `process-file.ts`'s phase B; they must still pass because the `extensionsUtils.extend(...)` call signature is unchanged.

- [ ] **Step 6: Commit**

```bash
git add api/src/workers/batch-processor/validate-file.ts
git commit -m "feat(workers): merge validation and extension into one file-dataset worker"
```

---

## Task 5: Rename `validate-file.ts` → `process-file.ts`

**Files:**
- Rename: `api/src/workers/batch-processor/validate-file.ts` → `api/src/workers/batch-processor/process-file.ts`
- Modify: `api/src/workers/batch-processor/index.ts`

**Why:** The file's responsibility no longer matches the name. Done as a separate task so the rename is reviewable independently of the rewrite.

- [ ] **Step 1: Move the file**

Run: `git mv api/src/workers/batch-processor/validate-file.ts api/src/workers/batch-processor/process-file.ts`

- [ ] **Step 2: Update the dynamic import in `batch-processor/index.ts`**

In `api/src/workers/batch-processor/index.ts`, change:

```ts
export const validateFile = async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  await eventsQueue.start({ eventsUrl: config.privateEventsUrl, eventsSecret: config.secretKeys.events, inactive: !config.privateEventsUrl })
  const validateFile = await import('./validate-file.ts')
  await validateFile.default(dataset)
}
```

to:

```ts
export const validateFile = async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  await eventsQueue.start({ eventsUrl: config.privateEventsUrl, eventsSecret: config.secretKeys.events, inactive: !config.privateEventsUrl })
  const processFile = await import('./process-file.ts')
  await processFile.default(dataset)
}
```

(The exported function name `validateFile` stays — it's the contract with `tasks.ts`.)

- [ ] **Step 3: Search for any other reference to `validate-file`**

Run: `grep -rn "validate-file\|validate-file.ts" api/src tests | grep -v node_modules`
Expected: zero hits in source code (only in committed git logs / docs which don't matter for runtime).

If there are any production-code hits, update them.

- [ ] **Step 4: Run lint + types**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 5: Run full diagnostic + extension regression**

Run: `npx playwright test tests/features/datasets/extensions/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/workers/batch-processor/index.ts api/src/workers/batch-processor/process-file.ts
git commit -m "refactor(workers): rename validate-file to process-file"
```

(`git mv` records both sides as one rename; the index.ts change is the only "real" diff.)

---

## Task 6: Rename `extend.ts` → `extend-rest.ts` and remove the dead diagnostic block

**Files:**
- Rename: `api/src/workers/batch-processor/extend.ts` → `api/src/workers/batch-processor/extend-rest.ts`
- Modify: `api/src/workers/batch-processor/index.ts`

**Why:** After Task 3, `extend.ts` only handles REST datasets. The DiagnosticWriter block inside it (`collectDiagnostic = !isRestDataset && updateMode === 'all'`) is unreachable in this configuration — remove it.

- [ ] **Step 1: Move the file**

Run: `git mv api/src/workers/batch-processor/extend.ts api/src/workers/batch-processor/extend-rest.ts`

- [ ] **Step 2: Trim the diagnostic block**

Open `api/src/workers/batch-processor/extend-rest.ts` and replace its entire contents with:

```ts
import debugLib from 'debug'
import * as extensionsUtils from '../../datasets/utils/extensions.ts'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetService from '../../datasets/service.js'
import * as restDatasetsUtils from '../../datasets/utils/rest.ts'
import type { DatasetInternal } from '#types'
import { isRestDataset } from '@data-fair/data-fair-shared/types-utils.ts'

const debugMasterData = debugLib('master-data')

// REST-only extension worker. Runs after a REST dataset has new lines
// (_partialRestStatus === 'updated') or when an extension has needsUpdate.
// Mandatory extensions for REST are enforced on the request hot path
// (api/src/datasets/utils/rest.ts → applyReqTransactions), not here, so this
// worker never writes the validation-diagnostic CSV.

export default async function (dataset: DatasetInternal) {
  const debug = debugLib(`worker:extend-rest:${dataset.id}`)

  if (!isRestDataset(dataset)) {
    throw new Error(`extend-rest invoked on non-REST dataset ${dataset.id} — should not happen after the process-file merge`)
  }

  let updateMode: 'all' | 'updatedLines' | 'updatedExtensions' = 'all'
  if (dataset.status === 'finalized' && dataset.extensions?.find(e => e.needsUpdate)) updateMode = 'updatedExtensions'
  else if (dataset._partialRestStatus === 'updated') updateMode = 'updatedLines'
  debug('update mode', updateMode)

  const patch: Partial<DatasetInternal> = {}
  if (updateMode === 'all') {
    patch.status = 'extended'
  } else {
    patch._partialRestStatus = 'extended'
  }

  let extensions = dataset.extensions || []
  if (updateMode === 'updatedExtensions') extensions = extensions.filter(e => e.needsUpdate)

  debug('check extensions validity')
  await extensionsUtils.checkExtensions(dataset.schema!, extensions)

  debug('apply extensions', dataset.extensions)
  await extensionsUtils.extend(dataset, extensions, updateMode, dataset.validateDraft)
  debug('extensions ok')

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (updateMode !== 'all' && await restDatasetsUtils.count(dataset, { _needsExtending: true })) {
    debug('REST dataset extended, but some data has changed, stay in "updated" status')
    patch._partialRestStatus = 'updated'
  }

  debugMasterData(`apply patch after extensions ${dataset.id} (${dataset.slug})`, patch)
  if (updateMode !== 'updatedLines' && dataset.extensions) {
    patch.extensions = dataset.extensions.map(e => {
      const doneE = { ...e }
      delete doneE.needsUpdate
      return doneE
    })
  }
  await datasetService.applyPatch(dataset, patch)
  if (!dataset.draftReason) await updateStorage(dataset, false, true)
  debug('done')
}
```

Notes:
- The `'lineIds'` updateMode is dropped from the union because nothing in the REST path uses it (it was only for the simulation/file-dataset code paths).
- The `collectDiagnostic` writer block is gone.
- The `import { sendResourceEvent }`, `import config from '#config'`, `import { DiagnosticWriter }`, `import * as journals` lines are all gone (no longer needed).

- [ ] **Step 3: Update the dynamic import in `batch-processor/index.ts`**

In `api/src/workers/batch-processor/index.ts`, change:

```ts
export const extend = async function (dataset: Dataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  await wsEmitter.init(mongo.db)
  const extend = await import('./extend.ts')
  await extend.default(dataset)
}
```

to:

```ts
export const extend = async function (dataset: Dataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  await wsEmitter.init(mongo.db)
  const extendRest = await import('./extend-rest.ts')
  await extendRest.default(dataset)
}
```

- [ ] **Step 4: Search for any other reference to `extend.ts` (the file path) in source**

Run: `grep -rn "batch-processor/extend\b\|batch-processor/extend.ts" api/src | grep -v extend-rest`
Expected: zero hits.

- [ ] **Step 5: Run lint + types**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 6: Run REST-extension regression**

Run: `npx playwright test tests/features/datasets/extensions/mandatory-rest.api.spec.ts`
Expected: PASS.

Run: `npx playwright test tests/features/datasets/extensions/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/workers/batch-processor/index.ts api/src/workers/batch-processor/extend-rest.ts
git commit -m "refactor(workers): rename extend to extend-rest, drop dead diagnostic block"
```

---

## Task 7: Add the additional integration tests

**Files:**
- Modify: `tests/features/datasets/extensions/validation-diagnostic.api.spec.ts`

**Why:** Lock in the cap-across-phases behavior and the combined-with-mandatory-remoteService case so a future regression is caught.

- [ ] **Step 1: Add the combined validation + mandatory remoteService test**

Append inside the `test.describe('validation diagnostic file', () => { ... })` block (just before the closing `})`):

```ts
  test('combined validation + mandatory remoteService errors land in the same diagnostic CSV', async () => {
    // Fixture (tests/resources/datasets/dataset-extensions.csv) has 2 rows:
    //   koumoul,19 rue de la voie lactée saint avé
    //   other,unknown address
    const dataset = await sendDataset('datasets/dataset-extensions.csv', testUser1)

    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { error: 'mock failure' } }
    })

    // Tighten the label schema so 'other' fails validation (only 'koumoul' matches);
    // the mandatory remoteService returns an error on every row → both rows fail extension.
    const labelField = dataset.schema.find((f: any) => f.key === 'label')
    labelField.pattern = '^k.*$'
    const adrField = dataset.schema.find((f: any) => f.key === 'adr')
    adrField['x-refersTo'] = 'http://schema.org/address'

    const res = await testUser1.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        mandatory: true,
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })
    assert.equal(res.status, 200)
    const errored = await waitForDatasetError(testUser1, dataset.id)
    assert.equal(errored.status, 'error')

    const errEvent = await findEvent(dataset.id, 'validation-error')
    assert.ok(errEvent)
    assert.equal(errEvent.hasDiagnosticFile, true)
    assert.ok((errEvent.validationErrorCount ?? 0) > 0)
    assert.ok((errEvent.extensionErrorCount ?? 0) > 0)

    const diag = await fetchDiagnostic(dataset.id)
    assert.equal(diag.status, 200)
    const dataRows = diag.data.replace(/^﻿/, '').trim().split('\n').slice(1)
    const hasValidation = dataRows.some((r: string) => r.includes(',validation,'))
    const hasExtension = dataRows.some((r: string) => r.includes(',extension,'))
    assert.ok(hasValidation, `expected validation rows: ${diag.data}`)
    assert.ok(hasExtension, `expected extension rows: ${diag.data}`)
  })
```

- [ ] **Step 2: Run the new test**

Run: `npx playwright test tests/features/datasets/extensions/validation-diagnostic.api.spec.ts -g "combined validation \\+ mandatory remoteService"`
Expected: PASS — one `,validation,` row (line 3, `'other'` failing the `^k.*$` pattern), two `,extension,` rows (both addresses returned an error from the mock).

- [ ] **Step 3: Add the cap-across-phases test (lightweight)**

The full 10 000-error test is slow; instead add a smoke test that confirms the breakdown counts agree with the file content for a known small case. Append:

```ts
  test('breakdown counts in the journal event match the diagnostic file content', async () => {
    const schema = [
      { key: 'id', type: 'string', pattern: '^[a-z]+$' },
      { key: 'n', type: 'number' }
    ]
    const csv = 'id,n\n' + [
      '1,2',     // validation fail
      '2,0',     // validation fail + extension fail
      'a,0',     // extension fail only
      'b,5'      // ok
    ].join('\n') + '\n'
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'breakdown.csv')
    form.append('schema', JSON.stringify(schema))
    form.append('extensions', JSON.stringify([{
      active: true,
      type: 'exprEval',
      expr: '10 / n',
      property: { key: 'half', type: 'number' }
    }]))
    const ds = (await testUser1.post('/api/v1/datasets', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    })).data
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    const diag = await fetchDiagnostic(ds.id)
    const dataRows = diag.data.replace(/^﻿/, '').trim().split('\n').slice(1)
    const validationCount = dataRows.filter((r: string) => r.includes(',validation,')).length
    const extensionCount = dataRows.filter((r: string) => r.includes(',extension,')).length
    assert.equal(errEvent.validationErrorCount, validationCount,
      `breakdown.validationErrorCount=${errEvent.validationErrorCount} mismatched file=${validationCount}`)
    assert.equal(errEvent.extensionErrorCount, extensionCount,
      `breakdown.extensionErrorCount=${errEvent.extensionErrorCount} mismatched file=${extensionCount}`)
    assert.equal(errEvent.diagnosticErrorCount, validationCount + extensionCount)
  })
```

- [ ] **Step 4: Run the new test**

Run: `npx playwright test tests/features/datasets/extensions/validation-diagnostic.api.spec.ts -g "breakdown counts"`
Expected: PASS.

- [ ] **Step 5: Run the full diagnostic suite once more**

Run: `npx playwright test tests/features/datasets/extensions/validation-diagnostic.api.spec.ts`
Expected: PASS — 7 tests (4 original + combined exprEval + combined mandatory remoteService + breakdown).

- [ ] **Step 6: Commit**

```bash
git add tests/features/datasets/extensions/validation-diagnostic.api.spec.ts
git commit -m "test: add combined validation+extension and breakdown-count tests"
```

---

## Task 8: Update the prior design spec status and commit

**Files:**
- Modify: `docs/superpowers/specs/2026-04-29-extension-validation-design.md`

**Why:** The April 29 spec explicitly stated that validation and extension errors *cannot* coexist in the diagnostic file. After this change, that statement is wrong. Mark it superseded so a future reader doesn't trust it.

- [ ] **Step 1: Patch the status line**

In `docs/superpowers/specs/2026-04-29-extension-validation-design.md`, change the very first non-heading line from:

```
Status: implemented (api + workers + UI). Integration tests deferred — to be added once the dev environment is exercised against the new endpoints.
```

to:

```
Status: superseded in part by `docs/superpowers/specs/2026-05-05-process-file-merge-design.md`. The §2 / §4.3 / §7 statements that "validation and extension errors cannot coexist in the same diagnostic file" no longer hold after the process-file merge.
```

- [ ] **Step 2: Run the full extension test suite one last time**

Run: `npx playwright test tests/features/datasets/extensions/`
Expected: PASS.

- [ ] **Step 3: Run lint + types across the repo**

Run: `npm run lint && npm run check-types`
Expected: PASS (lint warnings unrelated to this change, like the `dataset-status.vue` line-break warnings already on the branch, are acceptable; lint **errors** are not).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-29-extension-validation-design.md
git commit -m "docs: mark 2026-04-29 spec as partially superseded by process-file merge"
```

---

## Task 9: Final sweep

- [ ] **Step 1: Run the broader dataset suite for regression**

Run: `npx playwright test tests/features/datasets/`
Expected: PASS.

- [ ] **Step 2: If any failure surfaces, do not paper over it**

Use the `superpowers:systematic-debugging` skill. Likely suspects:
- Tests that asserted the old "validate worker emits validation-error" / "extend worker emits validation-error" event timing — they now see the single combined event from `process-file.ts`.
- Tests that asserted dataset status `'validated'` between phases for a file dataset with extensions — that intermediate status no longer occurs; status goes from `analyzed` directly to `extended`.

- [ ] **Step 3: Review the final diff**

Run: `git diff master..HEAD --stat`
Expected: see the renamed files (`process-file.ts`, `extend-rest.ts`), `tasks.ts`, `diagnostic-file.ts`, `batch-processor/index.ts`, and the test file. Plus the two doc files.

- [ ] **Step 4: Hand off**

The branch is ready for review. Open a PR to `master` using `gh pr create` (do not run automatically — wait for explicit instruction).
