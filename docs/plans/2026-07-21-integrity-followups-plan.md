# Integrity follow-ups — pre-release hardening (feat-integrity6)

Scope: the follow-ups worth closing before the first client release, deferred from the target-3
final review (M-findings), the level-2 backlog, plus two gaps found while designing M6. Branch
`feat-integrity6` builds on `feat-integrity5` (+ master merged).

## 1. File hash md5 → SHA-256 (level-2 backlog, promoted)

The payload reference dedupe keys off the file's md5, making md5 *storage-load-bearing*: a
chosen-prefix md5 collision would collapse two distinct file versions onto one locked payload —
the trail would claim to hold bytes it doesn't. The threat model is precisely an adversarial
tenant admin, so this touches the core guarantee. The store is unreleased: clean rename, no
migration.

- `RevisionBody.hash` becomes `{ file?: string, metadata?: string }`, both SHA-256-hex
  (was `{ md5?, sha256? }` with md5 = file bytes, sha256 = metadata projection).
- `hash.ts`: sha256 equivalents of `md5OfStorageFile` / tee; md5 tee kept only to fill the
  re-ingest descriptor's platform-level `md5` during file restore.
- relay / checker / service compare `hash.file`; UI + tests follow.
- `LineRevisionBody.hash.sha256` (already SHA-256, hash-in-key) is unchanged.

## 2. M6 — metadata `_restore` goes through the patch pipeline

`restoreRevision`'s metadata part raw-`$set`s covered fields with no revalidation and no
side effects: a restored `schema` change never triggers reindex/mapping checks, restored
`extensions` lose their worker bookkeeping, constraints are not re-checked. Fix: feed the
diverging covered keys (from `restoreUpdate`, `$unset` keys as `null`) through
`preparePatch` + `applyPatch` — same doctrine as the file branch ("restore re-ingests through
the standard pipeline").

- The restore context rides `patch._needsHistorizing` (applyPatch already defers to a pre-set
  stamp; the relay already forces on `operation: 'restore'`).
- If `preparePatch` set a worker status → return `{ status: 'restoring' }` (anchor rides
  finalize). No worker status → synchronous force-anchor + fresh verdict, as today.
- The settled-state 409 gate now guards every restore (it can trigger pipeline work even
  without a file part).
- Known accepted refusal: a tampered `rest.primaryKeyMode` cannot be healed by restore
  (preparePatch's guard 400s) — fail-loud beats silently rewriting line `_id` derivation.

## 3. Line-propagation stamping gap (found designing M6)

`applyPatch`'s `removedRestProps` `$unset` over the lines collection is unstamped: on an
enrolled REST dataset, a *legitimate* schema patch removing a property rewrites every line's
covered body → mass false 'edited' breach at the next check. M6's pipeline-routed restore hits
the same path when the restored schema drops an out-of-band-added property. Fix: when lines
integrity is active, set the `_needsHistorizingLines` hint first, then merge a per-line
`_needsHistorizing` stamp into that `updateMany`.

## 4. Extension-owned columns leave the covered line body (race found via M5)

`exprEval` (and remoteService `overwrite`) outputs are plain non-underscore columns, so they
are covered by `cleanedLineBody` — but the extender writes them back *outside* the transaction
pipeline, unstamped, racing the relay: relay-first ordering leaves the anchor diverged from
the extended body → false breach on a fully organic write. Doctrine (design §"extension
outputs are excluded — rebuildable projections") says derived columns are not covered content.
Fix: `extensionOwnedKeys(extensions)` (pure, mirrors `writeExtendedStreams`'s patchedKeys) and
exclude those keys in `cleanedLineBody` / `lineSha256` / `classifyLine` / line payloads.
Restore then rewrites a line without derived values and the pipeline recomputes them
(`_needsExtending`). This also makes the `removedExtensions` `$unset` harmless (not covered),
and makes M5's contract ("the extender doesn't stamp") provably correct.

## 5. Small review follow-ups

- **M2**: `disableIntegrity` also clears per-line `_needsHistorizing` stamps.
- **M3**: the nightly sweep's Mongo filter pre-excludes `_needsHistorizingLines` (a hinted
  dataset returned 'unknown' without persisting `lastCheck.date`, so it kept sorting first and
  wasted a sweep slot every night).
- **`_hash: null` unification**: single named helper for the dedupe-bypass idiom (2 call sites).

## 6. Level-2 test debt

- combined file+metadata tamper → one restore heals both parts;
- a 409-refused file restore writes no metadata (regression guard for the up-front gate).

## Out of scope (stay post-release)

Applications/settings metadata coverage, attachment + lines-owner coverage, fold-based level 1
above the gate, lib-node generalization, log posture, central service. Retention-window default:
product decision, discussed separately (see conversation of 2026-07-21).

## Verification protocol

Dev env for the worktree must be started by the maintainer (agents must not). Tests are
committed *before* their implementation (test-commit → impl-commit pairs) so RED can be
verified honestly at the test commit, then GREEN at HEAD, once the env is up.
