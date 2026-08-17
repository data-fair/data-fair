# Integrity — trail coherence & store authority (security round 3) — design

> Status: **✅ DELIVERED (2026-07-22)** — implementation plan:
> [2026-07-22-integrity-trail-coherence-plan.md](./2026-07-22-integrity-trail-coherence-plan.md).
> Successor to the two pre-release hardening rounds on `feat-integrity6` (follow-ups plan of
> 2026-07-21, hardening commits of 2026-07-22). The last security round before first client
> release. S4's mechanism was amended at plan time (`_i` is time-derived, not a counter — see
> §S4); everything else shipped as designed.

## 0. The gap class: the store is the root of trust, Mongo is a hint

Every prior round verified the mechanics *inside* the design's frame. A review question
("what prevents a breached admin from corrupting the revisions?") stepped outside it and
exposed a class of gap: **guarantee-bearing decisions are taken from inputs the in-scope
adversary can write to.**

Two adversary positions matter:

- **The stated adversary (§1 of the architecture doc): a tenant admin with out-of-band
  hot-store access** — raw Mongo and file-storage writes, no integrity-bucket credentials.
  Today this adversary can: disarm protection (`integrity.active: false` raw write — the
  sweep worklist, and worse the purge's current-anchor carve-out, read Mongo, so our own
  purge eventually destroys the evidence); suppress the breach alert (the notification's
  transition gate reads the Mongo-resident `lastCheck.status`, so pre-writing `'breach'`
  silences it); park a dataset in eternal silent `unknown`; and wedge `_fix`'s line bless
  by inflating a line's `_i` beyond the transaction sequence.
- **A stronger, unstated adversary: stolen integrity-store credentials.** Compliance lock
  guarantees the original *versions* survive — but it does not prevent PUT-ing a new
  current version onto an existing key (shadowing), adding delete markers (hiding keys
  from `ListObjectsV2`), or writing fake keys. The checker reads only the current view
  (`ListObjectsV2` + plain `GET`), so this adversary can make every comparison run against
  content of their choosing. The evidence of tampering is *always present* in the version
  stacks and the provider-controlled `LastModified` dates — nothing looks at it.

One principle fixes the whole class: **derive the protection worklist and every verdict
from the store; treat Mongo state as a hint that the store cross-checks.** The round has
five parts, S1–S5, plus surface/config (S6), non-changes (S7) and build order (S8).

This deliberately does NOT re-open §13's rejection of hash chaining: the trust root stays
compliance-locked versions plus unforgeable provider metadata. No cryptography is added;
we start *reading* evidence the store already holds.

## S1 — The trail-coherence verdict (second check result)

`checkDataset` gains a second, independent verdict alongside the data-vs-anchor one:

```
integrity.lastCheck: {
  status: 'ok' | 'breach' | 'unknown',        // verdict 1: hot state vs latest anchor
  breach?: ('file'|'metadata'|'lines')[],
  lines?: { checked, diverged, sample },
  trail: {                                     // verdict 2: the trail itself is unaltered
    status: 'ok' | 'altered',
    anomalies?: Array<{ kind, key, detail?, confidence: 'confirmed' | 'suspect' }>
  }
}
```

Verdict 1 answers "does the data match the last verified state"; verdict 2 answers "is
the revision trail itself the one we wrote". They fail independently: a shadowed revision
can make verdict 1 pass while verdict 2 screams.

**Source: one versions walk.** The per-dataset check switches its store reads from
`ListObjectsV2` to the versions walk (`iterateVersionPages`, extended to expose `etag`;
`size` was added in round 2). One walk feeds both verdicts: the lines fold and latest-key
selection consume the *reconstructed* current view (latest non-marker version per key), so
marker-hidden keys resurface instead of silently vanishing from the compare. Cost: a
versions listing returns the same ≤1000 entries/page; the noncurrent tail is small by
construction (crash-retry duplicates only), so page count is ≈ today's.

**Anomaly classes** (each `confirmed` unless noted):

1. **`delete-marker`** — any delete marker under the dataset scope. No code path of ours
   issues a versionless DELETE (the relay/purge always target a versionId), so a marker is
   attacker-made by definition.
2. **`version-divergence`** — a key with >1 non-marker version whose versions differ in
   size or ETag. Legitimate multiplicity exists (crash-retry re-PUTs) but is byte-identical:
   revision JSONs are single PUTs (ETag = body md5), payloads are multipart with fixed
   chunking (ETag = md5-of-part-md5s, deterministic for identical bytes). Differing ETag ⇒
   differing bytes ⇒ a rewrite. For revision JSONs the checker additionally GETs and diffs
   the divergent versions to name what changed (`detail`); payload bytes are not downloaded.
3. **`date-skew`** (`suspect`) — a revision JSON whose `context.date` is further than
   `config.integrity.trail.dateSkewHours` (default 48) from its version's provider
   `LastModified`. Tolerance covers relay retry lag (S3 outages delay the write, never the
   stamp). Nightly this is checked **incrementally**: the latest revision (already GET-ed)
   plus any revision newer than the previous trail check; the admin `_check` accepts
   `?deep=true` to walk and date-verify the full window on demand.
4. **`sequence-gap`** (`suspect`) — a missing index *inside* the dataset-level sequence
   (tail truncation by the purge is normal; a mid-sequence hole is not — locks lapse in
   write order, so the purge cannot create one).

**Verdict semantics.** Any `confirmed` anomaly ⇒ `trail.status: 'altered'` + a new
`integrity-trail-altered` event; `suspect`-only ⇒ still `altered` but the event body says
review-needed. `_fix` does **not** touch trail anomalies — they are store-level facts about
undeletable versions, not hot-state divergence; blessing data cannot un-shadow a key.

**Acknowledgement is trail-recorded.** After investigation (rotate credentials, conclude
retry artifact, …) a superadmin runs `POST …/_integrity/trail/_ack { reason }`: it writes a
first-class `ackTrail` revision whose payload carries the **fingerprints** of the anomalies
being acked (kind + key + versionIds). The checker reports only anomalies not covered by
the latest ack. The ack is thus itself undeletable, reasoned, and auditable — no mutable
"dismissed" flag in Mongo that the adversary could set preemptively.

## S2 — Terminal trail revisions + the daily scope audit (alarm-kill fix)

**Disable and delete become trail-recorded operations.**

- `disableIntegrity` writes a final **`disable` revision** (operation `disable`, origin
  `superadmin`, optional `reason`, `force: true`) **before** flipping Mongo. It re-records
  the current hash pair, is payload-less, and ages out with the tail like any revision.
- Dataset **deletion** of an enrolled dataset writes a final **`delete` revision** the same
  way (from the dataset delete path). This completes §3.5's story: the trail no longer
  "simply stops" — it ends with a signed-off terminal revision.
- **Ordering inversion, justified.** These two writes deliberately invert §3.2's
  hot-first rule (revision first, Mongo second): the failure mode of Mongo-first is a
  crash that leaves exactly the alarm-kill signature (inactive dataset, no terminal
  revision — indistinguishable from the attack). The failure mode of revision-first is
  benign and self-healing: an active dataset whose latest revision is `disable` is
  re-anchored by the next check/organic write (the terminal revision carries the current
  hashes, so nothing false-breaches meanwhile).
- Re-enable semantics are unchanged: the sequence continues past the terminal revision
  (`nextIndex` is max+1 regardless of operation kind).

**The daily scope audit.** The nightly pass already enumerates every dataset scope from
the store (purge + storage measure). A new `auditScopes` step classifies each scope by
joining store truth against the Mongo hint:

| Store says | Mongo says | Verdict |
|---|---|---|
| latest is a live anchor, lock unexpired | `integrity.active: true` | ok |
| latest is `disable` / `delete` | inactive / missing | ok — aging out |
| latest is a live anchor, lock unexpired | inactive / missing | **`integrity-scope-incoherent` event** — out-of-band disable/delete |
| anything | active, but scope missing | already covered (checkDataset's no-anchor `unknown`) |

The audit also folds in what the purge learns: markers the purge reclaims are counted per
scope and reported through the same event (an attacker artifact must never be *silently*
swept — today `purge` deletes markers as anonymous garbage, which destroys the anomaly
before S1's per-dataset check might see it; with the audit the reclaim itself reports).

## S3 — Alert robustness

- **Persistent-state re-alert.** All four "bad state" events — `integrity-breach`,
  `integrity-trail-altered`, `integrity-renewal-failed`, `integrity-scope-incoherent` —
  keep their ok→bad transition trigger and gain a periodic re-fire while the state
  persists: every `config.integrity.realertDays` (default 7). This bounds the round-2
  transition-gate weakness (the gate reads Mongo, so pre-writing the bad state suppressed
  the alert *forever*; now suppression requires rewriting the dedup field every window,
  and S2's audit is the store-side backstop for the disarm case).
- **`integrity-check-stale`.** A dataset that is `integrity.active` but has produced no
  *definitive* verdict (ok or breach) for `config.integrity.maxUnknownDays` (default 7) —
  wedged stamps, stuck pipeline, lock contention, S3 outage, or an adversary keeping flags
  set — fires this event, same realert cadence. `checkDataset` persists a
  `lastCheck.definitiveDate` on ok/breach to drive it; enable seeds it so a never-checked
  enrollment also trips after N days.

**Honesty note (goes into the doc, §S5):** the re-alert dedup timestamps are themselves
Mongo-resident. This is accepted: sustained suppression now requires sustained active
rewriting, the store-side audit (S2) is immune to it, and moving dedup state into the
events service was rejected (S7).

## S4 — Remediation robustness: the `_i` inflation wedge

An adversary who sets a line's `_i` (and a stamp) beyond the dataset's transaction
sequence wedges `_fix`: the bless rewrites through the pipeline, which mints an `_i`
*below* the forged anchor's, so the fresh anchor never outranks the stale one and the
dataset can never converge to `ok` — a denial-of-remediation.

**Requirement:** after `_fix`, every blessed line's fresh anchor index is strictly greater
than its stale anchor's, and the Mongo line's `_i` equals the anchored index (the checker
compares both content hash and `_i`).

**Mechanism (amended at plan time):** `_i` is time-derived (`_updatedAt − createdAt`
scaled, `getLineIndice`), not a stored counter — there is no sequence to advance. Instead:

- **Pre-guard:** `anchorLine` refuses an `_i` that does not fit the 16-digit key padding
  (≥ 10^16) — a wider number breaks the lexical==numeric key ordering for that line's
  whole sequence. The stamp is left in place, so the line shows as pending and the S3
  `integrity-check-stale` alert surfaces the wedge instead of a corrupted trail.
- **Post-bless correction in `_fix`:** after the bless rewrite and drain, re-compare; a
  line still diverged because its fresh time-based `_i` did not outrank the forged
  anchor's index gets an explicit correction — `_i = staleAnchor.i + 1` (advanced past
  duplicate-key collisions), `_hash` invalidated, stamped in the same single-document
  write — then a final drain and the fresh verdict. Deterministic convergence, bounded to
  the adversarial case.

Test recipe: forge an inflated `_i` + content edit via test-env, assert `_fix` returns
`ok` and the line's anchor/`_i` agree; forge a ≥10^16 `_i` and assert the relay refuses
while the stamp stays pending.

## S5 — Threat-model honesty (architecture-doc changes)

§1 is updated to state plainly:

- **The first-write lie extends to any actor with raw Mongo write access.** The outbox
  stamp lives in the same Mongo the adversary writes; a tamper that also sets
  `_needsHistorizing` is anchored by the relay as an ordinary `update`/`worker` revision —
  self-laundered. The trail still timestamps it; the catch is the **trail-vs-journal
  review** §1 already prescribes (a trail revision with no matching journal event), now
  stated as the *only* catch for this adversary, not a nice-to-have.
- **Mongo-resident integrity state is a hint, not authority** — with the explicit list
  (`integrity.active`, `lastCheck`, `lastRevision`, renewal fields, flags, alert-dedup
  dates) and, for each, which store-side mechanism backstops it (S1 verdicts, S2 audit,
  S3 realert, round-2 mirror heal).
- What the trail check upgrades: tamper-evidence now holds against **anyone who cannot
  destroy locked versions** — including stolen integrity-store credentials — because
  hiding or shadowing is itself detectable from version stacks and provider dates.
- Remaining accepted limits, restated: first-write lie (above), operator/provider
  collusion (§13 unchanged), and the retention window as the horizon of everything.

## S6 — Config, API, UI, events

- **Config** (+ env wiring + type schema): `integrity.trail.dateSkewHours` (48),
  `integrity.realertDays` (7), `integrity.maxUnknownDays` (7).
- **API:** `lastCheck.trail` in `GET …/_integrity` and embedded responses (same
  `readIntegrity` scoping and `clean()` strip); `POST …/_integrity/_check?deep=true`;
  `POST …/_integrity/trail/_ack { reason }` (superadmin, synchronous, returns the fresh
  trail verdict). All under the round-2 per-dataset lock.
- **UI (minimal):** the integrity panel shows the trail verdict as a second status row;
  `altered` renders the anomaly list (kind, key, detail, confidence) and, in admin mode,
  the ack action with its consequence-stating confirm dialog + reason field (reason is
  trail-recorded, same rule as fix/restore). The list breach badge treats
  `trail.status: 'altered'` like a breach.
- **Events/i18n (en+fr):** `integrity-trail-altered`, `integrity-scope-incoherent`,
  `integrity-check-stale`.

## S7 — What deliberately does NOT change

- **No hash chaining / signatures** — §13 stands; this round reads existing evidence.
- **No events-service query for alert dedup** — cross-service coupling for a weakness
  already bounded by realert + the scope audit; recorded as accepted (S3 honesty note).
- **No nightly payload re-hash.** ETag (md5-based, deterministic chunking) suffices to
  detect payload version rewrites without downloading bytes. Deep content verification of
  the *current* payload against `hash.file` stays available implicitly via restore/diff.
- **Worklist stays Mongo-driven for active datasets** — the sweep still queries
  `integrity.active: true` (cheap, indexed); the store-side scope audit is the backstop
  that makes the hint safe, not a replacement for it.
- **Mid-check write handling** stays "downgrade to unknown" (round 2) — S3's stale alert
  now bounds how long the unknowns can silently accumulate.

## S8 — Order of work

Each step test-commit → impl-commit (repo protocol; dev env started by the maintainer).

1. **T1 — store & pure ops.** `etag` in `iterateVersionPages`; pure trail fold
   (`operations.ts` / `lines-operations.ts`): reconstruct current view from versions,
   classify anomalies, fingerprint + ack filtering. The unit-test surface.
2. **T2 — trail verdict.** `checkDataset` switches to the versions walk, emits
   `lastCheck.trail`, incremental date-skew, `deep` variant; config + event + i18n.
3. **T3 — terminal revisions + scope audit.** `disable`/`delete` revisions
   (revision-first ordering); `auditScopes` riding the nightly pass; purge marker
   reporting; `integrity-scope-incoherent`.
4. **T4 — alert robustness.** Realert cadence for the four events; `definitiveDate` +
   `integrity-check-stale`.
5. **T5 — ack.** `trail/_ack` route + service + UI panel additions.
6. **T6 — `_i` wedge.** Sequence-advance in `_fix` + adversarial test.
7. **T7 — docs.** §1 threat-model rewrite (S5), §3.3/§3.5 updates, this design linked.

Open points for review before the plan doc: the three config defaults (48 h / 7 d / 7 d);
whether `deep` trail verification also gets an automated slow cadence (recommendation:
manual-only in v1); whether the `delete` terminal revision should carry a denormalized
dataset descriptor for post-mortem identification (recommendation: yes, it already does —
`dataset: { id, slug }` is in every revision).
