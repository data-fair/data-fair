# Integrity — lines at 1M scale (streamed compare) — design

Status: approved in brainstorm 2026-10-15, spec awaiting review.
Context: [architecture §5 "Editable (REST) dataset — Mongo lines"](../architecture/integrity.md),
[target 3 design](2026-07-20-integrity-target3-lines-design.md) (origin of the 100k gate).

## 1. Goal and non-goals

**Goal.** Lift the REST lines integrity gate from 100 000 to 1 000 000 live lines while
offering **the same guarantee**: every live line verified every night, same verdict shapes
(edited / inserted / missing), same trail verdict, same verify-then-renew rule.

**Non-goals.**

- **Sampling / rotation.** Considered and deferred. Sampled windows give statistical trust
  against bulk tampering but almost none against a targeted single-line edit (8×128 windows on
  1M lines ≈ 0.1 % per night), and renewal must stay exhaustive anyway (one
  `PutObjectRetention` per live line per window), so an exhaustive streamed pass is needed in
  any design. Beyond 1M, the later step is: nightly sampled windows + a monthly full streamed
  pass that also renews — no cursor, so no Mongo-resident state to pin. This design is its
  prerequisite and nothing in it is wasted by that step.
- No change to the S3 key layout (invariant 11), the relay, or the outbox.

## 2. Why the gate exists today

`checkDataset` folds every line anchor of the scope into an in-memory
`Map<lineId, LatestLineAnchor>` (O(distinct lines in the retention window)), then scans Mongo
and joins against it. Renewal reuses that map. `compareDatasetLines` (used by `_fix` and
`lines/_restore`) builds the same map and returns complete divergence lists. Memory is the first
limit; the synchronous admin actions (several full compares inside one HTTP request) are the
second.

A Mongo/S3 merge-join was rejected: S3 order is the order of `encodeURIComponent(lineId) + '/'`,
which differs from Mongo's binary `_id` order (unsafe characters are percent-encoded, and `-`,
`.`, `!`, `'`, `(`, `)`, `*` sort below the `/` terminator, so prefix-related ids invert). The
design below needs no shared order.

## 3. Streamed lines compare

### 3.1 Pass A — S3-driven, batched Mongo lookups

- The single versions walk of `checkDataset` is kept (it serves both verdicts). Line entries
  are fed to the existing trail fold; the reconstructed *current* view (marker-hidden keys
  resurfaced) is consumed **per lineId group**: all keys of a lineId share the
  `lines/‹enc›/` prefix and are therefore contiguous in listing order. A group is emitted —
  `{ lineId, latest anchor }` — once the fold has flushed the group's last key (a key's
  versions can straddle a page boundary: emission waits for the next key or the end of walk).
- Emitted anchors accumulate in a batch (~1 000). Each batch is one
  `collection.find({ _id: { $in: ids }, _deleted: { $ne: true } })` and every returned line is
  classified with the unchanged `classifyLine`. Exact `$in` matching equals today's `Map.get`
  (line collections have no collation).
  - live line + live anchor, verdict `ok`/`edited` → counted in `matched`; `edited` reported;
  - live line + tombstone latest → `inserted` (as today);
  - non-tombstone anchor with no live line → `missing`;
  - tombstone anchor with no live line → `ok` (deleted legitimately, as today).
- `checked` (persisted in `lastCheck.lines`) is the live-line count of pass B, same meaning as
  today's scanned count.
- Every live (non-tombstone) anchored lineId is recorded as an 8-byte fingerprint (first 8
  bytes of sha256(lineId)) in a growable typed array (~8 MB per 1M lines), sorted at end of
  pass A.

### 3.2 Pass B — inserts by count

`_id` is unique, so every live line holding a live anchor is matched exactly once in pass A:
**out-of-band inserts exist iff `countDocuments({ _deleted: { $ne: true } }) > matched`**
(tombstone-latest inserts are already counted in pass A and excluded from `matched`). The count
compares against *lookups*, not against anchors, so "delete X, insert Y" still trips it (X is
`missing`, Y makes the count disagree).

Only when the count disagrees does a Mongo stream (`_id` projection) name the inserted lines by
binary search in the fingerprint array. A fingerprint collision can only drop an id from the
≤20-line sample (forcing one costs ~2⁶⁴); the verdict and the diverged count stay exact.

Concurrency is unchanged from today: the scan was never a snapshot; legitimate writes are
stamped and the existing post-breach pending-flag re-read downgrades to `unknown`.

**Implementation ruling — naming falls back to a scan when the live set moved.** Insert-by-count
is exact only on a stable live set: a covered write landing between pass A and the count would
make the count disagree for a legitimate reason, or hide an insert behind a concurrent delete.
The comparer therefore also runs the naming pass whenever `changedDuringCompare()` reports a
covered write during the compare (not only when `unaccounted > 0`), so the sample and the
verdict are computed from a scan rather than from a count taken on a moving set.

### 3.3 Output shape

`compareDatasetLines(dataset, store, opts)` stops returning full lists. It takes an
`onDiverged(batch)` callback, each entry `{ lineId, kind: 'edited' | 'inserted' | 'missing',
anchor?: { key, i } }`, and returns `{ checked, diverged, sample }`. `checkDataset` uses it with
a sample-only callback; `_fix` and `lines/_restore` repair batch by batch (§4). The
`lastCheck.lines` persisted shape is unchanged.

### 3.4 Trail anomalies: ack filtering BEFORE capping

The anomaly list is unbounded today and filtered by ack fingerprints after the walk. To bound
memory it gets capped during collection — which is only sound if acked anomalies cannot fill the
cap and push out an unacked one (that would turn `altered` into a false `ok`). So:

- the latest `ackTrail` revision's fingerprints are loaded **before** the walk (same
  store-authority read as today: Mongo `trailAck` is only a pointer to the locked body);
- each anomaly is filtered as it is produced; only unacked ones are kept, up to the cap, with a
  total count;
- `TRAIL_ANOMALY_CAP` (persisted) is unchanged; the in-memory cap may equal it.

### 3.5 Renewal — a second streamed walk, per-key verified

When lines renewal is due and the check was fully clean (data ok AND trail ok — unchanged rule),
`maybeRenewLines` performs its own versions walk under the same lock and, per lineId group,
extends the latest live anchor **only if that key's own versions show no shadow or marker**.
Batch-concurrent (100 in flight), same `integrity.linesRenewal` bookkeeping and alert.

This is slightly stricter than today: today's renewal works from the key list captured during
the check, so a shadow version slipped in between check and renewal would get its lock extended
(`PutObjectRetention` carries no version id); the per-key re-verification closes that. Cost: one
extra listing per renewal cycle (~monthly), small next to the `PutObjectRetention` count.

## 4. Synchronous admin actions — time budget

`_check`, `_fix`, `lines/_restore`, `trail/_ack` and the metadata `_restore` each run at least
one full check under `withDatasetLock`; `_fix` runs up to three. At 1M lines that is minutes
even for a single diverged line.

- **Budget.** Each action starts exactly as today. The route awaits it for at most
  `config.integrity.adminSyncBudgetMs` (default 20 000). Finished → response carries the fresh
  verdict (unchanged behavior and tests at small cardinality). Not finished →
  `202 { status: 'running' }`; the work continues in the same process, lock held (lib-node
  locks are prolonged per process and expire by TTL if the pod dies).
- **Display state only.** `integrity.running: { action, startedAt }` is set when the budget
  expires and unset when the work ends. It never gates anything: forging it only makes the panel
  show "in progress"; the check-stale clock still bounds a wedged verdict.
- **Rejected: worker task triggered by a Mongo flag** (the usual data-fair pattern). A
  Mongo-writing adversary could set e.g. `_integrityRepair: { action: 'fix' }` and have a worker
  *bless their own tampering*. Work stays in the process that served the authenticated
  superadmin request.
- **Crash mid-action** leaves nothing inconsistent: every rewritten line went through the
  transaction pipeline and gets its own anchor; the verdict stays `breach`/`unknown` and the
  superadmin re-runs the action, which converges.
- **Repairs collect, then apply.** `_fix` and `lines/_restore` collect the `onDiverged` batches
  during the compare (memory O(diverged lines), not O(lines)) and repair **after** the stream
  ends, in chunks of 1000: restore fetches payloads by `anchor.key`, fix blesses through
  `rewriteLinesThroughPipeline` per chunk, tombstones use `anchor.i`; the `_i`-wedge re-compare
  uses the same callback. Repairing inside the callback was rejected: mutating a line
  mid-stream makes a just-restored line read as an out-of-band insert in the same compare.
- **UI.** The panel extends its existing `'restoring'` handling to `'running'`: it polls
  `GET _integrity` until `integrity.running` disappears and `lastCheck.date` has advanced.

**Accepted cost — nightly lock hold.** The sweep holds `datasets:‹id›` for the whole check
(~30 s at 100k today, minutes at 1M): other worker tasks for that dataset, including indexing of
REST writes, wait. API writes still land in Mongo; the ES projection lags by up to the check
duration once a night. Documented, not engineered around.

## 5. Gate, backfill and other daily walks

- **Gate.** `integrity.lines.maxLines` stays configurable, `overGate` warning unchanged. The
  default moves 100 000 → 1 000 000 **only if the §6 measurement supports it**; until then the
  code supports 1M and operators can raise the value.
- **Enable backfill** is already async and batched: ~2M PUTs at 1M lines (revision + `.who`).
  Checks report `unknown` until drained, so the backfill must finish well within
  `integrity.maxUnknownDays` (default 7) or enrollment trips `integrity-check-stale`.
- **Other daily walks** — none holds a whole-dataset structure, so none blocks 1M; all are time
  O(objects): `measureIntegrityStorage` streams every version per owner daily; the purge streams
  a scope when its watermark is due (frequent writes → near-daily); the scope audit lists with
  delimiter `/` and never sees line anchors.

## 6. Measurement (gates the default change)

Local MinIO latency is not Scaleway's: the portable figures are **request counts and peak
memory**; wall time is extrapolated with a per-request latency measured on Scaleway. The opt-in
spec `tests/features/integrity/lines-scale.api.spec.ts` (skipped unless `INTEGRITY_SCALE_LINES`
is set) does:

1. seed a 1M-line REST dataset on the dev stack, enable integrity — backfill duration, PUT count;
2. apply churn so the retention window holds several revisions per line;
3. nightly check — peak heap, LIST pages, `$in` queries, duration; same on a 100k copy for
   reference;
4. renewal walk, storage measurement and purge on the same data;
5. tamper one line, `_fix` — the 202-then-converge path end to end.

Results replace the 100k rationale in `docs/architecture/integrity.md` (§5 limits, §10). The
default moves only if peak memory is bounded and extrapolated nightly time and backfill duration
are acceptable.

## 7. Tests

- Existing integrity suites (`trail.api.spec.ts`, `lines.api.spec.ts`, …) pass **unchanged** —
  the acceptance criterion for "same guarantee".
- Differential unit test: today's map-based compare vs the streamed compare on identical anchor
  and line sets, including attack shapes (edit, `_i` rewind, insert, delete, delete-X-insert-Y,
  tombstone-then-live, marker-hidden anchor, key straddling a page boundary) → identical verdicts
  and counts.
- Unit: acked anomalies exceeding the cap + one unacked → trail verdict `altered`.
- Unit: renewal walk skips a key with a shadow version and renews the others.
- API: tiny `adminSyncBudgetMs` via `test-env/set-config` forces the 202 path; the panel-facing
  state converges (`integrity.running` cleared, fresh `lastCheck`).

## 8. Documentation

- `docs/architecture/integrity.md`: §3.3 (time budget, renewal walk), §5 lines bullets
  (streamed compare, insert-by-count, measured gate), §10, §14 (sampling as the >1M step).
- `api/src/integrity/README.md`: new invariants — ack filter before cap; renewal re-verifies per
  key; admin work never triggered from a Mongo flag; `integrity.running` is display-only.
