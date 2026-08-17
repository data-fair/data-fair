# Integrity — level 3 dataset lock (assessment notes)

> Status: **assessed, not designed — not scheduled for the current iteration.** Discussion
> 2026-07-23 revisiting level 3 (prevention), which architecture §2 had parked as "a separate
> feature, not built on this store". The assessment reverses that: a lock worth building **is**
> built on this store — as trail revisions — and its honest name is a **tamper-evident freeze**,
> not prevention. Read `docs/architecture/integrity.md` §1 (threat model, first-write lie) and
> §3.5 (store authority) before turning this into a design.
>
> **Scope addition (target 8 / A2, merged 2026-07-23):** the **apiKey-only write lock** — the
> second half of the original A2 sketch — was extracted from the attribution iteration (#520)
> into this plan, so both lock surfaces get designed together (architecture §12 decided
> record). It remains labeled **process discipline**, not guarantee (see §4 below); the
> attribution half (`.who` siblings, `who.apiKey.id` capture) shipped with #520.

## Verdict

The idea is **not meaningless, but its value lives somewhere different from where the original
proposal puts it**. The prize is not preventing writes (that ceiling is unreachable — see below);
it is that a lock **mechanically closes the first-write-lie / self-laundering hole** that §1
accepts as the design's main residual limit, for locked datasets. And once that is seen, the
strong/weak knob mostly collapses: within the stated threat model, a reversible lock delivers
almost everything an irreversible one does, without its operational hazards.

**Recommendation:** build the **reversible, store-authoritative lock** as the whole product;
keep "permanent" at most as a recorded intent flag inside the lock revision (unlock still
honored, but loudly and permanently annotated), or drop it; leave **partial locks out of the
integrity surface entirely** (they are permissions/process features — A2's `apiKey-only` write
lock is the honest version, already labeled "process discipline").

## 1. The ceiling: level 3 can never be "prevention"

The hot data lives in Mongo and the mutable file store. No lock, wherever stored, physically
prevents a raw-Mongo write — enforcement is always application code, which the in-scope
adversary bypasses by definition. The honest maximum for level 3 is therefore:

- **in-band refusal** — every instrumented write path refuses while locked (policy, not
  guarantee), plus
- **out-of-band changes leave a permanent, undeletable mark** — which levels 1–2 already give.

That sounds like "level 3 adds nothing", but it doesn't, because of the laundering hole: today
an adversary who tampers Mongo *and forges the outbox stamp* is anchored by the relay as an
ordinary `update` revision — the trail itself is fooled, and the only catch is the human
trail-vs-journal review. **After a lock there are no legitimate writes, so any post-lock
revision is automatically a breach verdict.** The lock converts the design's weakest detection
path (manual review) into a mechanical one. That is a genuine guarantee upgrade — but it must be
sold as a *tamper-evident freeze*, never as "un-modifiable", or it violates the "the verdict
never claims more than the snapshot protects" principle (§5).

## 2. Where the lock lives: the store — but the knob is checker policy, not storage location

A Mongo-only lock is disarmed by the very adversary it targets ("Mongo is a hint; the store is
the authority"). Both lock strengths belong in the store, as **first-class trail revisions**
(`operation: lock/unlock`, with `reason`). The Mongo property is only the fast-path mirror for
the write wrappers, cross-checked by the checker exactly like `integrity.active` is by the
scope audit.

The strong/weak distinction is then **checker policy** — does the checker honor a subsequent
`unlock` revision (weak/reversible) or treat even that as a breach (strong/permanent)? Two
details keep this clean:

- The mode (`permanent` vs `reversible`) is recorded **inside the lock revision itself**, so it
  is compliance-locked — nobody can retroactively downgrade a permanent lock to a reversible one.
- The relay must **never write lock/unlock operations from outbox stamps** — those operations
  are only mintable by the synchronous superadmin route (like `_fix`). Otherwise a forged stamp
  with `context: {operation: 'unlock', origin: 'superadmin'}` re-opens the laundering hole
  through the relay itself.

Enforcement falls out almost for free: **"locked" = the write wrapper refuses any write that
would stamp `_needsHistorizing`**. The covered/denylist boundary already maintained *is* the
lock boundary — worker bookkeeping, `readApiKey` rotation, extension churn all stay legal
because they are uncovered content.

## 3. Strong ≈ weak within the threat model

The adversary is a tenant admin, who cannot call the superadmin unlock route in either mode —
so against the stated adversary, **the reversible lock is exactly as strong as the permanent
one**. Permanent mode only adds protection against *our own superadmin/operator* unlocking —
but "quietly" is already impossible in weak mode: the unlock is a WORM'd, reasoned,
forever-auditable revision, and an auditor reading the trail sees the freeze window and which
actor category broke it. Permanent mode upgrades "operator can do it visibly" to "operator
can't do it at all" — and operator collusion is explicitly outside the threat model (§13, same
reason revision signing was rejected).

Meanwhile permanent mode has real costs:

- **Platform upgrades.** Upgrade scripts legitimately touch covered metadata
  (`origin: upgrade`). A routine migration would permanently scar every strongly-locked
  dataset. Exempting the `upgrade` origin re-opens laundering (origins are claimed, not
  proven); accepting scars-plus-ack revisions dilutes "permanent breach" into "ackable breach"
  — at which point the weak lock has been rebuilt with worse ergonomics.
- **GDPR rectification.** Wrong personal data in a locked dataset that a subject demands
  corrected: writing is a legal obligation. "Break the integrity check" as the escape hatch
  makes the legal-compliance path indistinguishable from an attack.
- **Deletion.** If the strong lock forbids deletion, the dataset is undeletable and §8's
  wait-out erasure promise breaks at the org level. If it allows superadmin deletion (with the
  terminal-revision scar), "truly locked" already has a superadmin escape — the same trust as
  weak mode.
- **The irreversibility is operational, not intrinsic.** It holds only while the sliding
  renewal keeps running; a renewal outage plus one retention window and the lock revision
  itself becomes destroyable. Already alerted (`integrity-renewal-failed`), but it means even
  the strong lock's "forever" is "as long as we operate it correctly" — one more reason not to
  over-claim.

The achievable, honest guarantee statement: **"while frozen, any change by anyone, through any
path, becomes a permanent breach record; unfreezing is itself a permanent audited event."**

## 4. Partial locks: cut from the integrity surface

"Only processing X may write" fails the test that makes the full lock valuable. The full lock's
power is *zero ambiguity*: any revision after lock is illegitimate, no attribution needed. A
partial lock reintroduces the ambiguity — the checker must decide whether a revision came from
the allowed writer, but revision `origin` is a claimed category, not a proof (and deliberately
carries no identity, §1's trail/journal split). A forged stamp claiming `origin: worker` is
indistinguishable from the legitimate processing, so a partial lock detects nothing the current
system doesn't and prevents nothing a raw-Mongo adversary cares about. What remains is
app-layer authz, which the permissions system already provides. A2's API-key-only write lock is
the honest version of this idea, correctly framed as process discipline, not guarantee — and
since #520 extracted it into this plan (status note above), the future design covers both
surfaces: the guarantee-bearing freeze, and the apiKey-only lock as its clearly-separated
process-discipline sibling (now strengthened by `.who` attribution: every legitimate write under
that lock resolves to a revocable key id for the `.who` retention window).

## 5. Loose ends for a future design

- **Lock preconditions.** Lock should be a synchronous superadmin action requiring a drained
  outbox and a fresh `ok` verdict inline before writing the lock revision — freezing an
  `unknown` or breached state is meaningless.
- **Store-credentialed residual.** An adversary with stolen bucket keys could *append* a
  plausible `unlock` revision (appending isn't destroying, so trail coherence won't flag it).
  Cheap hardening: the checker honors an unlock only when a matching journal event exists — a
  two-channel check where forging both requires Mongo *and* bucket credentials. State as a
  residual limit either way.
- **Interaction with `_fix` / restore / ack.** Presumably all refused while locked (they are
  writes), except the flows that *resolve a breach on a locked dataset* — restore-to-anchor is
  arguably the one write a lock should permit, since it converges toward the frozen state.
- **Scope.** Lock requires integrity active; all §5 enrollment refusals apply unchanged.
