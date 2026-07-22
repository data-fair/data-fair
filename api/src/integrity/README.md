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

## Stamping discipline

4. **Every writer of covered content stamps** — directly, via `applyPatch`'s
   `coveredPatchKeys` gate, or via `stampHistorizeMany` for bulk propagation. An unstamped
   covered write is a false-breach generator; a stamped-but-uncovered write is churn. The
   **classification ratchet** (`tests/features/integrity/operations.unit.spec.ts`) forces a
   conscious decision for every new dataset-schema property.
5. **Lines: hint first, stamps second** (`_needsHistorizingLines` before per-line
   `_needsHistorizing`). The relay and the checker both carry nets for the orphaned-stamp
   race — if you touch the hint lifecycle, keep both nets.
6. **The extender never stamps** — and that is only sound because the columns it writes are
   exactly `extensionOwnedKeys()`, which is also the covered-body exclusion set. It is a
   single shared function (`lines-operations.ts`, used by `rest.ts` `writeExtendedStreams`);
   never reintroduce a second implementation.

## Locking

7. **Everything that anchors or checks a dataset holds the `datasets:‹id›` worker lock**
   (relay tasks via the worker loop; admin actions via `withDatasetLock`; the sweep via
   try-acquire). An unlocked anchorer can race another to the same LIST-derived index: the
   shadowed loser is later purged = permanent trail loss. New anchor writers must take the
   lock; new checker callers must either hold it or accept `unknown` downgrades.

## The store is the authority, Mongo is a hint

8. Every Mongo-resident integrity field (`integrity.active`, `lastCheck`, `lastRevision`,
   `trailAck`, `alerts`, the stamps) is writable by the in-scope adversary. Nothing
   guarantee-bearing may *terminate* on a Mongo read: each hint has a store-side backstop
   (scope audit for `active`, realert cadence for alert dedup, store heal for
   `lastRevision`, locked-body fingerprints for `trailAck`). If you add state, decide its
   backstop.
9. **The trail must stay verifiable from LIST alone**: dataset revisions are keyed by
   zero-padded index, line revisions by padded `_i` with the content hash in the key. No
   Mongo mapping may become necessary to order or interpret the trail. This is also why
   `anchorLine` refuses out-of-range `_i` (padding overflow breaks key ordering).
10. **The purge deletes only what the store itself proves lapsed** (real
    `ObjectLockRetainUntilDate`, skew margin, protected current-anchor carve-out) and
    **reports** the delete markers it reclaims (attacker artifacts) instead of silently
    sweeping them.

## Verdicts and alerts

11. **Fail toward `unknown`, never toward a false verdict** — pending stamps, mid-check
    writes, terminal-residue latest: all downgrade to `unknown`. That posture is only safe
    because `unknown` cannot silently accumulate (`integrity-check-stale`); if you add a new
    deferral path, make sure the stale clock still covers it.
12. **Renewal only on a fully clean pass** (data ok AND trail ok): `PutObjectRetention` is
    keyed without a version id — under a shadow attack it would extend the attacker's
    current version while the original's lock runs out.
13. **Remediations always leave their own revision** (`force: true` on restore/fix/ack/
    terminal writes; terminal revisions and acks are never dedupe targets). A fix that can
    silently vanish from the trail is not a fix.
14. **Nothing personal enters the WORM store** — actor *categories* only (`RevisionOrigin`),
    covered projections with identity fields excluded. The store is undeletable; a leaked
    identity in it is a GDPR incident by construction.

## Testing

The adversarial suites in `tests/features/integrity/` (`trail.api.spec.ts` especially)
encode the attack scenarios these invariants defend against — shadow versions, delete
markers, alarm-kill flips, forged stamps and `_i` inflation, alert suppression. When you
change behavior around an invariant, extend those suites with the attack you are defending
against, not only the happy path.
