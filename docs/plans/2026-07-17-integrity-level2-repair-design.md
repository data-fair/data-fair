# Integrity level 2 (repair) — design

> Status: approved 2026-07-17, to be implemented on feat-integrity4. Companion to
> [docs/architecture/integrity.md](../architecture/integrity.md) (§2 levels, §3 mechanism,
> §10 build order — "level 2 repair, file and metadata as a single follow-on unit").

## Goal

Upgrade the delivered level-1 detection (joint anchor per dataset: file md5 +
covered-metadata sha256 in a compliance-locked S3 store) to **level 2 — repair**: every
anchor revision additionally stores the **full payload** (file copy + covered-metadata
snapshot), unlocking the admin-facing **diff**, **audit download** of any historical
version, and **restore** of the hot resource from any stored revision.

Decisions settled with the maintainer before this design:

- **Always-on for file datasets — no size gate.** Enabling integrity gives level 2
  unconditionally; storage cost is proportional and simply counted toward the owner's
  static-storage consumption (§9 of the architecture doc). Editable/incremental datasets
  are out of scope (target 3, discussed later).
- **Any stored revision is restorable** (not just the latest) — the §3.5 promise: current
  state always restorable, any past state restorable within the retention window.
- **Owner transfer is forbidden while integrity is active.** `changeOwner` refuses
  integrity-active datasets instead of re-anchoring under the new owner prefix. To
  transfer, a superadmin disables integrity first (anchors age out under the old prefix),
  transfers, re-enables.
- **File restore re-ingests through the normal worker pipeline** (as if the user
  re-uploaded that version), so all derived state (schema, index, previews) is rebuilt
  consistently.

## A. Payload storage layout

Extends the existing key layout `data-fair/{owner.type}-{owner.id}/{datasetId}/{i}`
(zero-padded `i`, one joint sequence per dataset):

- **Metadata snapshot — inline.** The revision JSON at `{i}` gains
  `payload: { metadata: <covered projection> }` — the exact object that was hashed
  (stable-key-sorted at hash time; stored as-is). It is small (KBs) and GDPR-clean by
  construction: the covered denylist already strips `createdBy` / `updatedBy`, and
  denormalized names are normalized out (D1). One GET returns a complete revision.
- **File copy — sibling object** at `{i}.file`: same bucket, same COMPLIANCE lock and
  retain-until as its revision JSON, streamed from `filesStorage.readStream()` (fs or S3
  backend) via multipart upload (`@aws-sdk/lib-storage` `Upload`). The revision JSON
  records `payload.file = { size }` so listings can tell a revision is restorable without
  HEADing the payload object. Non-file parts (a dataset whose stored file is missing)
  simply have no `.file` object and no `payload.file`.
- **Write order: payload first, then the revision JSON.** A crash in between leaves an
  orphan `.file` that ages out harmlessly at retention; the reverse order would leave a
  revision claiming a repairability it doesn't have.
- `latestKey` / `nextIndex` / the revisions listing become **suffix-aware**: keys ending
  in `.file` are payload objects, not revisions, and are filtered out of index parsing.
- **Rejected alternatives.** All-in-one object (cannot mix GB binary into JSON, no
  streaming); a separate `payload/` prefix (second list call, and breaks the
  one-prefix-per-dataset storage-accounting simplicity).

## B. Anchor & enable flow changes

- `anchorDataset()` keeps its two-pass shape: compute hashes first, run the dedupe check,
  and only if a new revision is needed re-read the stored file to upload the payload, then
  write the revision JSON. (A one-pass hash-while-uploading needs a staging key and S3 has
  no rename — not worth it.)
- **Dedupe gains one condition:** skip only if the hash pair matches **and** the latest
  anchor carries a payload. A payload-less L1-era anchor with matching hashes gets a fresh
  payload-bearing revision instead — the store self-heals to level 2. The
  disable→re-enable `lastRevision` restore branch is preserved.
- **No backfill needed:** no production deployment holds L1 anchors, so there is no
  upgrade script. The payload-aware dedupe above self-heals the few dev/staging
  enrollments on their next anchor.
- **Enable stays synchronous** (D4 of the simplification) but now includes the file
  upload: for a multi-GB file this is a long request. Accepted — enable is a rare
  superadmin action; the request-timeout caveat is noted in the architecture doc.
- **`changeOwner` refusal:** the owner-transfer route returns 400 for integrity-active
  datasets ("disable integrity before transferring ownership"). The transfer re-anchor
  stamp in `datasets/routes/metadata.ts` is deleted; integrity.md §3.1's owner-transfer
  note is rewritten accordingly.

## C. Restore

New superadmin route `POST /datasets/{id}/_integrity/_restore { i, reason? }`
(admin-mode gated, same posture as `_fix`):

- **Guards:** 400 if integrity isn't active, if revision `i` doesn't exist, or if it
  carries no payload (L1-era anchor).
- **Metadata part.** Replace the hot doc's covered keys with the snapshot's: every covered
  key present in the snapshot is written; covered keys present on the hot doc but absent
  from the snapshot are unset; operational/denylisted fields are untouched. Special cases:
  - `owner` — written back as the snapshot's normalized `{ type, id, department? }` only
    when it differs from the hot owner. Since transfers are forbidden while active, a
    difference can only come from tampering; restoring the normalized form heals it (names
    re-sync from simple-directory on the next propagation).
  - `topics` — restored as `{ id }` entries, then re-hydrated (title/color/icon) from the
    owner's `settings.topics`; ids no longer present in settings stay as bare ids (same
    state a topic deletion propagation would leave).
  - `permissions[].name` — display-only; stays absent until natural re-sync.
- **File part.** Only when the snapshot md5 differs from the current stored file's md5:
  download `{i}.file` to a tmp file and feed it through the standard file-replacement
  path, so the worker pipeline (analyze → index → finalize) rebuilds all derived state.
  The write stamps the outbox with `{ operation: 'restore', origin: 'superadmin',
  reason? }`; finalize's existing re-anchor then produces the new revision. The finalize
  stamp must **preserve** a pre-set restore context rather than overwrite it with the
  generic worker context.
- **Response.** Metadata-only restore is fully synchronous: write metadata, inline
  `anchorDataset()` with the restore context, `checkDataset()`, respond with the fresh
  verdict (same shape as `_fix`). A restore that includes the file responds with the
  dataset in its normal processing state; the anchor lands at finalize and the panel shows
  it on next load (consistent with the no-realtime posture, D4).
- **Append-only.** Restore always appends a new revision (`operation: 'restore'` joins
  the `RevisionOperation` enum) — the sequence never rewinds; the restored state becomes
  the new latest anchor with a fresh lock.

## D. Diff & payload read API

- `GET /datasets/{id}/_integrity/revisions/{i}` — guarded by the existing
  `readIntegrityRevisions` admin-class permission. Returns the full revision (hash,
  context, `payload.metadata`) **plus the current covered projection**, so the UI renders
  a metadata diff in one call.
- `GET /datasets/{id}/_integrity/revisions/{i}/file` — same permission; streams the
  locked `.file` payload with sensible content headers — audit download of any historical
  version.
- **UI** (integrity tab, revisions table): per-row actions — view metadata diff (dialog),
  download file payload; **restore** shown in admin mode only, behind a confirm dialog
  with an optional reason field. Payload-less rows are marked non-restorable.

## E. Lifecycle details

- **Lock renewal:** `maybeRenew` extends retention on **both** `{i}` and `{i}.file` of the
  latest revision (the sliding anchor is the revision *pair*).
- **Storage accounting:** automatic — payloads live under the owner prefix, whose size §9
  already meters into the owner's storage consumption.
- **Deletion:** unchanged — renewal stops when the dataset is deleted, and payloads age
  out with their revisions at retention.

## F. Testing

Following the existing three-file split under `tests/features/integrity/`:

- **operations.unit.spec.ts** — new pure functions in `integrity/operations.ts`:
  restore-projection merge (covered-key replace/unset, owner/topics handling),
  suffix-aware key filtering (`latestKey` / `nextIndex` / revision listing ignore
  `.file`), payload-aware dedupe predicate.
- **core.api.spec.ts** — against MinIO: payload written with the anchor (revision JSON
  `payload.metadata` + `.file` object, locked), dedupe skip when latest has payload,
  self-healing upgrade when it doesn't.
- **admin.api.spec.ts** — end to end: file tamper → restore → reprocessed dataset + fresh
  `restore` anchor + `ok` verdict; metadata tamper → synchronous restore verdict;
  restore of an older revision; `changeOwner` refusal; revision detail (diff payload) and
  file download endpoints; payload-less revision returns 400 on restore.
- **Dev fixture:** extend the breach fixture demo with a restore step.

## Documentation

- `docs/architecture/integrity.md`: §2 (level 2 delivered), §3.1 (payload layout, sibling
  `.file` object, owner-transfer forbidden), §3.3 (diff/restore now available), §3.4/§3.5
  (renewal covers the payload object), §5 (files row: level 2 delivered, no size gate),
  §10 (status update).
