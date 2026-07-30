# Integrity simplification — design

> Status: implemented 2026-07-16 on feat-integrity3 (this plan). Companion to
> [docs/architecture/integrity.md](../architecture/integrity.md).

## Goal

Reduce the code volume and coordination complexity introduced by the two integrity PRs
(#481 target 1, #499 target 2 — ~3,500 inserted lines) without giving up the delivered
guarantee: level-1 tamper detection for dataset files and metadata backed by a
compliance-locked S3 trail. Five decisions, agreed after a complexity review; each trades
at most a marginal behavior for a structural simplification.

## D1 — Normalize denormalized names out of the metadata hash

**Behavior change.** The covered projection (`coveredMetadata()`) reduces denormalized
references to their identifying keys before hashing:

- `owner` → `{ type, id, department? }` (drop `name`, `departmentName`)
- `topics[]` → `{ id }` only (drop title/color/icon)
- `permissions[]` → drop the display `name` (keep type/id/department/classes/operations —
  the ACL semantics stay fully covered)
- `masterData.shareOrgs[]` → `{ id }` only

Tampering with a *display name* on the dataset doc is no longer detected. These fields are
denormalized copies whose authoritative source lives elsewhere (simple-directory,
settings.topics) and which the platform re-syncs wholesale — the same "rebuildable
projection" argument that excluded ES.

**Simplification.** The six name-sync propagation stamps are deleted: 5 in
`identities/service.ts` (`renameIdentity` owner/department/permissions/shareOrgs loops —
including one dead site: the `privateAccess` loop's `if (c === 'datasets')` can never be
true) and the topic-*update* stamp in `topics.ts`.

**Kept.** Four propagation writers make genuine covered-content changes in bulk and keep
their stamp (the honest rule — any covered-content writer stamps): `deleteIdentity`'s
permission-entry removal, topic *deletion* `$pull` in `topics.ts`, `customMetadata` cleanup
`$unset` and `deletePublicationSite`'s `$pull` in `settings/service.ts`. `publicationSites`
and `permissions` remain covered — they control visibility/ACLs, the highest-value tamper
targets. `stampHistorizeMany` itself remains (16 lines), with 4 call sites instead of 10.

## D2 — Collapse the file/metadata classes into one joint anchor

**Behavior change.** None observable. Per-class enable was never exposed (both classes
always activate together), and the breach verdict can still name what diverged because the
revision stores both hashes.

**New shape.**

- Key layout: `data-fair/‹owner.type›-‹owner.id›/‹datasetId›/‹i›` — no `‹class›` segment,
  one sequence per dataset.
- Revision body: `{ hash: { md5?, sha256 }, context, dataset }` — `md5` of the stored file
  (absent for non-file datasets), `sha256` of the covered metadata, both recorded on every
  revision. Dedupe compares the pair.
- Dataset doc: `integrity: { active, lastCheck, lastRevision, lastRenewal }` — one state
  object instead of two class objects. `lastCheck` gains a detail on breach:
  `{ status: 'ok'|'breach'|'unknown', date, breach?: ('file'|'metadata')[] }`.
- Outbox: `_needsHistorizing: { context? }` — the `classes` array disappears (a stamp means
  "re-anchor", and every anchor covers both hashes). Relay filter becomes
  `{ _needsHistorizing: { $exists: true } }`.
- One breach event (`integrity-breach`) whose payload/i18n names the diverged part(s),
  replacing the two per-class event keys.
- Checker: one comparison pass per dataset (compute both hashes, compare to the latest
  anchor's pair); one lock renewal per dataset instead of two.
- UI: one status block with per-hash breach detail instead of two class blocks; history
  table drops the class column.

**Cost accepted.** A metadata-only edit re-records the file md5 in the new revision (a few
bytes at L1; at L2 payload dedupe by hash avoids re-copying files).

**Migration.** None — nothing is enrolled in production yet, so this is a clean cut with
no legacy-key fallback and no upgrade script. Dev/test environments re-seed their fixtures;
any stray class-segmented anchors in dev buckets age out at their retention.

## D3 — Depersonalized revision context (trail/journal split)

**Behavior change.** The trail stops recording *who*; it records *what kind*. Revision
context becomes `{ operation, origin, date, reason? }` with
`origin: 'user' | 'superadmin' | 'worker' | 'propagation' | 'upgrade'`. Identity-level
attribution ("which user") stays solely in the events/journal system, which is mutable and
already anonymized on identity deletion — joining trail→journal by date answers "who"
within the journal's lifecycle.

**Why.** (a) `user:‹id›` is personal data (pseudonymized ≠ anonymized) inside an
undeletable compliance-locked object — a user-erasure request while the dataset lives on
cannot be honored; §8's wait-out only covers dataset deletion. (b) The identity copy
quasi-duplicates the events system. (c) Legitimacy review — scanning the revision list for
unexpected operations — needs operation type + actor category, not identity.

**Simplification.** `originatorOf()` and session extraction at stamp sites disappear;
`applyPatch` stops deriving context from `patch.updatedBy`; the outbox context shrinks.
Origins are constants per site: `applyPatch` → `user`, enable/fix routes → `superadmin`,
finalize → `worker`, bulk stamps (D1's four survivors) → `propagation`, upgrade scripts →
`upgrade`. `reason` (free text) stays, on `fixIntegrity` only.

**L2 note (recorded for the follow-on).** Level-2 payload snapshots store the *covered
projection*, not the raw doc — with `createdBy`/`updatedBy` already removed from the
dataset doc (recent personal-info cleanup) and D1/D3 in place, no personal data enters the
WORM store at either level.

**Doc impact.** §1/§3.1/§8 of integrity.md currently promise user-level context retention
("retained even under GDPR pressure"); they are rewritten to state the trail/journal split.

## D4 — Synchronous admin actions, no realtime channel

**Behavior change.** `PUT _integrity` (enable) and `POST _fix` anchor **inline in the
request** (compute hashes, write the revision, update `integrity.lastRevision`, and for
`_fix` run the check immediately) instead of stamping the outbox and letting the worker
relay pick it up. `POST _check` is already synchronous. These are rare superadmin actions;
the response carries the fresh state, so the panel updates on the action's own await.

**Simplification.** The whole realtime feedback subsystem is deleted: the
`realtime-integrity` operation, the `datasets/{id}/integrity` WS channel, relay/checker
emits, the UI subscription + debounce, and the relay's fixIntegrity re-anchor-then-verify
chain (dynamic import of the checker). The outbox/relay remains only where async is
genuinely needed — organic writes (`applyPatch`, finalize, the four propagation stamps).
The anchor-writing logic is factored so route and relay share one `anchorDataset()`
function rather than duplicating it.

**Cost accepted.** Organic-write anchoring (relay) is no longer observable live in the
panel; the panel shows it on next load. Breach verdicts from the nightly sweep likewise.

## D5 — Mechanical trims (no behavior change)

- Merge the 7 test files (~1,050 lines) around flows: `operations.unit`, one core-flow API
  spec (relay + checker + renewal), one admin-surface API spec (endpoints + permissions +
  UI-facing fields). Target roughly half the current volume, dropping per-class duplicates
  made moot by D2.
- Fixtures: 4 demo datasets → 2 (`ok` + `breach`, the breach one tampering both file and
  metadata; the per-class-independence and reconcile demos lose their purpose with D2/D4 —
  reconcile is demonstrated in the `breach` fixture's comments instead).
- UI stops redeclaring `IntegrityState`/`ClassState` types; import from the schema types.
- Revisions endpoint: with one sequence, `count = latest index + 1`; page keys are computed
  from the index range (zero-padded keys), so the endpoint GETs only the requested page
  instead of listing every revision then slicing.
- i18n: per-class keys collapse to one set (+ a short "diverged: file/metadata" fragment).

## What deliberately does NOT change

- The transactional-outbox pattern for organic writes (single-doc atomic stamp, relay
  retry-forward) — the races it closes are real; D4 only removes it where a synchronous
  path is simpler.
- The fail-loud denylist posture of the covered projection (D1 refines the projection, not
  the philosophy).
- The relay/checker reading the S3 store as the authority (never the Mongo mirror — the
  mirror is tamperable; `lastRevision` stays a display/renewal hint only).
- Lock renewal by extension (validated on Scaleway 2026-07-16) and the sliding checker.
- The store layer (`store.ts`, `hash.ts`) — already minimal.

## Order of work

D2 (joint anchor) first — it reshapes every surface the others touch; then D3 + D4
(both shrink context/flow plumbing), then D1 (projection + stamp deletions), then D5
(tests/fixtures/UI last, once shapes are final). One PR, commits per decision.

integrity.md is updated in the same PR: §3.1 (key layout), §3.2 (outbox shape), §5
(projection normalization), §7 (drop realtime-integrity), §1/§8 (trail/journal split),
§10 (status).
