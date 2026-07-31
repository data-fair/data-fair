# Integrity target 3 — editable (REST) dataset lines: per-line locked revisions

> Status: **validated design** (brainstorm 2026-07-20). Successor to targets 1+2
> (files + metadata, levels 1+2 — see `docs/architecture/integrity.md` and
> `2026-07-17-integrity-level2-repair-design.md`). Branch: `feat-integrity5`,
> based on master + `feat-integrity4` (level 2 repair, merged into this branch).

## 0. The pivot: pure level 2, no fold

The architecture doc sketched target 3 level 1 as a dataset-level rolling fold over the
precomputed per-line CRC32 `_hash`. Brainstorming surfaced a blind spot and led to a
deliberate pivot:

- **The cheap fold cannot see silent content edits.** Folding the *stored* `_hash` detects
  out-of-band inserts/deletes/reorders, but a direct out-of-band edit of a line's content
  (which does not touch `_hash`) is invisible — arguably the most likely tamper. Any
  content-covering check must read payloads regardless, so the fold's cheapness is
  illusory for the part that matters.
- **Decision: skip the fold entirely and go straight to the §3.5 sliding-lock mirror at
  line granularity** — every line mutation appends a locked revision carrying the actual
  payload ("pure data revisions"). Detection, diff and repair all come from the same
  primitive, and the CRC32 hash-strength debate dissolves: the relay computes a SHA-256
  of the snapshot it stores, so detection is adversarial-grade without touching rest.ts's
  `_hash` (which remains a conflict-detection tool, not an integrity primitive).
- **Accepted restriction — the coverage cliff.** With no fold there is no cheap universal
  level 1: a dataset above the cardinality gate gets **no lines integrity at all**. We bet
  that sensitive editable datasets are modest-cardinality reference tables. A fold-based
  level 1 for the big tail remains possible later as a separate level (levels stay
  separate by design); nothing here forecloses it.

Scope decisions fixed during brainstorm:

- **Gate ≈ 100 000 live lines**, opt-in per dataset (superadmin), refused above the gate.
  The gate is a deployment config value (under `config.integrity`), default 100 000 —
  not hardcoded, so operators can tighten or raise it as prod experience accrues.
- **Line attachments are out of scope**: the snapshot covers the line document only.
  Attachment *bytes* are neither detected nor restorable — an explicit documented limit,
  same family as file-level-2 size gating. Possible later addition: md5 + copy in the
  line's revision.
- **Extension outputs (`_ext_*`) are excluded** from covered content — rebuildable
  projections, same argument that excludes ES.

## 1. Revision model & key layout

The enrolled REST dataset keeps its existing **joint dataset anchor** (metadata sha256;
no file md5 for REST datasets) untouched, and gains **one locked revision sequence per
line**, under the dataset's existing prefix:

```
data-fair/‹owner.type›-‹owner.id›/‹datasetId›/lines/‹encodedLineId›/‹paddedI›-‹sha256|deleted›
```

- `‹encodedLineId›` — the Mongo `_id`, URI-encoded so it is S3-key-safe.
- `‹paddedI›` — the line's existing monotonic `_i`, zero-padded wide enough for
  `timestamp3` values (~16 digits) so lexical order == numeric order. `_i` is unique
  across the collection and changes on every update, so it doubles as the revision index:
  **the relay never lists before writing**, and "latest" is the lexical max under the
  line's prefix.
- `‹sha256›` — the full hex content hash **embedded in the key**, so the checker recovers
  every line's latest anchor hash from LIST alone (1000 keys/page), no per-object GETs.
  Tombstones carry the literal marker `deleted` instead.
- The dataset-level anchor listing switches to `delimiter: '/'` so the joint-anchor
  paths stop seeing the `lines/` subtree.

**Revision object** (same store, same write-once compliance lock as every other
revision):

```
{
  hash: { sha256 },                      // absent for tombstones
  context: { operation, origin, date },  // actor category, never an identity (§1 trail/journal split)
  dataset: { id, slug },
  line: { _id, _i, _updatedAt, deleted? },
  payload                                 // the cleaned user body; absent for tombstones
}
```

- **Cleaned body** = the line document minus every `_`-prefixed field (internals and
  `_ext_*` outputs). `sha256 = sha256(stableStringify(cleanedBody))`, computed by the
  relay **from the payload it stores** — relay and checker are symmetric by construction.
- `operation` gains line values: `create | update | delete | enable | restore |
  fixIntegrity`. `origin` categories are unchanged
  (`user | superadmin | worker | propagation | upgrade`).

## 2. Write path — per-line transactional outbox

Chosen over a dataset-stamp + diff relay (O(N) reconciliation, loses context, is the
rejected passive-mirror shape) and over piggybacking on `rest.history` (couples
integrity to an optional TTL-able feature).

- Every legitimate line mutation adds **`_needsHistorizing: { context? }` to the line
  document inside the same single-document update** — exactly the `_needsIndexing`
  pattern, atomic on any shard key. Stamping happens only when
  `dataset.integrity.active`.
- **Stamping writers:**
  - the transaction pipeline (create / update / patch / delete; origin from the request
    context — `user`, or `superadmin` for admin-mode `_updatedAt` rewrites);
  - the TTL worker (tombstones, origin `worker`);
  - `deleteAllLines`-style resets (per-line tombstones — honest and expensive, bounded
    by the gate).
  - The extender does **not** stamp (`_ext_*` excluded from covered content).
- **Work discovery — hint-first ordering.** A dataset-level hint flag is set *before*
  the line stamps are written. A crash between the two leaves a harmless empty hint
  (relay finds nothing, clears it), never orphaned stamps. The relay worker picks up
  hinted datasets, processes stamped lines in batches (concurrent S3 PUTs), clears line
  flags per batch, clears the hint when none remain. **Retry-forward, per line.**
- **Tombstone purge coordination:** `commitLines` deletes `_deleted` docs once indexing
  is committed; it additionally requires `_needsHistorizing` to be absent, so a deletion
  revision can never be lost.
- **Checker guard:** a dataset with pending line stamps (or the hint) reports `unknown`
  instead of a false breach, as today.
- Legitimate writes already skip no-op updates (`_hash` comparison in the transaction
  path), so revision churn tracks real changes.

## 3. Enable, gate, and lifecycle

- **Enable** (existing superadmin `PUT /datasets/{id}/_integrity`, surface unchanged):
  for a REST dataset, count live lines first — **refuse above the gate (~100k)** with a
  `409` naming the gate. On success: anchor the joint metadata revision inline as today,
  then **stamp every live line** with `{ operation: 'enable', origin: 'superadmin' }`
  and set the hint — the relay backfills asynchronously. The response returns
  immediately; `GET _integrity` exposes `lines: { anchored, pending }` (pending = count
  of stamped lines) for backfill progress. Until the backfill drains, checks report
  `unknown`.
- **Growth past the gate:** writes are never blocked. If the live-line count later
  exceeds the gate, the integrity state carries a loud warning (UI + `GET _integrity`)
  but anchoring continues — silently dropping protection would be worse.
- **Disable / owner transfer / deletion:** unchanged semantics. Disable stops stamping
  and renewal; anchors age out at their existing retention. Owner transfer stays refused
  while integrity is active (the integrity4 rule — which also avoids re-anchoring 100k
  lines under a new prefix). Dataset deletion leaves the tail to age out (architecture
  §8 wait-out).

## 4. Check & lock renewal

The nightly `checkDataset` gains a **lines part** for enrolled REST datasets:

1. LIST all keys under `‹datasetId›/lines/` (≤ ~100 pages at the gate) → map
   `lineId → latest { _i, sha256 | deleted }`, from key names alone.
2. Scan live Mongo lines, recompute `sha256(stableStringify(cleanedBody))` per line,
   compare:
   - content hash mismatch → breach (out-of-band edit);
   - `_i` mismatch → breach;
   - live line with no revision → breach (out-of-band insert);
   - latest revision live but line missing in Mongo → breach (out-of-band delete);
   - latest tombstone + line absent → ok.
3. **Verdict:** the `breach` array gains a `'lines'` member;
   `integrity.lastCheck.lines = { checked, diverged, sample: [≤20 lineIds] }`. The
   breach event/notification path is unchanged.
4. **Renewal rides the check** (verify-then-renew, architecture §3.4 Option B): when the
   dataset's renewal is due, each line that passes gets its latest anchor's retention
   extended in the same pass (`PutObjectRetention` × live lines, ~monthly cadence).
   Failures aggregate into `integrity.linesRenewal: { date, status, renewed, failed }` —
   loud, never thrown. Renewal coverage is exhaustive by necessity (§3.5): a missed
   renewal permanently loses that line's repairability at lock expiry.

Cost at the gate: one full Mongo scan + SHA-256 per line + ~100 LIST pages per enrolled
dataset per night, plus monthly retention extensions. Comfortable at gated cardinality;
the sweep's dataset batching is unchanged.

## 5. Repair & reconcile

- **`POST _integrity/lines/_restore`** (superadmin, synchronous like integrity4's
  restore): re-runs the per-line comparison, then for each diverged line —
  - rewrites it from its latest revision payload through the standard transaction
    pipeline (`operation: 'restore'` — the restore itself is a legitimate write and
    produces a fresh revision);
  - re-inserts out-of-band-deleted lines;
  - **deletes out-of-band-inserted lines** (they have no verified state — that is what
    "restore to last verified state" means).
  Then re-checks and returns the fresh verdict. Bounded by the gate; paced but
  synchronous.
- **`POST _integrity/_fix`** extends naturally: diverged lines get fresh revisions
  written inline (`fixIntegrity` context) before the re-check — "bless the current
  state".
- **Per-line history:** `GET _integrity/lines/{lineId}/revisions` (paged from the S3
  LIST) plus payload download/diff, reusing integrity4's endpoints and UI patterns
  (permissions: reads open to owner-account admins via `readIntegrityRevisions`, writes
  superadmin-only, unchanged).

## 6. Failure model & testing

- Relay is retry-forward per line; a crashed batch leaves stamps in place and re-runs.
  The known narrow stamp-overwrite window (a stamp written while the relay is in-flight
  can be dropped by the flag clear) stays accepted and fail-loud via the next check —
  same posture as the dataset-level outbox today.
- **Unit tests** target pure functions in `operations.ts`: key build/parse (incl. URI
  encoding and `_i` padding), cleaned-body projection, sha256, the per-line comparison
  logic. No config tricks, per project convention.
- **API tests** (`tests/features/integrity/lines.api.spec.ts`): gate refusal; enable +
  backfill drain; organic write → new revision; the three tamper shapes (content edit /
  raw insert / raw delete via `test-env` raw writers) → breach with correct parts;
  restore heals all three; fix blesses; tombstone purge waits for historization;
  extender writes don't stamp.
- **Dev fixtures:** a third fixture dataset (`fixtures-integrite-lignes`) demonstrating
  enroll → edit → tamper → breach → restore.

## 7. Follow-ups after this iteration

- Update `docs/architecture/integrity.md` (§5, §10, §12) to record the pivot: target 3
  ships as pure level 2 per-line revisions; the fold-based level 1 moves from "the
  design" to "possible later level for the big-dataset tail"; the hash-strength open
  question is closed (SHA-256 of the stored snapshot).
- Candidates deliberately not in scope: attachment coverage (md5/copy), fold-based L1
  for above-gate datasets, applications/settings metadata (still deferred from
  target 2).
