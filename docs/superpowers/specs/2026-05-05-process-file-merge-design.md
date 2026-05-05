# Merging validate-file and extend into a single file-dataset worker

Status: draft, awaiting user review.
Branch: `feat-extension-validation` (continuation).
Driver: the original spec (`2026-04-29-extension-validation-design.md`) split validation and extension across two workers and explicitly stated that validation errors and mandatory-extension errors *cannot* coexist in the same diagnostic file. That contradicts the actual requirement: every row error from a single processing attempt — schema validation **and** mandatory enrichment — must land in **one** diagnostic CSV the user can download.

We discussed merging the two streams into a single Transform but rejected that as too large a change. This spec adopts the smaller alternative: keep both stream classes (`ValidateStream` and `ExtensionsStream`) intact, but run them in sequence inside a single worker function that owns one `DiagnosticWriter` for the entire run.

## 1. Goals

1. For file datasets, every row-level error of a single processing attempt — schema validation **and** mandatory extension (`exprEval` always; `remoteService` when `mandatory: true`) — appears in the same diagnostic CSV.
2. The dataset's status semantics stay clean: a dataset with row errors enters the existing error state at the end of the combined run. There is no intermediate state where the dataset is `validated` but holds invisible validation errors.
3. The 2-phase progress UX is preserved: the UI continues to render two separate progress streams (`validate-*` then `extend-*` journal events).
4. No change to REST datasets — they keep their existing in-memory mandatory-extension hot path (`extendBatchSync` from `applyReqTransactions`) and the existing post-write extension worker (renamed but functionally unchanged).

## 2. Non-goals

- No streaming-level merge of validation and extension into a single Transform. Backpressure entanglement, plus the existing `ExtensionsStream` (~250 lines of remote-service / cache / batch logic) make the rewrite cost too high relative to the benefit.
- No change to the diagnostic file format or the download endpoint.
- No change to the `mandatory` flag semantics or to `extendBatchSync` (the REST hot path).
- No change to `nbErrors` semantics, journal event types, or notification keys.
- No new dataset status.
- No rate limiting (still a follow-up — see prior spec §9).

## 3. Architecture

### 3.1 The combined worker function

`api/src/workers/batch-processor/validate-file.ts` is renamed `process-file.ts` and becomes the file-dataset processor. It owns one `DiagnosticWriter` for the whole run.

Pseudo-code of the new worker body (replacing the current default export):

```ts
export default async function (dataset: DatasetInternal) {
  // 1. existing draft compatibility checks (lines 100-128 of today's validate-file.ts)
  //    — unchanged. They handle the `compatibleOrCancel` breaking-changes path
  //    and emit their own 'validation-error' journal event with no diagnostic file.

  const writer = new DiagnosticWriter(dataset)

  // 2. PHASE A — validation
  let nbValidationErrors = 0
  if (datasetUtils.schemaHasValidationRules(dataset.schema)) {
    await journals.log('datasets', dataset, { type: 'validate-start' })
    const progress = taskProgress(dataset.id, 'validate', 100)
    await progress.inc(0)
    const readStreams = await getReadStreams(dataset, false, false, true, progress)
    const validateStream = new ValidateStream({ dataset, writer })
    await pump(...readStreams, validateStream)
    nbValidationErrors = validateStream.nbErrors
    await journals.log('datasets', dataset, { type: 'validate-end' })

    // compatibleOrCancel + row-level errors → cancel the draft, no diagnostic
    if (nbValidationErrors > 0 && dataset.draftReason?.validationMode === 'compatibleOrCancel') {
      await writer.discard()
      delete patch.validateDraft
      await cancelDraft()
      return
    }
  }

  // 3. PHASE B — extensions (only if at least one is active)
  let nbExtensionErrors = 0
  let blockingExtensionErrors = 0
  const activeExtensions = (dataset.extensions ?? []).filter(e => e.active)
  if (activeExtensions.length) {
    await journals.log('datasets', dataset, { type: 'extend-start' })
    await extensionsUtils.checkExtensions(dataset.schema!, activeExtensions)
    await extensionsUtils.extend(
      dataset, activeExtensions, 'all', dataset.validateDraft, undefined, undefined,
      async (absoluteIndex, err) => {
        nbExtensionErrors++
        if (err.mandatory) blockingExtensionErrors++
        // only mandatory failures are recorded in the diagnostic, matching today's rule
        // (non-mandatory remoteService errors stay in the row's `error` field and don't
        // contribute to the diagnostic).
        if (err.mandatory) {
          await writer.addError({
            line: absoluteIndex + 1,
            type: 'extension',
            field: err.propertyKey,
            message: err.message,
            rawValue: ''
          })
        }
      }
    )
    await journals.log('datasets', dataset, { type: 'extend-end' })
  }

  // 4. Aggregate decision
  if (writer.count > 0) {
    const fileResult = await writer.finalize()
    const summaryParts = []
    if (nbValidationErrors > 0) summaryParts.push(`${nbValidationErrors} ligne(s) en erreur de validation`)
    if (blockingExtensionErrors > 0) summaryParts.push(`${blockingExtensionErrors} ligne(s) en échec d'enrichissement obligatoire`)
    const summary = summaryParts.join(' ; ')
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
        nbErrors: String(writer.count),
        diagnosticUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/validation-diagnostic.csv`
      }
    })
    delete patch.validateDraft
    throw new Error(`[validation-error] ${summary}`)
  } else {
    await writer.discard()
  }

  // 5. status patch & finalize-extensions bookkeeping
  //    - if extensions ran successfully, advance to 'extended' (the status indexLines
  //      expects today after extend.ts succeeded);
  //    - if no extensions ran, advance to 'validated' (matches indexLines' no-ext filter).
  //    - existing 'validation-updated' → 'finalized' path stays.
  //    - clear `needsUpdate` flags on extensions, same as today's extend.ts (line 100-106).
  // (existing patch logic, with adjustments for the post-extension success path)

  if (patch.validateDraft) { /* unchanged journal & notification */ }
  await datasetsService.applyPatch(dataset, patch)
  if (activeExtensions.length && !dataset.draftReason) await updateStorage(dataset, false, true)
}
```

The validation-throws-on-row-errors behavior is gone; the only throw is at the end of the combined run.

### 3.2 What happens to `extend.ts`

`api/src/workers/batch-processor/extend.ts` is renamed `extend-rest.ts`. Its file-dataset code paths are removed:

- The `collectDiagnostic` block (current lines 38-90) is **removed entirely**. After the merge, no REST path ever wrote to the diagnostic (`collectDiagnostic = !isRestDataset && updateMode === 'all'` was already false for REST), so this is dead code.
- The `updateMode` resolution stays — it still distinguishes `'updatedLines'`, `'updatedExtensions'`, and (for backwards safety on `extendBatchSync` callers reusing the function) `'all'`. After the merge, only the REST update modes can reach this worker.
- The post-loop logic (lines 92-109) — `_partialRestStatus` adjustments, `applyPatch`, `updateStorage` — stays.

The file becomes ~50 lines. Its name change reflects what it actually does.

### 3.3 Task registry (`api/src/workers/tasks.ts`)

| Task entry | Today | After merge |
|---|---|---|
| `validateFile` task | filter: file dataset, status ∈ {analyzed, validation-updated}; `eventsPrefix: 'validate'` | filter unchanged; **`eventsPrefix` removed** so the framework no longer auto-emits `validate-start`/`validate-end` (the worker emits them itself, plus `extend-start`/`extend-end`) |
| `extend` task | filter: 4 cases (file validated, draft validated, REST partial-updated, REST extension needs-update); `eventsPrefix: 'extend'` | filter: REST cases only (the two file-dataset $or branches at lines 198-199 are removed); `eventsPrefix: 'extend'` unchanged. Optionally rename task to `extendRest` for symmetry; we keep `extend` to avoid touching public-ish task names. |
| `indexLines` task | unchanged | unchanged — its existing filters (`isValidatedMongoFilter() && no-active-extension` for no-ext file datasets; `status: 'extended'` for ext file datasets; REST cases) match the post-merge statuses |

Dropping `eventsPrefix` from the `validateFile` task means:
- The framework's `journals.log({type: 'validate-start'})` at task start is skipped — `process-file.ts` emits it manually only when entering the validation phase.
- The framework's `journals.log({type: 'validate-end'})` at task end is skipped — same.
- The framework's `taskProgress(resource.id, task.eventsPrefix)` at task wrapper level is skipped — the worker creates per-phase progress reporters internally (one for `'validate'`, one for `'extend'`), unchanged from how `validate-file.ts` and `extend.ts` create progress today.
- The `finalTask` special case in `processResourceTask` (`api/src/workers/index.ts:196`) — `task.eventsPrefix === 'validate' && resource.draftReason && !newResource.draft && newResource.status` — is preserved by setting an equivalent flag in the manual `progress.end()` calls inside `process-file.ts`. The condition (cancelled-draft) is computed locally by checking `dataset.draftReason && !newResource.draft && newResource.status` after the patch is applied.

The metric (`workersTasksHistogram`) and the in-memory `pendingTasks` map are not gated by `eventsPrefix`, so they keep working without change.

### 3.4 Status transitions

| Pre-existing status | Active extensions? | Result of `process-file.ts` |
|---|---|---|
| `analyzed` | yes | success → `extended` (skips the old `validated` step); error → `error` |
| `analyzed` | no | success → `validated`; error → `error` |
| `validation-updated` | yes | success → `finalized` (revalidation does **not** re-run extensions; same as today) |
| `validation-updated` | no | success → `finalized` |

Revalidation never re-runs extensions; if an operator wants re-extension after a schema change they go through the existing `needsUpdate` flag mechanism (REST) or a fresh draft (file). This matches today's behavior — file datasets in `finalized` status with extensions don't currently re-extend.

## 4. Diagnostic file lifecycle (unchanged)

The `DiagnosticWriter` class is unchanged. Its single open / single finalize semantics fit the merged worker perfectly:

- one `new DiagnosticWriter(dataset)` per worker invocation;
- `writer.addError(...)` from both `ValidateStream` (during phase A) and the `onLineError` hook of `ExtensionsStream` (during phase B);
- `writer.finalize()` once at the end if any errors were collected;
- `writer.discard()` once at the end if zero errors, to clean any stale file from a prior failed attempt.

The 10 000 errors cap remains. When the cap is reached during phase A, phase B still runs and tries to add — the writer silently drops further entries and reports `capped: true`. The `diagnosticCapped` journal flag stays accurate. The cap is the count across both phases (one budget for the file, not one per phase).

## 5. Journal events

| Event type | Source today | Source after merge |
|---|---|---|
| `validate-start` / `validate-end` | framework (validateFile task wrapper) | manually emitted by `process-file.ts` around phase A |
| `extend-start` / `extend-end` | framework (extend task wrapper) for file datasets; framework (extend-rest task) for REST | `process-file.ts` for file datasets (around phase B); framework still for REST |
| `validation-error` | `validate-file.ts` (validation row errors) **or** `extend.ts` (mandatory extension errors), never both in one attempt | `process-file.ts` only — single event per attempt with combined breakdown (`validationErrorCount`, `extensionErrorCount`) |
| `draft-validated` | `validate-file.ts` (only on success) | `process-file.ts` |
| `draft-cancelled` | `validate-file.ts`'s `cancelDraft` helper | `process-file.ts`'s `cancelDraft` helper (unchanged) |

The journal listing in the UI keeps showing two separate progress sections — `validate-start`/`validate-end` and `extend-start`/`extend-end` — because the events are emitted at the right phase boundaries. The 2-phase loading UX is preserved.

The `validation-error` event gains two new optional integer fields (`validationErrorCount`, `extensionErrorCount`). UI rendering can use them to display "X validation errors and Y enrichment errors" in the journal entry. Both are derived from counters maintained by the worker; they sum to at most `diagnosticErrorCount` (which is what the file actually contains, after the cap).

## 6. Modules touched

1. `api/src/workers/batch-processor/validate-file.ts` → rename to `process-file.ts`. Body is the merged worker (§3.1).
2. `api/src/workers/batch-processor/extend.ts` → rename to `extend-rest.ts`. Diagnostic block removed (§3.2).
3. `api/src/workers/batch-processor/index.ts` → adjust the dynamic imports to the new file paths. The exported function names (`validateFile`, `extend`) stay the same so `tasks.ts` doesn't need to know.
4. `api/src/workers/tasks.ts` → drop `eventsPrefix` from the `validateFile` task entry; narrow the `extend` task's `mongoFilter` to REST-only cases (drop the two file-dataset `$or` branches).
5. `api/src/datasets/utils/diagnostic-file.ts` — add a one-line public getter `get count()` on `DiagnosticWriter` so the worker can branch on `writer.count > 0` to decide finalize-vs-discard. No other behavior change.
6. No changes to `api/src/datasets/utils/extensions.ts` or `api/src/datasets/utils/rest.ts`.

## 7. Error handling & edge cases

- **Validation throws a `[noretry]` non-row-level error** (e.g., schema parse failure inside AJV, broken read stream): the outer try in `process-file.ts` lets it bubble up as today; no diagnostic file is produced. The dataset enters the existing error state.
- **Extension throws a dataset-level error** (e.g., remote service definition missing — `buildDetailedExtensions` throws): same as above — bubbles up as today (`[noretry]` semantics preserved).
- **Validation produces zero errors, extension produces zero errors**: writer is discarded (no file, no journal `validation-error` event). Dataset advances to `extended` (or `validated` if no extension).
- **Validation produces N errors, extension is not configured**: writer.count = N → finalize, journal `validation-error` with `validationErrorCount: N, extensionErrorCount: 0`, throw. Same user experience as before (file with N rows, dataset in error state).
- **Validation produces 0 errors, extension produces M blocking errors**: writer.count = M → finalize, journal `validation-error` with `validationErrorCount: 0, extensionErrorCount: M`, throw.
- **Validation produces N errors, extension produces M blocking errors**: writer.count = N + M → finalize, journal `validation-error` with both counts, throw. This is the new behavior the user asked for.
- **Validation produces N errors, extension produces only non-mandatory errors**: writer.count = N (non-mandatory don't add). Finalize, throw. Non-mandatory errors stay in row error fields as today.
- **Validation cap reached at 10 000**: phase B still runs but its addError calls are silent no-ops. `diagnosticCapped: true`. The dataset still enters error state.
- **`compatibleOrCancel` validationMode + row-level validation errors**: writer is discarded (the draft is being cancelled and the directory cleanup wipes any partial diagnostic). Extension phase is **not** entered. The `cancelDraft` path is unchanged.
- **`compatibleOrCancel` validationMode + breaking schema changes**: existing path (lines 100-128) untouched — no diagnostic file produced, same as today.
- **Empty file dataset**: same as today — validation finds no rows, extension processes no rows, writer.count = 0, dataset finalizes.
- **Cascading errors** (a row that fails validation also produces a "garbage in" extension error, e.g. exprEval `n / 2` on a row whose `n` is the string `"abc"`): both errors are recorded. No suppression — explicit user direction.

## 8. Testing

### 8.1 Existing tests (must keep passing)

- `tests/features/datasets/extensions/validation-diagnostic.api.spec.ts` — three positive tests (validation-only, exprEval-only, mandatory remoteService-only) and one negative (non-mandatory remoteService → no file). All four scenarios still work because:
  - validation-only: phase A populates the writer; phase B is a no-op (no extensions); finalize → throw.
  - exprEval-only / mandatory remoteService-only: phase A finds no errors (the test data is schema-valid); phase B populates the writer.
  - non-mandatory: phase A finds no errors; phase B's onLineError sees `mandatory: false` and doesn't add to the writer; writer.count = 0 → discard → no file.

### 8.2 New tests

Added to `tests/features/datasets/extensions/validation-diagnostic.api.spec.ts`:

1. **Combined errors:** dataset whose schema rejects some rows AND whose exprEval throws on some other rows → diagnostic CSV contains both kinds; the journal `validation-error` event reflects the breakdown (`validationErrorCount > 0 && extensionErrorCount > 0`); both `,validation,` and `,extension,` rows present.

2. **Combined errors with mandatory remoteService:** dataset whose schema rejects some rows AND whose mandatory remoteService returns an error on some other rows → same as above but with `extension` rows attributed to remoteService.

3. **Validation passes, extension passes:** dataset finalizes, no diagnostic file, no `validation-error` event. (Already implicitly covered by other tests; assert explicitly to lock the discard path.)

4. **Cap behavior across phases:** craft a small dataset where validation produces 9 999 errors and extension produces 100 → file has exactly 10 000 rows; `diagnosticCapped: true`; counts in the journal event reflect actual errors not the truncated row count.

### 8.3 Tests that need updating

- Any test that asserted "extension worker emits `validation-error` event" or "validate worker emits `validation-error` event" individually — adjusted to assert the single `validation-error` event from `process-file.ts` with the new breakdown fields.

### 8.4 Out-of-scope tests

- REST behavior (`extendBatchSync` on the hot path, async-bulk reject) is untouched; existing REST tests still pass without modification.
- Extension worker for REST partial updates (renamed `extend-rest.ts`): no behavior change beyond the diagnostic block removal; existing partial-update REST tests still pass.

## 9. Migration

No data migration. No DB schema change. No existing dataset is affected on deploy until its next processing run, which transparently goes through the merged worker.

## 10. Out of scope (follow-ups)

- Streaming-level merge of validation + extension into a single Transform — explicitly rejected here on cost-vs-benefit grounds. Could be revisited if the double-read of the source file becomes a measurable hot-path issue.
- Surfacing the diagnostic file mid-run (e.g. expose the partial diagnostic during a long extension phase) — current design only publishes the file after the worker function exits, even when the validation phase has already populated rows. Adds complexity to the file lifecycle (atomic move vs. live append visible to the API). Not requested.
- Rate limiting on REST hot path with mandatory extensions — still a separate spec.
