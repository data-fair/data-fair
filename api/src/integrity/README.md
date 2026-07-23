# Integrity module — invariants to keep

Read this before changing anything in this directory or in the write paths it instruments.
Full design: [docs/architecture/integrity.md](../../../docs/architecture/integrity.md). The
guarantee this module sells is **tamper-evidence backed by compliance-locked storage**: most
bugs here don't crash anything — they silently weaken a promise made to auditors. The listed
invariants are the ones whose violation does exactly that.

## Ordering

1. **Hot state first, locked revision second** — everywhere except the two terminal
   operations. A compliance-locked revision can never be unwritten, so anchoring state that
   later rolls back would poison the trail permanently. The transactional outbox
   (`_needsHistorizing` stamps + relays) exists to make this ordering crash-safe.
2. **Terminal revisions (disable / dataset delete) invert the rule deliberately** —
   revision FIRST, Mongo flip second (`service.ts` disable, datasets delete path). The
   Mongo-first crash residue is indistinguishable from the alarm-kill attack; the
   revision-first residue is benign and self-healed by the checker. Don't "fix" this
   inversion back.
3. **Level-2 payload before revision JSON** (`relay.ts`): a crash in between leaves a
   harmless orphan payload; the reverse order leaves a revision claiming bytes it doesn't
   have.
4. **`.who` before revision JSON, and before the payload too — who-FIRST** (`relay.ts`
   `anchorDataset`, target 8): a crash between the `.who` write and the revision write is
   recovered by retry-forward (the relay recomputes the same index and re-PUTs both); the
   reverse order would lose attribution forever, since a retry after that crash dedupes
   against the already-landed revision and returns early, never reaching an unwritten `.who`.
   Only written for a genuinely fresh revision (never on the dedupe path) and never when
   `config.integrity.attribution.active` is false (`operations.ts` `shouldWriteWho`).
   **`lines-relay.ts` `anchorLine` mirrors this exactly** (target 4): there is no dedupe path to
   worry about (the line's own `_i` is the index, no LIST-before-write), so the guard is simpler —
   who-first, then the revision (or tombstone) JSON, using the same `shouldWriteWho` gate and the
   same retain-until formula (`operations.ts` `computeAttributionRetainUntil`, shared by both
   call sites so they cannot silently diverge). `who` reaches the line stamp via the route layer
   (`whoFromReq(req)` threaded through `applyTransactions`/`TransactionStream` in
   `datasets/utils/rest.ts`, alongside `sessionState`/`historizeContext`) — enable-backfill and
   `_fix`'s bless get it for free because they already ride a `HistorizeContextHint` carrying
   `who` into the same per-line stamp.

## Sibling awareness

5. **Every consumer of a prefix listing must treat it as a *sibling-aware* sequence, never a
   raw key list** (`isSiblingKey`/`SIBLING_SUFFIXES` in `operations.ts`, `parseLineRevisionKey`'s
   explicit `undefined` for line siblings). A `‹i›.file` or `‹i›.who` key is a strict string
   extension of its own revision key, so it sorts lexically *after* it — `nextIndex`, `latestKey`,
   the checker's `seqIndexes`, the service's revision listings, the scope audit, and the purge's
   `protectedKeys` grouping all filter siblings out **before** treating the lexical-max key as
   "latest", or a sibling would itself be mistaken for the current revision (and the real one it
   shadows silently dropped from protection). Adding a third sibling suffix later means adding it
   to `SIBLING_SUFFIXES` once, not hunting down every listing consumer again.

## Stamping discipline

6. **Every writer of covered content stamps** — directly, via `applyPatch`'s
   `coveredPatchKeys` gate, or via `stampHistorizeMany` for bulk propagation. An unstamped
   covered write is a false-breach generator; a stamped-but-uncovered write is churn. The
   **classification ratchet** (`tests/features/integrity/operations.unit.spec.ts`) forces a
   conscious decision for every new dataset-schema property.
7. **Lines: hint first, stamps second** (`_needsHistorizingLines` before per-line
   `_needsHistorizing`). The relay and the checker both carry nets for the orphaned-stamp
   race — if you touch the hint lifecycle, keep both nets.
8. **The extender never stamps** — and that is only sound because the columns it writes are
   exactly `extensionOwnedKeys()`, which is also the covered-body exclusion set. It is a
   single shared function (`lines-operations.ts`, used by `rest.ts` `writeExtendedStreams`);
   never reintroduce a second implementation.

## Locking

9. **Everything that anchors or checks a dataset holds the `datasets:‹id›` worker lock**
   (relay tasks via the worker loop; admin actions via `withDatasetLock`; the sweep via
   try-acquire). An unlocked anchorer can race another to the same LIST-derived index: the
   shadowed loser is later purged = permanent trail loss. New anchor writers must take the
   lock; new checker callers must either hold it or accept `unknown` downgrades.

## The store is the authority, Mongo is a hint

10. Every Mongo-resident integrity field (`integrity.active`, `lastCheck`, `lastRevision`,
    `trailAck`, `alerts`, the stamps) is writable by the in-scope adversary. Nothing
    guarantee-bearing may *terminate* on a Mongo read: each hint has a store-side backstop
    (scope audit for `active`, realert cadence for alert dedup, store heal for
    `lastRevision`, locked-body fingerprints for `trailAck`). If you add state, decide its
    backstop.
11. **The trail must stay verifiable from LIST alone**: dataset revisions are keyed by
    zero-padded index, line revisions by padded `_i` with the content hash in the key. No
    Mongo mapping may become necessary to order or interpret the trail. This is also why
    `anchorLine` refuses out-of-range `_i` (padding overflow breaks key ordering).
12. **The purge deletes only what the store itself proves lapsed** (real
    `ObjectLockRetainUntilDate`, skew margin, protected current-anchor carve-out) and
    **reports** the delete markers it reclaims (attacker artifacts) instead of silently
    sweeping them. **`.who` is never in the protected carve-out** (`purge.ts` `protectedKeys`
    explicitly excludes sibling keys before computing the latest): the current anchor's
    attribution ages out at its own shorter horizon independently of the (protected) revision
    it attests to — the one deliberate asymmetry with `.file`, which *is* protected as part of
    the anchor pair (§3.5 of the architecture doc).

## Verdicts and alerts

13. **Fail toward `unknown`, never toward a false verdict** — pending stamps, mid-check
    writes, terminal-residue latest: all downgrade to `unknown`. That posture is only safe
    because `unknown` cannot silently accumulate (`integrity-check-stale`); if you add a new
    deferral path, make sure the stale clock still covers it.
14. **Renewal only on a fully clean pass** (data ok AND trail ok): `PutObjectRetention` is
    keyed without a version id — under a shadow attack it would extend the attacker's
    current version while the original's lock runs out. **`.who` siblings are never renewed,
    full stop** (short fixed retention, target 8) — they are excluded from every anchor set
    before renewal runs, same exclusion as the purge's protected set above.
15. **Remediations always leave their own revision** (`force: true` on restore/fix/ack/
    terminal writes; terminal revisions and acks are never dedupe targets). A fix that can
    silently vanish from the trail is not a fix.
16. **Nothing personal enters the WORM store** — actor *categories* only (`RevisionOrigin`),
    covered projections with identity fields excluded. The store is undeletable; a leaked
    identity in it is a GDPR incident by construction. Actor *identity* is bounded instead:
    the `.who` sibling (target 8) carries it, locked for a short, fixed, never-extended
    retention distinct from (and shorter than) the revision's own — see `WhoBody`/`whoKey` in
    `operations.ts` and `writeWho`/`getWho` in `store.ts`. **`.who` is never load-bearing**: it
    is never a dedupe target, never referenced by any other object, and no verdict, restore or
    renewal decision ever depends on its presence — losing one (crash before write, early purge,
    the attribution kill switch) only ever degrades a revision to "unattributed", exactly
    today's pre-attribution state, never to a false verdict or a blocked repair.

## Testing

The adversarial suites in `tests/features/integrity/` (`trail.api.spec.ts` especially)
encode the attack scenarios these invariants defend against — shadow versions, delete
markers, alarm-kill flips, forged stamps and `_i` inflation, alert suppression. When you
change behavior around an invariant, extend those suites with the attack you are defending
against, not only the happy path.

## Index verdict (A1) invariants

- Every ES access in the index check goes through the dataset ALIAS (`aliasName`), never a
  physical index name: a diverted alias is an in-scope attack and must be caught, not bypassed.
- The sampling seed is drawn crypto-random per run and NEVER persisted before use; an explicit
  seed is accepted only from the superadmin `_check` route (test determinism).
- Divergence evidence (capped expected/actual excerpts) is persisted in the verdict at
  detection time, and journaled by the reindex action BEFORE the reindex runs: the repair
  destroys the live divergence, the journal entry survives.
- Pending projection states (`_needsIndexing`, `_partialRestStatus`, non-finalized, missing
  alias) downgrade the index verdict to `unknown` — never a false breach; re-checked after a
  divergence is found (line writes do not hold the worker lock).
- `_rand` is the only excluded compare key (index-time Math.random). `_file*` cannot occur:
  enrollment refuses attachment datasets.
- The file-side count check is hint-grade, not a proof: `dataset.count` is on the metadata hash
  denylist (`EXCLUDED_TOP_LEVEL`, indexer-churn field), so a Mongo-writing adversary can forge it
  alongside an ES tamper. The guarantee rests on the sampled windows / `?deep=true`, which
  re-derive rows from the verified file (file-hash-covered), not on the count compare.
- An ES doc with a missing/null/non-numeric `_i` is treated as an immediate divergence (kind
  `surplus`, keyed by ES `_id`), never joined: it cannot be ordered against the source. The
  sampled window query explicitly pulls `_i`-less docs (a `range: {_i: {gte}}` alone never matches
  them) — best-effort within the window `size`: a window already full of in-range docs can push an
  `_i`-less doc past the cut, but such a doc always inflates the ES count (caught every run) and
  `?deep=true` reports it deterministically. `deepCompare`/`compareWindowDocs` guard their span
  frontier with `Number.isFinite` so a stray non-finite `_i` can never collapse the span to NaN
  and empty a batch uncompared.

### Per-verdict freshness clock (closes the A1 residual limit, 2026-07-23)

- **`unknown`-pinning is bounded for every verdict, including `index`.** The index member is the
  only verdict that can be individually `unknown` while the overall check stays definitive
  (every other deferral downgrades the *whole* check, which `integrity.lastDefinitiveCheck`
  bounds; the trail verdict is binary). It therefore carries its own clock,
  `integrity.lastDefinitiveIndexCheck`: advanced only in the final `$set` alongside the overall
  clock and only when the index verdict is definitive (`ok`/`diverged`), seeded at enable and by
  the `seedDefinitive` net — so **`lastDefinitiveIndexCheck <= lastDefinitiveCheck` always
  holds**. The stale sweep's second query (`index` clock stale AND overall clock fresh — exactly
  the pinned-index shape; the conjunct is sound because of that ordering and prevents
  double-alerting) fires the same `integrity-check-stale` event under the distinct dedup key
  `index-check-stale`, cleared only on a definitive index pass — the two-sources-one-event
  pattern of `integrity-renewal-failed`. If you add a new verdict member that can be
  individually `unknown` while the overall check stays definitive, give it its own clock the
  same way. Design: `docs/plans/2026-07-23-integrity-per-verdict-freshness-design.md`.
