# Integrity — trail coherence & store authority — implementation plan

Design: [2026-07-22-integrity-trail-coherence-design.md](./2026-07-22-integrity-trail-coherence-design.md).
Branch `feat-integrity6`. Repo protocol: test commit → impl commit per step; dev env for the
worktree is started by the maintainer; run only the related specs while iterating.

## T1 — store + pure trail operations (unit surface)

- `store.ts` `iterateVersionPages`: expose `etag` (already exposes `size`).
- `operations.ts` (pure): `TrailAnomaly` type; `foldTrailVersions(acc, page)` — consumes
  lexically-ordered version entries (per-key adjacency + stable sort keeps S3's
  newest-first order within a key), produces the reconstructed current view (latest
  non-marker version per key) and per-key anomalies: `delete-marker` (any marker),
  `version-divergence` (>1 non-marker version differing in size or ETag).
  `sequenceGapAnomalies(indexes)` (mid-sequence holes only), `dateSkewAnomaly(contextDate,
  lastModified, toleranceMs)`, `anomalyFingerprint(a)` (`kind:key:sortedVersionIds`),
  `filterAckedAnomalies(anomalies, fingerprints)`.
- Unit specs in `tests/features/integrity/operations.unit.spec.ts`.

## T2 — trail verdict in the checker

- `checkDataset` replaces its two current-view LISTs with **one versions walk** over the
  full dataset prefix (no delimiter): fold splits dataset-sequence keys / `.file` keys /
  `lines/` keys, feeds the trail fold, and hands the reconstructed lines keys to
  `foldLatestLineAnchors` (marker-hidden lines resurface in the compare).
- `compareDatasetLines` gains an `anchors` injection point so the checker's walk is shared;
  `fixIntegrity`/`restoreLines` keep their own walk via a thin wrapper.
- Date-skew: incremental via `integrity.lastCheck.trailCursor` (highest index already
  date-verified); `checkDataset(dataset, { deep })` verifies the full window; route
  `POST …/_check?deep=true`.
- Ack filtering: Mongo `integrity.trailAck: { i }` is a **pointer only** — the checker GETs
  revision `i`, requires `operation === 'ackTrail'`, and uses the fingerprints from the
  locked revision body (a forged pointer verifies false and is ignored; a store-forged ack
  is itself trail-evidence, journal-crosscheckable — accepted, §S1).
- Verdict: `lastCheck.trail = { status, anomalies? }`; `integrity-trail-altered` event
  (transition-gated in this step, realert in T4); i18n en+fr; the dataset-list breach
  filter (`datasets/service.ts` error-filter row) treats `trail.status: 'altered'` like a
  breach.
- Config `integrity.trail.dateSkewHours` (48) + env + type schema.

## T3 — terminal revisions + scope audit

- `RevisionOperation` += `'disable' | 'delete' | 'ackTrail'`.
- `anchorDataset` returns the written index and accepts `opts.ack` (fingerprints merged
  into the revision body) — shared by disable/delete/ack writers; force always leaves a
  revision, and the payload-reference dedupe keeps terminal revisions payload-cheap.
- `disableIntegrity`: write the `disable` revision FIRST (force), then watermark reset +
  Mongo flip + stamp sweep (design §S2 ordering inversion; S3-down blocks disable —
  fail-loud). Route accepts optional `reason`.
- Dataset delete (`datasets/service.ts`): when enrolled, write the `delete` revision before
  destructive removal (same posture).
- `checkDataset`: an **active** dataset whose latest revision is a terminal one (crash
  residue) re-anchors inline instead of comparing against it.
- `auditScopes` (new `api/src/integrity/audit.ts`): rides the daily pass sharing the
  storage measure's owner walk — per dataset scope, classify per the design table (age
  lower-bound first, `getRetention` HEAD only when age has lapsed); Mongo hint read per
  scope; `integrity-scope-incoherent` event (deleted datasets: synthetic resource from the
  revision's `dataset: { id, slug }` + prefix owner). `purgeExpiredRevisions` reports the
  delete markers it reclaims per scope; `task()` feeds them into the audit's report
  instead of silent sweeping.

## T4 — alert robustness

- `integrity.alerts: { [eventKey]: date }` dedup map; pure `shouldNotify(isBad, wasBad,
  lastAlertDate, realertDays, now)`; applied to the four bad-state events
  (breach, trail-altered, renewal-failed, scope-incoherent).
- `lastCheck.definitiveDate` written on ok/breach; seeded at enable; daily query in
  `task()` fires `integrity-check-stale` for active datasets stale beyond
  `integrity.maxUnknownDays`; same realert cadence.
- Config `integrity.realertDays` (7), `integrity.maxUnknownDays` (7) + env + schema.

## T5 — ack route + UI

- Service `ackTrailAnomalies(dataset, reason)`: fresh trail check → `anchorDataset` with
  `{ operation: 'ackTrail' }` + fingerprints → set `integrity.trailAck` → fresh verdict.
  Route `POST …/_integrity/trail/_ack` (admin mode, dataset lock). Journal/events log the
  action like fix/restore.
- UI integrity panel: second status row for the trail verdict; anomalies table (kind, key,
  detail, confidence); admin-mode ack action with consequence-stating confirm + reason.
  List badge includes trail-altered.

## T6 — `_i` wedge (amended mechanism, design §S4)

- `anchorLine`: refuse `_i ≥ 10^16` (padding overflow) — internalError + stamp left
  pending (check-stale surfaces it).
- `fixIntegrity`: after bless + drain, re-compare; for lines whose fresh anchor did not
  outrank a forged higher-index anchor: single-document write setting
  `_i = staleAnchor.i + 1` (advance past duplicate-key), `_hash: null`, stamp with the
  fix context; drain; the existing final `checkDataset` proves convergence.

## T7 — docs

- integrity.md: §1 threat-model rewrite (design §S5), §3.3 second verdict, §3.5 terminal
  revisions + audit, §7 ack surface, §12 round-3 entry flipped to delivered.
- Design doc status flipped; this plan referenced from it.

## Verification

Per-step: related unit + integrity API specs. Final: full `tests/features/integrity/`
suite + type ratchet + lint. Known pre-existing env flake (datasets-upload webhook count)
is not a gate.
