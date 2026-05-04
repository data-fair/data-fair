# Extension validation — design

Status: implemented (api + workers + UI). Integration tests deferred — to be added once the dev environment is exercised against the new endpoints.
Branch: `feat-extension-validation`.
Driver: RGE use case — an enrichment must be treatable as part of a dataset's validation logic, and validation diagnostics on a dataset must be more complete than the current "first 3 errors inline in the journal".

## 1. Goals

1. Allow a dataset operator to mark an extension as **mandatory**: a row that fails this extension is treated as a row that fails validation.
2. For **file-based datasets** (non-editable), produce a complete, downloadable **validation diagnostic file** containing every row-level error from the latest validation attempt. The current inline "first 3 errors" in the journal is preserved as a summary; the diagnostic file is the exhaustive source.
3. For **editable (REST) datasets**, run mandatory extensions **in memory before MongoDB insertion** so that an enrichment failure aborts the write cleanly with no partial state. For bulk writes that exceed the in-memory threshold, reject with `400` when at least one mandatory extension is configured.
4. Document — but do not implement — rate-limiting on REST write endpoints when a mandatory extension is active. This is a known follow-up, treated in a separate spec.

## 2. Non-goals

- No change to virtual datasets (no extensions there).
- No change to non-mandatory extensions: the existing "errors collected per row, never blocking" behavior is preserved.
- No unification of validation and extension into a single streaming pass for file datasets. The current two-phase architecture (`validate-file.ts` → `extend.ts`) is kept; mandatory-extension errors and validation errors live in the same diagnostic file format but cannot coexist in the same file (they correspond to two separate phases of a single processing attempt — see §4).
- No rate limiting in this spec.
- No new dataset status. The existing `validation-error` journal event and error status are reused.

## 3. Data model

A new optional boolean `mandatory` on `dataset.extensions[]` entries of type `remoteService` only. Default `false`. The flag is dataset-level — the `remoteService` action contract is unchanged. This keeps the existing rule that an extension is fully configured at the dataset level (alongside `active`, `select`, `overwrite`, `propertyPrefix`).

```ts
// shape after change
type RemoteServiceExtension = {
  type: 'remoteService'
  active: boolean
  mandatory?: boolean  // NEW — default false; only on remoteService
  // ...existing fields
}
```

`exprEval` extensions intentionally do not have a `mandatory` flag. An expression evaluation failure (a throw at evaluation time on a row) is **always** treated as a blocking validation error — there is no "soft" mode for exprEval. The rationale: an expression that throws is a contract violation between the configured expression and the data, conceptually equivalent to a row failing schema validation. The diagnostic file still collects every failing row so the user can investigate exhaustively.

Behavior summary:

| Situation | Effect on the row | Effect on the dataset |
|---|---|---|
| `exprEval` throws on a row | row's calculated property is unset, error written to diagnostic | dataset enters error state at end of stream |
| `remoteService` returns `errorKey` populated, `mandatory: false` | row's error field is set as today (no change) | dataset finalizes (no change) |
| `remoteService` returns `errorKey` populated, `mandatory: true` | row's error field is set + recorded in diagnostic | dataset enters error state at end of stream |
| `remoteService` returns success | no error | no effect |

## 4. File datasets — validation flow

Two existing workers run in sequence: `api/src/workers/batch-processor/validate-file.ts` then `api/src/workers/batch-processor/extend.ts` (followed by `index-lines.ts`). The diagnostic file is generated at the phase that actually fails.

### 4.1 Phase A — validation (`validate-file.ts`)

Today the worker:
- streams the file through `ValidateStream`,
- collects up to 3 line-level error messages,
- on any error: logs a `validation-error` journal event with a summary message and `throw`s `[noretry]`.

Changes:
- `ValidateStream` collects **every** row-level error (with line number, field, message), not just the first 3.
- A `DiagnosticWriter` (new module — see §6) is opened for the dataset and receives every error as it occurs. It writes a CSV via `filesStorage` to a new path `validationDiagnosticFilePath(dataset)`.
- The 3-error inline summary in the journal is preserved (UX: human-readable hint in the timeline). The `validation-error` event gains an additional flag `hasDiagnosticFile: true` so the UI can render a "Download diagnostic" link.
- A notification with the new i18n key `notifications.datasets.validation-error` is sent. The body localizes "X rows failed validation. Download the diagnostic file to investigate." with a deep link.
- The diagnostic file is associated with the **draft** when validating in draft mode (it lives under the draft sub-tree), with the main dataset otherwise. There is exactly one diagnostic file per dataset (per draft) — each new validation attempt overwrites it.
- The worker still `throw`s `[noretry]` after writing the file, so the dataset stays in the same error state as today.

### 4.2 Phase B — extension (`extend.ts` / `ExtensionsStream`)

Today `ExtensionsStream`:
- batches 1000 rows of NDJSON,
- POSTs them to the remote service,
- merges results back into rows; if a result has the `errorKey` field set, the row's error is recorded but processing continues.
- For `exprEval` extensions, the expression error is wrapped with `[noretry]` and currently fails the whole stream.

Changes:
- The stream tracks per-row failures from active extensions, with two sources: `exprEval` evaluation throws (always blocking — see §3) and `remoteService` results whose `errorKey` is populated when `mandatory: true`.
- These failures are written to a `DiagnosticWriter` as they happen (`error_type = extension`). Per-row remoteService errors with `mandatory: false` keep their current behavior (stored in the row's error field, not in the diagnostic file, not blocking).
- At end of stream, if any blocking failures were collected:
  - the CSV is finalized (it overwrites any prior file, which should not exist since validation succeeded — see §4.3),
  - a `validation-error` journal event is logged with `hasDiagnosticFile: true` and a summary like "X rows failed enrichment (Y blocking)",
  - the `notifications.datasets.validation-error` notification is sent,
  - the worker `throw`s `[noretry]` so the dataset enters the same error state as a validation failure.

### 4.3 Diagnostic file lifecycle

- One file per dataset (per draft): `validationDiagnosticFilePath(dataset)`. Located under the existing `dir(dataset)` (or its draft sub-tree).
- Re-evaluated each validation+extension attempt. Lifecycle is owned by `DiagnosticWriter`:
  - if the attempt produced errors → the writer flushes, overwriting any previous file;
  - if the attempt produced zero errors → `discard()` removes the file if it existed.
- Because validation `throw`s before extension when validation fails, in practice the file at any given moment contains either (a) the validation errors of the latest validation failure, or (b) the extension errors of the latest extension run — never both.
- The diagnostic file does not survive past a successful run: the writer's `discard()` removes it. (There is no path that writes the diagnostic and lets the dataset finalize successfully — both blocking sources, exprEval throw and remoteService mandatory error, throw `[noretry]`.)
- Removed when a draft is cancelled (existing `cancelDraft` path) along with the rest of the draft directory.
- Format: CSV, UTF-8, header row `line,error_type,field,message,raw_value`. `error_type` is `validation` or `extension`. `raw_value` is the offending field's source value, truncated to ~200 chars.
- Hard cap: **10 000 rows of errors** per file. When the cap is reached, the writer stops appending and records that the cap was hit. The journal summary message reflects the cap (e.g. "10 000 rows have been recorded; further errors were not captured"). The downstream worker still completes its loop so `nbErrors` (the global count, not the file row count) is accurate.

### 4.4 Download endpoint

`GET /api/v1/datasets/:id/validation-diagnostic.csv`
- Permissions: same as the read permissions that already see the `validation-error` event in the journal (typically dataset owner / contributor with read access). Exact permission key to confirm at plan time by reading `api/src/datasets/router.js`.
- Streams the file from `filesStorage`. `404` if no diagnostic exists.
- The file pointer is implicit in the dataset id; no opaque token needed.

## 5. Editable (REST) datasets — write flow

### 5.1 Threshold reuse

We reuse the existing real-time-indexing threshold defined by `config.elasticsearch.maxBulkChars` and `maxBulkLines` (`api/src/datasets/utils/rest.ts`). Below the threshold, writes are processed inline in the request and indexed synchronously. Above the threshold, writes are queued for the indexer worker.

### 5.2 In-memory mandatory extension

When the request is processed inline (single-line POST/PUT/PATCH or bulk sync within threshold) and the dataset has at least one `mandatory && active` extension:

- After the existing AJV schema validation step in `applyReqTransactions` (rest.ts ~lines 508–517), and **before** the MongoDB upsert, we run a new function `extendBatchSync(lines, dataset)` (extracted from `ExtensionsStream`'s core logic — see §6).
- `extendBatchSync` returns `{ enriched: Line[], errors: Map<lineId, errorInfo> }`.
- For each line that has an error from a mandatory extension, the line is treated identically to a schema-validation failure: `_error` is set on the operation, `summary.nbErrors++`, the line is **not** persisted to MongoDB, and the line attachment (if any) is rolled back.
- For lines that pass the mandatory extensions but fail a non-mandatory one: behavior unchanged (line persists, error stored in row error field via the existing async indexer pass).
- The HTTP response shape is unchanged. A bulk write where every row fails returns the existing 200-with-errors envelope (or 400 if `nbErrors === total`, matching today's behavior).

### 5.3 Bulk async — reject up front

When the request body exceeds the threshold (`contentLength > maxBulkChars`) AND the dataset has at least one `mandatory && active` extension, the API returns `400 Bad Request` immediately with a French/English message:

> "Une extension obligatoire est configurée. La requête doit être traitée en mémoire et ne peut donc pas dépasser N caractères / M lignes. Découpez la requête en plus petits lots."

This check is done before the body is consumed (or as early as possible) in the bulk endpoint handler.

### 5.4 Cache writes

The existing `extensions-cache` MongoDB collection is written normally by `extendBatchSync`, regardless of whether the request as a whole succeeds. The extension call to the remote service was a real, legitimate operation: caching its result by input hash remains correct even when the request is rejected because of a downstream failure (here, a different line that failed mandatory extension or, for file datasets, anything else). No special rollback path.

## 6. Modules & boundaries

The implementation introduces / refactors these units:

1. **`api/src/datasets/utils/diagnostic-file.ts`** (new). Class `DiagnosticWriter`:
   - constructor receives a dataset and a phase tag; opens a write stream to `filesStorage`.
   - `addError({ line, type, field, message, rawValue })` — buffered append.
   - `finalize(): Promise<{ count: number }>` — flushes; returns the row count for the journal summary.
   - `discard()` — closes without persisting AND removes any pre-existing diagnostic file at that path (used when a phase ends with zero errors so a stale file from a prior failed attempt does not survive).
   - Used by both `validate-file.ts` and `extend.ts`.

2. **`api/src/datasets/utils/extensions.ts`**: extract a synchronous `extendBatchSync(dataset, lines)` from `ExtensionsStream._transform`. The streaming class continues to use it internally so there is one source of truth.

3. **`api/src/workers/batch-processor/validate-file.ts`**: collect-all errors and wire the `DiagnosticWriter`. Keep the inline 3-error summary for the journal.

4. **`api/src/workers/batch-processor/extend.ts`**: for mandatory extensions, route per-row failures to `DiagnosticWriter` and `throw [noretry]` at the end if any.

5. **`api/src/datasets/utils/rest.ts`**: in `applyReqTransactions`, call `extendBatchSync` after AJV validation when the dataset has mandatory active extensions. In the bulk endpoint handler, gate by content size and reject with 400 when too large.

6. **`api/src/datasets/router.js`**: add `GET /:id/validation-diagnostic.csv` route delegating to `filesStorage`.

7. **`api/src/datasets/service.js`**: in `cancelDraft`, ensure the draft's diagnostic file is removed (typically a no-op if the existing draft directory cleanup already covers the new path). No explicit hook on transition to `finalized` — the diagnostic file's lifecycle is owned by `DiagnosticWriter` (see §4.3).

8. **`ui/src/.../dataset-extensions/...`** (path TBD at plan time): add a "Mandatory" toggle on each extension entry. Render a "Download diagnostic" button on the `validation-error` journal event when `hasDiagnosticFile` is set.

9. **Types** (in `api/types` and the shared types package): add `mandatory?: boolean` to the `remoteService` branch of the dataset-extension oneOf type.

10. **i18n**: new key `notifications.datasets.validation-error` (FR + EN), and UI strings for the mandatory toggle (remoteService card only) and the diagnostic-download button.

## 7. Error handling & edge cases

- **Both validation and extension fail in the same attempt**: cannot happen because validation `throw`s before extension runs (§4.3).
- **A dataset has `nonBlockingValidation: true` AND a mandatory extension**: the mandatory extension still enforces. `nonBlockingValidation` continues to apply to AJV schema rules only. Document this explicitly in the spec; it is NOT a contradiction because mandatory extensions are an opt-in escalation.
- **`exprEval` extension throws on row N**: routed to the `DiagnosticWriter` (so the user gets per-row visibility instead of just the worker abort) AND counted as a blocking failure. At end-of-stream the worker `throw`s `[noretry]`. There is no "soft" mode — the `mandatory` flag does not exist on `exprEval`. The behavior change vs. today is purely the diagnostic file: previously the worker would abort on the first row with `[noretry]` and the user would only see the first error. Now the stream completes the buffer pass collecting every failing row, then aborts.
- **REST single-line write, mandatory extension fails**: HTTP 400 with the same error envelope shape as a schema-validation failure on a single-line write. (Existing single-line endpoint already returns 4xx on AJV failure; we mirror it.)
- **REST sync bulk, all rows fail mandatory extension**: same response shape as "all rows fail AJV", which today is 400 (per existing summary handling).
- **Cache pollution risk on REST hot path**: addressed in §5.4.
- **Diagnostic file size**: capped at 10 000 error rows (see §4.3). Above the cap, additional errors are counted in `nbErrors` but not written to the file. The journal summary mentions the cap explicitly.
- **Concurrent validation attempts**: not possible — the worker has a single in-flight task per dataset.

## 8. Testing

- **Unit**: `DiagnosticWriter` API — addError, finalize, discard.
- **Unit**: `extendBatchSync` — error per row from remote service, exprEval throw, all-pass case.
- **Integration (api)**:
  - File dataset, schema-validation failure → diagnostic CSV exists, contains every row, journal event has flag, notification sent.
  - File dataset, validation passes, exprEval throws on some rows → diagnostic CSV contains every failing row, dataset enters error state, journal flagged, notification sent.
  - File dataset, validation passes, mandatory remoteService extension fails on some rows → same as above.
  - File dataset, validation passes, non-mandatory remoteService extension errors → no diagnostic file (current behavior).
  - REST dataset, single-line write, mandatory remoteService extension fails → 400, no MongoDB row written.
  - REST dataset, sync bulk, mandatory remoteService extension fails on some rows → other rows persist, failed rows don't, response has nbErrors > 0.
  - REST dataset, async bulk (oversize) with mandatory remoteService extension configured → 400 up-front.
  - Diagnostic file removed on `cancelDraft` (covered by existing draft directory cleanup).
- **e2e**: dataset draft validation flow with downloadable diagnostic + UI link.

See `docs/architecture/testing.md` for conventions.

## 9. Out of scope (follow-ups)

- **Rate limiting on REST write endpoints when mandatory extensions are configured.** With mandatory extension on the hot path, write cost increases (CPU + remote-service call). A future spec should evaluate whether per-API-key or per-dataset rate limiting is feasible without regressing existing customers; until then the operational risk should be communicated to dataset owners enabling the flag.
- **Surfacing extension-only mandatory errors in the inline 3-error journal summary** — phase-2 polish.

## 10. Migration

No DB migration required. `mandatory` is an additive optional boolean. Existing datasets keep current behavior (`mandatory` undefined === false). Existing diagnostic-file path doesn't exist on disk for any dataset until the next validation attempt after deploy.
