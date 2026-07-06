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
         (compatibleOrCancel draft → finalize writer, move diagnostic to cancelled-draft slot, emit draft-cancelled, cancelDraft)
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

For drafts opened with `validationMode: 'compatibleOrCancel'`, an attempt that produces
row errors emits a **`draft-cancelled`** event (with the same breakdown counts) instead
of `validation-error`. The diagnostic file is **finalized as usual and then moved** out
of the draft directory (which `cancelDraft` wipes) into a distinct slot on the main
dataset, `datasets/<id>/data-files/cancelled-draft-diagnostic.csv`, served by
`GET /api/v1/datasets/:datasetId/cancelled-draft-diagnostic.csv` (same `readJournal` /
`readAdvanced` gate as the canonical diagnostic). The `draft-cancelled` event carries
`hasDiagnosticFile: true` so the UI shows a download link. The dataset's own
`validation-diagnostic.csv` slot is left untouched. The file is overwritten by a later
cancelled contribution and removed by `validateDraft` once a contribution succeeds.

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
| `api/types/dataset/schema.js` | `mandatory` field on the `remoteService` extension oneOf branch; `constraints` field (`unique` type) |
| `shared/ajv.js` | `ajv-errors` integration + Proxy-wrapped localizer (preserves user `errorMessage` text); `valueAtPointer` JSON-pointer resolver and value-aware `errorsText` (optional `data` arg appends ` (valeur : …)`) shared by the REST hot path and the diagnostic CSV |
| `api/src/datasets/utils/constraints.ts` | `checkConstraints` config validation + `CONSTRAINT_INDEX_PREFIX` |
| `api/src/datasets/es/unicity-agg.ts` | `findUnicityDuplicates` composite aggregation over the constraint columns |
| `api/src/datasets/es/operations.ts` | `unicityAggField` — picks the aggregation field (`.wildcard` sub-field when applicable) |
| `api/src/workers/batch-processor/index-lines.ts` | file-dataset unicity gate before `switchAlias` |
| `api/src/datasets/utils/rest.ts` | `configureConstraintIndexes` (partial unique index per constraint) + 11000 → 409 mapping |
| `ui/src/components/dataset/dataset-constraints.vue` | schema-driven `<vjsf>` editor for `dataset.constraints` |

## Out of scope (follow-ups)

- **Rate limiting** on REST write endpoints when a mandatory extension is active. Mandatory extensions add a remote-service round-trip to every write; per-API-key or per-dataset limits should be evaluated in a separate spec.
- **Mid-run diagnostic visibility** — currently the CSV is published only after the worker exits. Live append is feasible but requires atomic-move-vs-tail trade-offs.
- **Streaming-level merge of validation + extension** into a single Transform — explicitly rejected on cost-vs-benefit grounds. Could be revisited if the double-read of the source file becomes a measurable hot-path issue.
- **Configurable diagnostic cap** — `DIAGNOSTIC_FILE_CAP` is hard-coded at 10 000.

## Dataset-wide constraints

Beyond per-column schema validation, a dataset can declare constraints that span the whole row. The only constraint type implemented so far is `unique`.

### Data model

`dataset.constraints[]`, each entry `{ type: 'unique', properties: string[] }` — the combination of values of `properties` must be unique across every row of the dataset. Defined in `api/types/dataset/schema.js` (`datasetProperties.constraints`); accepted both at creation (`POST /api/v1/datasets`) and via `PATCH /api/v1/datasets/:id` (`patchKeys` in `api/doc/datasets/patch-req/schema.js`). Additive, no DB migration.

A file dataset created with `constraints` but without a `schema` in the same request is rejected with 400: at creation time an omitted `schema` defaults to `[]`, so every column referenced by a constraint is unknown and `checkConstraints` fails. Either supply `schema` alongside `constraints` in the creation request, or upload the file first and add the constraint via a follow-up `PATCH` once the schema has been inferred.

### Config-time validation

`checkConstraints(schema, constraints, dataset?)` (`api/src/datasets/utils/constraints.ts`) validates every `unique` constraint against the **extended** schema (concept/calculated columns resolved) and throws `httpError(400, …)` (French messages) on the first violation:

- empty `properties`;
- a referenced column that doesn't exist in the schema;
- a column that is `x-calculated` or `x-extension` (constraints can't target derived data);
- a column whose `x-capabilities.values` is `false` (the aggregation used to detect duplicates needs doc-values);
- a geometry column (`x-refersTo === 'https://purl.org/geojson/vocab#geometry'`);
- a `type: 'object'` column;
- a multi-valued column (`prop.separator` truthy) — an ES composite `terms` source over a multi-valued field emits one bucket per value, producing spurious "duplicates", so the constraint is ill-defined and rejected at config time.

`checkConstraints` also takes the dataset itself and rejects with 400 up front, before looking at any column, when `dataset.isVirtual || dataset.isMetaOnly`: virtual datasets never run the file-dataset index-lines gate below and have no Mongo collection to back a REST-style unique index, so a declared constraint on either would be a guarantee nothing actually enforces. Removing constraints (patching to `null`/`[]`) is always allowed regardless of dataset type, since an empty/absent constraint list never reaches `checkConstraints` (callers gate the call behind a non-empty-constraints check).

The module also exports `CONSTRAINT_INDEX_PREFIX = 'constraint_unique_'`, shared with the REST index-naming and 409-mapping logic below.

`checkConstraints` is called from both dataset-creation (`createDataset` in `api/src/datasets/service.ts`, when the request body carries a non-empty `constraints`) and the shared patch pipeline (`api/src/datasets/utils/patch.ts`): whenever a `PATCH` body includes `constraints`, the schema is re-extended and validated before the patch is persisted — this runs for both file and REST datasets. A schema-only `PATCH` (no `constraints` in the body) also re-validates the dataset's *existing* constraints if there are any, so a patch that removes/invalidates a column referenced by a constraint is rejected with `httpError(400, …)` instead of silently leaving a dangling reference.

`constraints: null` is the documented "unset" idiom (`makePatchSchema` allows it, meaning "remove all constraints"); `patch.ts` normalizes it to `[]` as early as possible so every downstream consumer (the constraints check, `applyPatch`'s `$set`/`$unset` choice, and the index-lines worker's diagnostic-cleanup gate) sees the same "empty array" shape the UI already produces when a constraint is dropped. Because of this normalization, `'constraints' in patch` reliably means "the request expresses an intent about constraints" (set some, or remove them all); removal (`null`/`[]`) always skips validation — only a non-empty `constraints` list is checked against the schema. When the request also patches `schema` (or `extensions`, or `attachmentsAsImage`) in the same call, the schema is only extended once: `checkConstraints` reuses that already-computed extended schema instead of calling `schemaUtils.extendedSchema` a second time.

### File-dataset flow — post-index composite gate

File datasets can't enforce uniqueness incrementally (the whole file is rebuilt into a temp index each run), so the check runs once, on the fully-built temp index, in `api/src/workers/batch-processor/index-lines.ts` — in the non-partial-update branch, **after** the index stream completes and **before** `switchAlias` promotes the temp index:

1. If the dataset has any `unique` constraint, the temp index is refreshed (`indices.refresh`) so the aggregation sees every row.
2. For each constraint, `findUnicityDuplicates(indexName, constraint, schema, maxGroups)` (`api/src/datasets/es/unicity-agg.ts`) runs a paginated ES `composite` aggregation over the constraint's columns — memory-flat, walking pages via `after_key` rather than loading all groups at once — and keeps only buckets with `doc_count >= 2`. A `top_hits` sub-aggregation on `_i` (size 10) recovers source line numbers for each duplicate group without a second query.
3. Each duplicate row is written to the same `DiagnosticWriter` used by schema/extension errors (`api/src/datasets/utils/diagnostic-file.ts`), with `type: 'unicity'`, `field` set to the joined constraint columns, and `line` = the 1-based data-row index (`_i`).
4. If any duplicates were found: the diagnostic file is finalized, a `validation-error` journal event is emitted carrying a new `unicityErrorCount` field (alongside the usual `diagnosticErrorCount`/`diagnosticCapped`), the standard notification is sent, the **temp index is deleted** (never promoted — `switchAlias` is not called), and the worker throws `[validation-error] …`, which the batch processor recognizes as terminal (no retry) like any other validation error.
5. If no duplicates were found, the writer is discarded and processing proceeds to `switchAlias` as normal.

The field actually aggregated on is chosen by `unicityAggField(prop)` (`api/src/datasets/es/operations.ts`): it reuses `isLengthLimitedKeyword` / `hasCapability` from the `ignore_above:200` mitigation (see below) — a length-limited string column routes to its `.wildcard` sub-field when the `wildcard` capability is enabled, otherwise it aggregates on the plain keyword field.

Each duplicate group's `raw_value` in the diagnostic CSV goes through `unicityKeyPartLabel(prop, value)` (same file), which turns the raw ES composite-bucket key into something a user recognizes: `date`-formatted columns are sliced to their `YYYY-MM-DD` part, `date-time`-formatted columns are rendered as a full ISO 8601 string (UTC), and every other column type is passed through as its plain string form. Without this, a date/date-time column would show the aggregation's raw epoch-millis bucket key instead of the value the user entered.

#### Triggering reprocessing on a constraint change

Changing `constraints` on a **file** dataset (adding, removing, or replacing a `unique` constraint) sets `dataset.status` to `reindexerStatus` (`'validated'` for file datasets) in `api/src/datasets/utils/patch.ts`, so the whole file gets rebuilt into a temp index and the gate above re-runs against the current data — this is what makes both directions of the constraint lifecycle actually take effect:

- adding a constraint to a **finalized** dataset whose existing data violates it drives the dataset into the same error state described above, with a `unicityErrorCount`-carrying diagnostic;
- dropping (or loosening) the constraint of a dataset that is currently in that **error** state lets it pick up the retry from `errorStatus` and re-finalize normally, since the gate no longer has anything to reject — this is the "drop the constraint to recover" path referenced in `dev/fixtures.ts`, and it also discards the now-stale diagnostic file from the previous run.

This status assignment is applied as a **floor**, after the rest of the status-trigger chain has already run, rather than as one more branch inside it — so it never wins a first-match-wins tie against another trigger fired by the same `PATCH` (e.g. the structure tab saving a schema `x-transform` or a validation-rule change together with a constraint change in one request). Concretely: if the chain already picked a status that reaches the index-lines gate on its own (`'loaded'`, `'analyzed'`, or `'validated'`), it is left untouched; if the chain picked `'validation-updated'` — which `process-file.ts` finalizes directly without ever visiting index-lines — it is escalated to `'analyzed'` instead, so the combined `PATCH` re-checks both the validation rule and the constraint; and if the chain picked no status at all (a constraints-only `PATCH`), the floor applies `reindexerStatus` directly.

### REST-dataset flow — MongoDB partial unique index

REST datasets enforce uniqueness synchronously through a MongoDB index rather than a batch pass. `configureConstraintIndexes(dataset)` (`api/src/datasets/utils/rest.ts`) creates one **partial compound unique index** per `unique` constraint on the dataset's collection:

- Index name: `constraint_unique_<hex crc32 of JSON.stringify(constraint.properties)>` — content-hashed, **not** based on the constraint's position in the array, so reordering/removing constraints never makes a surviving constraint collide with a stale index of a different key spec (MongoDB `IndexKeySpecsConflict`, code 86).
- Key spec: one ascending field per constraint column.
- Partial filter: `{ _deleted: false, <col1>: { $exists: true }, <col2>: { $exists: true }, … }` — selects only live rows that actually carry a value for every column, so a row missing one of the columns doesn't trip the index.
- Wanted indexes are created first (idempotent for indexes that already match); stale indexes (prefixed `constraint_unique_` but no longer wanted) are dropped only afterwards. This create-before-drop order means that if a `createIndex` call fails (see below) and the `PATCH` aborts, no surviving constraint's index has been dropped yet — it stays enforced instead of being left claimed-but-unenforced.

`configureConstraintIndexes` is called from `initDataset` (new REST datasets) and from `applyPatch` (`api/src/datasets/service.ts`) whenever the patch touches `constraints`. If existing data already violates a newly-added constraint, `createIndex` fails with a duplicate-key error which is mapped to `httpError(400, …)` and the whole `PATCH` is rejected — the constraint is never applied against violating data.

At write time, `applyTransactions` (same file) catches MongoDB bulk-write `11000` (duplicate key) errors: when the failing index name carries the `constraint_unique_` prefix, the offending line gets `_status = 409` and an `_error` built by `unicityViolationMessage` (`api/src/datasets/utils/constraints.ts`) — the failing index name in `errmsg` is mapped back to the dataset constraint so the message can name the violated columns (by schema title when available), e.g. « Doublon détecté : le couple (Poste + SIRET) doit être unique. ». The same helper produces the per-row `message` of the file-dataset validation diagnostic. The `_i`/`_id`-conflict 11000 branches are distinguished by matching on the index name in `errmsg`.

### UI

`ui/src/components/dataset/dataset-constraints.vue` is a schema-driven `<vjsf>` editor for `dataset.constraints`, mounted in the dataset Structure → Schema tab (`ui/src/pages/dataset/[id]/index.vue`) and persisted through the existing `structureEditFetch` patch buffer alongside other schema-tab edits. The list of eligible columns offered to the user mirrors the `checkConstraints` rules (no calculated/extension/geometry/object columns, no columns with `values` disabled).

### v1 scoping / follow-ups

- **Draft `compatibleOrCancel` parity not implemented.** A file-dataset unicity violation always emits a plain `validation-error` and leaves the dataset in `error` status, even when the run is a `compatibleOrCancel` draft contribution — unlike schema/extension errors, it does not auto-cancel the draft and replicate a `draft-cancelled` event. Revisit if unicity constraints become common on datasets that also use draft validation.
- **`ignore_above:200` degrade-and-document, not eliminate.** `unicityAggField` only avoids under-reporting when the `wildcard` capability is explicitly enabled on a long unique string column; without it, values beyond 200 characters can still collide silently in the keyword aggregation (or be missed) the same way filters do — see the dedicated section below. Operators declaring a `unique` constraint on a free-text/long-string column should enable `wildcard` on that column.
- **Calculated/extension columns are out of scope.** `checkConstraints` rejects them outright rather than attempting to validate derived values.
- **Multi-valued (`separator`) columns are out of scope.** `checkConstraints` rejects them outright — a composite aggregation over a multi-valued field would emit one bucket per value, so uniqueness would never mean what the user expects.
- **Defense in depth against dangling constraints.** Even though schema-only patches now re-validate existing constraints (see above), `findUnicityDuplicates` (`api/src/datasets/es/unicity-agg.ts`) also skips (returns no duplicates for) any constraint whose `properties` reference a column missing from the schema, so the file indexer can never crash even if a dangling constraint slips through some other path.

## ES `ignore_above:200` keyword truncation

This is a correctness concern that surfaces at finalize time alongside schema validation. It is described in detail in [`load-management.md` — `keyword ignore_above:200` truncation section](./load-management.md#keyword-ignore_above200-truncation-and-per-request-filter-routing). Short summary for this document:

- String columns are indexed as `{type:keyword, ignore_above:200}`. Values longer than 200 characters are silently dropped from the keyword index (kept only in `_source`), making exact/exists/range/sort/agg filters miss them.
- At finalize, `datasetFinalizeDiagnostics` (`manage-indices.ts`) queries the ES `_ignored` metadata field and persists the affected column keys as `dataset._esIgnoredKeywordFields` (internal, stripped from public output).
- If any column is newly affected, a `ignored-keyword-values` journal event (warning, no notification) is written for the dataset owner, listing the columns and advising enabling the `wildcard` capability followed by reprocessing.
- The `esWarning` field on the dataset is set to `IgnoredKeywordValues` (ranked above `ShardingRecommended`) so superadmins see it in the triage list.
- Per-request: exact-match filters with a >200-char operand return `400`; existence/range/prefix filters on flagged columns are routed to length-safe alternatives (`.wildcard` sub-field or union with an analyzed sub-field) where available; where no safe alternative exists, a `queryAdviceUncertainFilter` correctness hint is attached to the response.
- A one-time backfill upgrade script (`api/upgrade/6.12.0/ignored-keyword-fields.ts`) populates `_esIgnoredKeywordFields` for pre-existing finalized datasets; it calls `es.connect()` itself because upgrade scripts run before `es.init()`.

## Related design specs

- `docs/superpowers/specs/2026-04-29-extension-validation-design.md` — original mandatory-extension + diagnostic-file design (partly superseded).
- `docs/superpowers/specs/2026-05-05-process-file-merge-design.md` — the worker-merge follow-up that produced `process-file.ts`.
