# Dataset Validation

This document describes how Data Fair validates dataset rows — both schema validation and the related "mandatory extension" mechanism — and how validation errors are surfaced to users.

## Goals

A dataset operator needs to know precisely which rows of their data fail validation, not just that *some* failed. Two concerns drive the design:

1. **Schema validation** — rows that don't match the dataset's JSON schema (type, pattern, format, required fields).
2. **Mandatory enrichment** — when an extension is critical to the dataset's meaning (e.g. an RGE geocoding step), a row that fails the extension should be treated identically to a row that fails schema validation.

Both kinds of error are aggregated into a single per-dataset **validation diagnostic CSV** that the operator can download.

## Data model

`dataset.extensions[]` (when `type === 'remoteService'`) accepts an optional boolean `mandatory`. When `true`, a row whose remote-service result carries an `errorKey` (`_error` or `error`) is treated as a blocking validation failure for that row.

`exprEval` extensions are **always** blocking when they throw on a row — there is no `mandatory` flag for them. An expression that raises an exception on a row is, by contract, incompatible with that row.

| Situation | Effect on the row | Effect on the dataset |
|---|---|---|
| `exprEval` throws on a row | row's calculated property is left unset, error written to diagnostic | dataset enters error state |
| `remoteService` returns `errorKey` populated, `mandatory: false` | row's error field is set (existing behavior) | dataset finalizes |
| `remoteService` returns `errorKey` populated, `mandatory: true` | error written to diagnostic | dataset enters error state |
| Schema validation fails on a row | error written to diagnostic | dataset enters error state |

There is no DB migration: `mandatory` is additive and absent ≡ `false`.

## File-dataset flow

For non-editable (file-backed) datasets, validation and extension are run by the **`process-file`** worker (`api/src/workers/batch-processor/process-file.ts`). It is dispatched as the `validateFile` task whenever a file dataset is in `analyzed` or `validation-updated` status (see `api/src/workers/tasks.ts`).

A single `DiagnosticWriter` instance is created at the top of the run and is shared across both phases:

```
process-file worker
  ├─ existing draft compatibility checks (schema breaking changes)
  ├─ open DiagnosticWriter
  ├─ Phase A — schema validation
  │    streams the file through ValidateStream
  │    every row error → writer.addError({ type: 'validation', ... })
  ├─ Phase B — extensions (if any active)
  │    runs extensionsUtils.extend(...) with an onLineError callback
  │    blocking extension errors → writer.addError({ type: 'extension', ... })
  │    non-mandatory remoteService errors stay in the row's error field, not in the diagnostic
  └─ Aggregate decision
       if writer.errorCount > 0:
         (compatibleOrCancel draft → discard writer, emit draft-cancelled, cancelDraft)
         else → finalize file, emit validation-error, throw [validation-error]
       else:
         discard writer, advance status to 'extended' or 'validated'
```

Phase A's `ValidateStream` (defined inline in `process-file.ts`) keeps the existing 3-error inline summary in the journal `validation-error.data` field for human readability; the diagnostic file is the exhaustive source.

Phase B reuses `extensionsUtils.extend()` with an `onLineError(absoluteIndex, err)` hook. The hook is invoked from `ExtensionsStream` for every row whose remote-service result has an `errorKey`, and for every row whose `exprEval` throws.

### Why a single worker

Originally the design had two workers (`validate-file.ts` then `extend.ts`) writing to two separate diagnostic files. The follow-up spec (`docs/superpowers/specs/2026-05-05-process-file-merge-design.md`) merged them so that **schema and extension errors from the same processing attempt land in the same CSV**. The internal stream classes (`ValidateStream`, `ExtensionsStream`) were kept; only the worker that owns them was unified.

### Status transitions

| Pre-existing status | Active extensions? | After `process-file.ts` |
|---|---|---|
| `analyzed` | yes | success → `extended` (skips intermediate `validated`); error → `error` |
| `analyzed` | no | success → `validated` |
| `validation-updated` | yes | success → `finalized` (revalidation does not re-run extensions) |
| `validation-updated` | no | success → `finalized` |

## REST-dataset flow

REST datasets cannot use the file-dataset worker because writes are interactive. Mandatory extensions for REST run **on the request hot path**, before the MongoDB upsert.

In `api/src/datasets/utils/rest.ts → applyTransactions`:

1. Standard AJV schema validation runs first; rows that fail are flagged with `_status=400, _error='...'`. The message is built with the **value-aware `errorsText`** from `shared/ajv.js`: each error is suffixed with ` (valeur : …)` — the rejected value resolved at the error's `instancePath` (JSON-pointer, so nested/array paths like `/attr3/1` work), truncated to 200 chars. This is the same debugging context the diagnostic CSV's `raw_value` column carries, and it matters for callers (e.g. a processing posting `_bulk_lines`) that log the returned validation errors but never the raw input. Errors are localized in place via the shared `localize` Proxy first, so a user-provided `errorMessage` is preserved (the previously-used `@data-fair/lib-validation` `errorsText` re-localized with the raw `ajv-i18n` localizer and dropped custom messages). `nonBlockingValidation` rows get the same enriched text in `_warning`.
2. If the dataset has at least one `mandatory && active` extension, the surviving operations are passed through `extensionsUtils.extendBatchSync(dataset, mandatoryExtensions, lines, { onLineError })`.
3. Lines whose mandatory extension fails get `_status=400` and are excluded from the bulk write. Lines that pass have their enriched fields copied back into `operation.fullBody` for persistence.
4. The MongoDB bulk write proceeds with the survivors.

`extendBatchSync` (defined in `api/src/datasets/utils/extensions.ts`) is a synchronous-style wrapper that reuses `ExtensionsStream.sendBuffer()` over an in-memory buffer — one source of truth for the remote-service / cache / batch logic.

### Bulk-write rejection

When the request body would normally be queued for the async indexer (i.e. `?async=true` or `contentLength > config.elasticsearch.maxBulkChars`) AND the dataset has a mandatory extension, the bulk endpoint returns `400` immediately:

> Une extension obligatoire est configurée sur ce jeu de données. La requête doit être traitée en mémoire et ne peut donc pas dépasser N caractères ni utiliser le mode "async". Découpez la requête en plus petits lots.

This is enforced in `bulkLines` (rest.ts) before parsing the body.

### Cache writes

The `extensions-cache` MongoDB collection is written normally by `extendBatchSync`, even when the request as a whole is rejected because of a different line failing. The remote-service call was a real, paid operation; caching its result by input hash remains correct.

A cached result that carries an `errorKey` is replayed exactly like a fresh one: `ExtensionsStream.sendBuffer` invokes `onLineError` for cache hits as well as cache misses, so a line that failed a mandatory extension once stays rejected on every later write of the same input — it is never silently persisted because the failure came from the cache.

### `extend-rest` worker

The `extend` worker (`api/src/workers/batch-processor/extend-rest.ts`) handles only REST datasets now: initial extension run for newly-created REST datasets with active extensions, incremental `_partialRestStatus: 'updated'` runs after `_bulk_lines`, and re-runs when an extension is flagged `needsUpdate`. It never writes to the diagnostic file.

## Validation diagnostic CSV

### Format

UTF-8 with BOM, header row `line,error_type,field,message,raw_value`. `error_type` is `validation` or `extension`. `raw_value` is the offending field's source value, truncated to 200 chars and ending with `…` if truncated. It is resolved from the row via the error's `instancePath` (using `valueAtPointer` from `shared/ajv.js`), so nested/array paths such as `/multipattern/1` produce the actual element value rather than an empty cell.

### Lifecycle

Owned end-to-end by `DiagnosticWriter` (`api/src/datasets/utils/diagnostic-file.ts`):

- Constructed at the start of every `process-file` run, given the dataset.
- `addError(...)` is buffered: it streams to a temporary CSV in `tmpDir`. The stream is opened lazily on the first error.
- `finalize()` flushes and atomically moves the temp file to `validationDiagnosticFilePath(dataset)` — `<dataFilesDir>/validation-diagnostic.csv` (per-dataset; per-draft when a draft is active). It also clears `hasDiagnosticFile` from any stale prior journal events for the same dataset/draft, so the UI never shows a download link to a file that no longer exists.
- `discard()` closes the temp stream and removes any pre-existing diagnostic file at the target path. Used when a phase ends with zero errors so a stale file from a previous failed attempt doesn't survive.

There is exactly one diagnostic file per dataset (per draft). Each new attempt overwrites it; a successful attempt clears it.

### Cap

A hard cap of 10 000 error rows per file (`DIAGNOSTIC_FILE_CAP` in `diagnostic-file.ts`). Beyond the cap, `addError` is a no-op but `capped` is set to `true` and reported in the journal event as `diagnosticCapped`. The cap is shared across both phases of a single run.

### Download endpoint

`GET /api/v1/datasets/:datasetId/validation-diagnostic.csv` (router.js:1339-1347):

- Permissions: requires `readJournal` *or* `readAdvanced` (same gate as the journal that references it).
- Streams the file from `filesStorage`. Returns `404` with a French plain-text message if no diagnostic exists.
- The `?draft=true` query param is honored via the `acceptInitialDraft: true` middleware option, which selects the draft sub-tree.

## Journal events and notifications

A failed run emits exactly one `validation-error` journal event with these fields:

| Field | Meaning |
|---|---|
| `data` | Human-readable summary, multi-line; reuses the existing 3-error inline format for schema failures, plus a one-liner for blocking extensions |
| `hasDiagnosticFile` | `true` when a downloadable CSV exists for this attempt (UI gates the download button on this) |
| `diagnosticErrorCount` | Number of rows actually in the CSV (can be capped at 10 000) |
| `diagnosticCapped` | `true` if the cap was hit |
| `validationErrorCount` | Schema-validation failures from phase A |
| `extensionErrorCount` | Mandatory-extension failures from phase B |

A user notification is sent via `sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validation-error', { params: { nbErrors, diagnosticUrl } })`. The `notifications.datasets.validation-error` and `.draft-validation-error` keys are localized in `api/i18n/messages/{fr,en}.json`.

For drafts opened with `validationMode: 'compatibleOrCancel'`, an attempt that produces row errors emits a **`draft-cancelled`** event (with the same breakdown counts) instead of `validation-error`. The diagnostic file is discarded because the draft directory is wiped — there would be nowhere stable to point a download link.

## UI surface

- **Mandatory toggle** — `ui/src/components/dataset/extension/dataset-extension-remote-service-card.vue` adds a checkbox bound to `extension.mandatory`, with a hint explaining the consequence. Only on `remoteService` cards (no `exprEval` toggle by design).
- **Download button** — `ui/src/components/journal-view.vue` renders a "Télécharger le diagnostic" button on any `validation-error` event whose `hasDiagnosticFile === true`. The button derives its URL from the injected `datasetStore.resourceUrl`, appending `?draft=true` for draft events.

## Modules & files

| Module | Role |
|---|---|
| `api/src/datasets/utils/diagnostic-file.ts` | `DiagnosticWriter` class — owns the CSV lifecycle |
| `api/src/datasets/utils/files.ts` | `validationDiagnosticFilePath(dataset)` resolver |
| `api/src/datasets/utils/extensions.ts` | `extendBatchSync` (REST hot path) + `ExtensionsStream` with `onLineError` |
| `api/src/datasets/utils/rest.ts` | `applyTransactions` mandatory-extension pass + bulk-write rejection |
| `api/src/datasets/router.js` | `GET /:datasetId/validation-diagnostic.csv` endpoint |
| `api/src/workers/batch-processor/process-file.ts` | Combined file-dataset validation + extension worker |
| `api/src/workers/batch-processor/extend-rest.ts` | REST-only extension worker |
| `api/types/dataset/schema.js` | `mandatory` field on the `remoteService` extension oneOf branch |
| `shared/ajv.js` | `ajv-errors` integration + Proxy-wrapped localizer (preserves user `errorMessage` text); `valueAtPointer` JSON-pointer resolver and value-aware `errorsText` (optional `data` arg appends ` (valeur : …)`) shared by the REST hot path and the diagnostic CSV |

## Out of scope (follow-ups)

- **Rate limiting** on REST write endpoints when a mandatory extension is active. Mandatory extensions add a remote-service round-trip to every write; per-API-key or per-dataset limits should be evaluated in a separate spec.
- **Mid-run diagnostic visibility** — currently the CSV is published only after the worker exits. Live append is feasible but requires atomic-move-vs-tail trade-offs.
- **Streaming-level merge of validation + extension** into a single Transform — explicitly rejected on cost-vs-benefit grounds. Could be revisited if the double-read of the source file becomes a measurable hot-path issue.
- **Configurable diagnostic cap** — `DIAGNOSTIC_FILE_CAP` is hard-coded at 10 000.

## Related design specs

- `docs/superpowers/specs/2026-04-29-extension-validation-design.md` — original mandatory-extension + diagnostic-file design (partly superseded).
- `docs/superpowers/specs/2026-05-05-process-file-merge-design.md` — the worker-merge follow-up that produced `process-file.ts`.
