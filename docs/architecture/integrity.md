# Data integrity & traceability

> Status: **delivered end to end** — files + metadata (one **joint anchor** per dataset: one
> revision sequence carrying both SHA-256 hashes, one verdict, one surface), editable-dataset
> lines (**per-line locked revision sequences**, gated ~100k live lines, opt-in per dataset),
> level 2 (full payloads: diff, audit download, restore-from-any-revision) everywhere, the
> **trail-coherence & store-authority hardening** (second verdict, terminal revisions, scope
> audit, realerts — 2026-07-22), and the **ES index consistency verdict** (A1, third verdict
> member `'index'` — count + seeded sampled windows nightly, exhaustive on demand, through the
> alias, both dataset families — 2026-07-22). Coverage limits are **enrollment refusals, not caveats**: a
> verdict never claims more than the snapshot protects (§5). Delivery history and decision
> records live in the `docs/plans/2026-07-*-integrity-*` design docs; what remains
> deliberately out (applications/settings metadata, attachment bytes, above-gate fold,
> generalization, log posture, central service) is in [§10](#10-delivery-state--what-remains)
> and [§14](#14-deferred-scope--future-directions). A client-facing presentation (fr) lives in
> [docs/presentation-integrite-fr/](../presentation-integrite-fr/01-introduction.md); the
> code-level invariants in [api/src/integrity/README.md](../../api/src/integrity/README.md).

## 1. Motivation

Clients have asked for data-integrity management. One reference client classifies the
requirement into three levels, which we adopt as the spine of this design:

1. **Detection** — know when a resource has been altered outside the legitimate write path.
2. **Repair** — restore a resource to its last verified state.
3. **Prevention** — make a resource un-modifiable, even by a client admin.

Historically we resisted exhaustive historization (data-model complexity, an
ever-growing database). That position is worth revisiting now that S3 offers **cheap cold
flat storage with strong, lock-based versioning that even an admin cannot contradict**
(object-lock in *compliance* mode). The locked S3 store, not the database, carries the
historization burden — which removes the original objection.

**Guarantee scope (threat model).** The adversary is a **client/tenant admin** — and, thanks
to compliance mode, even our own operators as far as *deletion* goes: once written, a revision
**cannot be altered or deleted** before retention expiry by anyone, including the account owner.
What the store does **not** prevent is a **first-write lie** — and this extends further than
"whoever controls the legitimate write path": the transactional-outbox stamp lives in the same
Mongo the tenant-admin adversary writes to, so **a raw-Mongo tamper that also forges the stamp is
anchored by the relay as an ordinary `update`/`worker` revision — self-laundered into the trail.**
The trail still timestamps it; the catch is the **trail-vs-journal review** (a trail revision with
no matching journal event), which is therefore not a nice-to-have but the *only* detection for a
stamp-forging adversary. We accept this deliberately: the value is a **transparent, append-only,
auditable trail** in which a bad or out-of-band write always leaves a mark, and rolling back to an
earlier verified revision is always possible — *detection + audit + repair*, not cryptographic
non-repudiation. This scoping is exactly why per-revision hash-chaining and signatures are out of
scope (§13).

**Mongo is a hint; the store is the authority (round 3).** Every Mongo-resident integrity field is
writable by the in-scope adversary, so nothing guarantee-bearing may *terminate* on it — each hint
has a store-side backstop: `integrity.active` (sweep worklist, purge carve-out) is cross-checked by
the daily **scope audit** against terminal trail revisions (§3.5); `lastCheck`/alert-dedup dates are
bounded by the **periodic re-alert** cadence (§3.3); `lastRevision` is healed from the store when
lost; `trailAck` is a pointer whose authority is the locked ackTrail revision body it points at
(§3.3); and the check itself gains a second verdict — **trail coherence** — computed from the
store's version stacks and provider dates, which a **store-credentialed** adversary (stolen bucket
keys) cannot forge: shadowing a revision or hiding keys behind delete markers is detectable because
the original versions are undeletable and `LastModified` is provider-stamped. The guarantee is thus tamper-evidence against **anyone who cannot destroy locked versions**,
with the first-write lie (above) and operator/provider collusion (§13) as the stated residual
limits.

**Trail vs. sibling vs. journal — three tiers, one for each lifetime.** A revision's context
names the **category** of legitimate write (`operation` + an actor category `origin` —
`user | superadmin | worker | propagation | upgrade`), never a user identity. The reason is that
a revision is an **undeletable, compliance-locked object**: a `user:‹id›` copied into it is
personal data (pseudonymized ≠ anonymized) that a user-erasure request could no longer reach while
the dataset lives on — §8's wait-out only covers *dataset* deletion, and the anchor's own lock
*slides forward indefinitely* while the resource is live (§3.4), so an identity embedded there would
be undeletable for as long as the dataset exists, not merely for one retention window. **Bounded
identity now lives in a separate, short-lived sibling** (`.who`, target 8 / A2, §3.1): the same
compliance lock backs it, but its own retain-until is fixed at write time and **never renewed**
(§3.4), so it ages out and is purged (§3.5) on its own short clock
(`integrity.attribution.retentionDays`, default 180) regardless of how long the anchor it sits
beside keeps sliding. This is deliberately a *third* tier, distinct from both ends: it is
tamper-proof (unlike the journal) but time-bounded (unlike the anchor). **Identity-level
attribution beyond that window lives entirely in the mutable events/journal system**, which is
already anonymized when an identity is deleted; joining the trail to the journal by date answers
"*which* user" for the journal's own lifecycle (weaker — date-based, and **the join does not exist
for lines at all**, which is exactly why lines are covered by `.who` from the start), while the
locked trail answers "was this a legitimate *kind* of write" for as long as the anchor exists. This
keeps the WORM store's *undeletable* portion free of personal data by construction (§8) without
losing the forensic value — legitimacy review scans the revision list for unexpected
operation/origin combinations, which needs the write *category*, not the identity; when identity is
needed too, the `.who` sibling gives a tamper-proof answer for 180 days, no join required.

## 2. Core model: one mechanism, three levels

There is **a single underlying mechanism**, parameterized by *level*. Levels 1 and 2 share
the same machinery; they differ only in what each revision stores.

- **Level 1 — Detection.** Every legitimate write records, in a locked S3 store, a
  **hash + traceability context** (operation, actor *category*, timestamp, optional reason —
  no user identity, see §1's trail/journal split). An integrity
  check recomputes the hot resource's hash and compares it to the latest stored hash; any
  divergence means something wrote out-of-band → breach. Cheap. **Baseline goal for every
  sensitive resource.**
- **Level 2 — Repair.** ✅ **Delivered for file datasets.** The same revision additionally
  stores the **full payload** alongside the hash. This unlocks the admin-facing diff *and*
  restore-from-**any** historized revision (not just the latest). **Always-on, no size
  gate** — the maintainer's call: storage cost is proportional to the file size and already
  metered into the owner's existing storage consumption (§9), so there is no threshold below
  which level 2 is skipped.
- **Level 3 — Prevention.** **Out of scope** here, but assessed (2026-07-23) and — reversing
  the earlier "separate feature" note — it **would** be built on this store: a superadmin
  **freeze** recorded as a locked trail revision, honestly named a *tamper-evident freeze*
  rather than prevention (the hot stores stay mutable; app code is the only enforcement). Its
  real value is mechanical: while frozen there are no legitimate writes, so **any** post-lock
  revision is automatically a breach — closing §1's self-laundering first-write lie for frozen
  datasets. See §14 and
  [2026-07-23-integrity-level3-lock-notes.md](../plans/2026-07-23-integrity-level3-lock-notes.md).

Priority: **level 1 everywhere it makes sense first**, level 2 added afterward where
reasonable (it may never be reasonable for large editable datasets — see §5).

## 3. Foundational mechanism

### 3.1 The locked revision store

- A dedicated S3 bucket with **versioning enabled** and **object-lock in compliance mode**,
  with a **default bucket-level retention** so the writer need not set retention per object.
- A **revision** object is `{ hash, context, dataset, [payload] }` where:
  - `hash` — `{ file?, metadata }`: the sha256 of the stored file's bytes (absent for
    non-file datasets) and the sha256 of the covered metadata (§5). Both are SHA-256 — md5 was
    dropped before first release because the payload reference dedupe keys off the file hash,
    making it storage-load-bearing: under the adversarial-tenant threat model a chosen-prefix
    md5 collision would collapse two file versions onto one locked payload. A dataset has
    **one joint anchor**, so both hashes are recorded on **every** revision; the breach verdict
    names which part diverged (file / metadata) by comparing each half against the latest
    anchor's pair.
  - `context` — `{ operation, origin, date, reason? }`: the operation type, the actor
    **category** (`origin`: `user | superadmin | worker | propagation | upgrade`), a timestamp,
    and an optional free-text reason (on `fixIntegrity` only). It carries **no user identity**
    by construction (§1's three-tier split), so it holds no personal data — see §8. Bounded
    identity, when captured, lives beside it in the `.who` sibling below, not here.
  - `dataset` — `{ id, slug }`, a small denormalized descriptor of the anchored dataset.
  - `payload` — present only at level 2: `{ metadata: <covered projection>, file?: { size, i? } }`.
    `metadata` is the **full** `coveredMetadata()` projection (not merely its hash), stored so it
    can be diffed and restored field-by-field; `file`, present when the anchor covers a file
    dataset, records the payload's byte `size` and an optional reference index `i`. The file's
    actual bytes are **not** inlined in this JSON — they live in a **sibling** locked object at
    `‹revisionKey›.file` (the `PAYLOAD_SUFFIX`), under the **same** compliance lock and retain-until
    date as the revision JSON, **written payload-first**: the relay uploads the `.file` object before
    writing the revision JSON that references it, so a crash in between leaves an orphan `.file` that
    ages out harmlessly — never a revision claiming a payload it doesn't have (the reverse order
    would risk exactly that).
  - **Payload reference dedupe (`file.i`) — one locked copy per distinct file version.** A locked
    file copy is stored **once per distinct file version**, not once per revision. When a new
    anchor's file bytes are **unchanged** from the latest anchor (a metadata-only edit, or a
    metadata-only restore that lands back on the same bytes), the relay does **not** upload a second
    copy: the new revision's `payload.file` carries `{ size, i }`, where `i` is the index of the
    revision whose `.file` object **owns** the bytes. An **absent `i` means "own index"** — the
    bytes live at this revision's own `‹i›.file` sibling (so already-written L2 revisions need no
    migration). References always **collapse to the bytes-owning revision — they never chain**: a
    reference resolves through the owner's `file.i` (or, absent, the latest revision's own index) in
    one hop. The `.file`-reading endpoints (`revisions/{i}/file`, the restore file re-ingest) and
    lock renewal all resolve `refIndex = file.i ?? i` before reading or extending the payload object.
    Every consumer of a prefix listing is **suffix-aware**: `nextIndex`, `latestKey`, the
    dedupe check, and the revisions endpoints all filter out `.file` keys before parsing an index,
    so a payload sibling is never mistaken for its own revision.
  - **The `.who` attribution sibling (target 8 / A2) — exactly parallel to `.file`, opposite
    lifetime.** `‹revisionKey›.who` (`WHO_SUFFIX`) carries `WhoBody`:
    `{ date, user?: { id }, apiKey?: { id }, ip?, geo?: { country?, asn?, asnOrg? } }` — session
    user id or API-key id (never both meaningfully — a write is authenticated one way or the
    other), `req.ip`, and coarse geo from trusted reverse-proxy headers (`X-Country`/`X-ASN`/
    `X-ASN-Org`; neutral fillers `XX`/`0`/`Unknown` are dropped rather than stored as false
    precision). No name, no email, ever (minimization, §8). Every field but `date` is optional; a
    worker/propagation revision typically has none, and then **no `.who` object is written at
    all** — no empty siblings. Written **who-first**, before the revision JSON (and before the
    `.file` payload too): the opposite ordering rationale from `.file` — a crash between the
    `.who` write and the revision write is recovered by retry-forward (the relay recomputes the
    same index and re-PUTs both), whereas the reverse order would lose attribution forever, since
    a retry after that crash dedupes against the already-landed revision and returns early,
    never reaching an unwritten `.who`. Locked with its **own, shorter, fixed** retain-until
    (`integrity.attribution.retentionDays`, default 180 — a separate config knob from the
    revision's own retention) computed **once at write time and never extended** — unlike `.file`,
    which slides with the anchor (§3.4/§3.5), `.who` is filtered out of every anchor set *before*
    renewal runs, so it ages out and is purged (§4.3-equivalent purge logic, §3.5) on its own
    clock regardless of how long the revision beside it stays protected. Never a dedupe target,
    never referenced by anything else, and **never load-bearing**: losing a `.who` (crash before
    write, early purge, the attribution kill switch `integrity.attribution.active: false`)
    degrades a revision to "unattributed" — exactly today's pre-attribution state — never a false
    verdict, a blocked restore, or a skipped renewal. Same suffix-awareness requirement as
    `.file`: `isSiblingKey`/`SIBLING_SUFFIXES` generalizes the filter so a `.who` key can never be
    mistaken for the revision it sits beside (§7 covers who reads it; §8 covers the GDPR posture
    in full).
- **Key layout (flat, id-keyed, one joint sequence per dataset):**
  `‹service›/‹owner.type›-‹owner.id›/‹resourceId›/‹i›` (zero-padded `‹i›`), plus the optional
  `‹i›.file` payload sibling and `‹i›.who` attribution sibling above. There is no
  `‹class›` segment — the file and metadata parts share a **single revision sequence** indexed
  from `0`, since they always enable, anchor and check together (per-class enable was never
  exposed). Zero-padding makes the keys sort lexically == numerically, so "latest" is the
  lexical-max **revision** key (siblings are filtered out first, §3.1 above), and the revisions
  endpoint pages by listing all keys under the dataset's
  prefix, sorting/slicing them in memory, then `GET`-ing only the requested page's items. The
  goal is to retrieve a dataset's history from its id, not to browse — minimal traversability is
  fine. The per-owner
  prefix makes storage accounting a simple prefix-size query (feeds storage accounting, §9) and
  enables per-owner access scoping (§7). One key **per revision** — not one key per resource with
  S3 native versioning as the history mechanism — is a deliberate choice, recorded in §13.
- Cold storage (e.g. Scaleway **Glacier**, which supports object-lock) is acceptable for the
  historized store, since it is not on the hot read path.
- Keys are **owner-scoped** (`‹owner.type›-‹owner.id›` segment). Owner transfer is
  **forbidden while integrity is active** (the transfer route returns 400): a transfer would
  orphan the anchor sequence under the old prefix. To transfer, a superadmin disables
  integrity (anchors age out at their existing retention), transfers, and re-enables — a
  deliberate simplification over re-anchoring under the new prefix.

### 3.2 The inline write wrapper — *this is the definition of a legitimate write*

The wrapper is not merely a mirroring mechanism: **it defines what a legitimate write is.**
Any mutation that does not pass through it is, *by design*, an integrity breach that the
periodic check is meant to surface.

- **The wrapper, not the raw handle.** A factory (e.g. `protectedCollection(name, { level })`)
  returns an object exposing only `insertOne` / `updateOne` / `deleteOne` / … . The raw Mongo
  collection handle is **not exposed**, turning "don't forget to use the wrapper" from discipline
  into something structurally hard to bypass.
- **Ordering is forced by immutability.** A compliance-locked revision can **never** be deleted
  before retention expiry, so the hot state must be committed **before** the locked revision is
  written — never the reverse (a reversed order risks a permanent, un-deletable revision
  describing a change that was rolled back). Every mechanism below respects this.

**Primary — transactional outbox (flag-on-the-document).** The cleanest way to honour that
ordering with no residual gap is to exploit the one transaction we do have (Mongo's): in a
**single-document** write, record the resource change **and** mark it pending historization via
an embedded outbox sub-doc, **`_needsHistorizing: { context? }`**. A stamp simply means
"**re-anchor this dataset**": there is no `classes` set — the joint anchor always covers both the
file and metadata hashes, so a writer that touches either (or both) stamps the same single flag.
The optional `context` is the traceability hint (`operation`, `origin`, `reason?`) the relay puts
on the revision; absent, the relay defaults to `operation: create|update`, `origin: worker`. A
background **relay** (`anchorDataset()`) then recomputes both hashes from the authoritative
sources (stored file bytes + fresh Mongo doc), dedupes against the latest anchor's hash pair,
writes the next revision `{ hash, context, dataset, payload? }` to the locked S3 store (§3.1),
updates the `integrity.lastRevision` hint and clears the flag — **retrying forward, never rolling
back**. The worker task's filter is the flag **settle-gated** to the stable states
(`status ∈ finalized|error`, no partial-rest pass, no pending extension) so the relay never
anchors an interim mid-pipeline state; the deferral is visible (`unknown` verdict while the stamp
is pending), and a dataset permanently stuck mid-pipeline defers anchoring until it recovers. The
write is atomic with no multi-document transaction, and the relay only ever acts on
already-committed state (ordering preserved).

**The outbox is only for *organic* writes.** The rare superadmin actions — `PUT _integrity`
(enable) and `POST _integrity/_fix` (reconcile) — **bypass the outbox and anchor inline** in the
request, calling the same `anchorDataset()` the relay uses (§3.3). The outbox/relay path remains
where async is genuinely needed: `applyPatch`, finalize, and the bulk propagation stamps (§5).

- data-fair already runs exactly this pattern for Mongo→ES projection — a `_needsIndexing` flag
  cleared by a worker (`commitLines`); `_needsHistorizing` reuses the same machinery.
- Unlike the passive change-stream mirror below, the outbox record is written *inside our own
  write path*, so it keeps full operation **context** — CDC's reliability without CDC's
  context-blindness.
- **Sharding (future-proof).** A single-document flag update is **inherently single-shard, atomic
  without a transaction, on any shard key**, so we adopt it everywhere rather than betting on
  today's unsharded topology. A *separate* outbox collection over a *sharded* resource collection
  would instead force a **cross-shard distributed transaction** (2PC) per write — not avoidable by
  "sharding the outbox in parallel," since Mongo gives **no cross-collection co-location
  guarantee** even under an identical shard key. A separate-collection outbox is acceptable only
  for collections we commit to never sharding.

### 3.3 The integrity check

- Recompute the hot resource's hash and compare to the latest revision's hash.
- **Two verdicts per check (round 3).** The check answers two independent questions: verdict 1
  (`lastCheck.status`) — does the hot state match the latest anchor; verdict 2
  (`lastCheck.trail`) — is the trail itself the one we wrote. Verdict 2 comes from **one
  versions walk** over the whole scope (which also feeds verdict 1: the current view is
  *reconstructed* from version stacks, so a marker-hidden line anchor resurfaces into the
  compare instead of silently vanishing). Anomaly classes: `delete-marker` (no code path of
  ours issues a versionless DELETE — always attacker-made), `version-divergence` (same-key
  versions differing in size/ETag; crash-retry duplicates are byte-identical, ETag is
  md5-deterministic even for fixed-chunking multipart), `date-skew` (`context.date` vs the
  provider-stamped `LastModified`, tolerance `integrity.trail.dateSkewHours`; verified
  incrementally past a trail cursor, `_check?deep=true` re-verifies the window), and
  `sequence-gap` (mid-sequence holes — the purge only ever truncates the tail's low end).
  Anomalies are filtered by the latest **ackTrail** revision's fingerprints (`POST
  …/_integrity/trail/_ack { reason }`, superadmin): the ack is itself a locked, reasoned
  revision carrying the fingerprints — the Mongo `trailAck` is only a pointer to it, and a
  fingerprint pins the exact version set, so any later tampering resurfaces despite the ack.
  `_fix` never clears trail anomalies (blessing data cannot un-shadow a key), and **renewal
  runs only on a fully clean pass** — under a shadow attack, `PutObjectRetention` (keyed, no
  version id) would extend the attacker's current version while the original's lock runs out.
- **Sliding scheduled checker:** data-fair runs a scheduled job that walks protected
  resources in batches and emits an alert on divergence through its normal alerting/events
  path. At scale we cannot check everything all the time, hence "sliding" coverage.
- **Alerting: entry + periodic re-fire (round 3).** The four bad-state events —
  `integrity-breach`, `integrity-trail-altered`, `integrity-renewal-failed`,
  `integrity-scope-incoherent` — alert on entry and re-fire every `integrity.realertDays`
  while the state persists; the dedup date (`integrity.alerts`) clears on recovery. The dedup
  state is Mongo-resident (accepted): pre-writing it suppresses at most one window, and the
  scope audit is immune. A dataset with no *definitive* verdict (ok/breach) for
  `integrity.maxUnknownDays` fires `integrity-check-stale` (`integrity.lastDefinitiveCheck`,
  seeded at enable) — the "downgrade to unknown" posture is only safe because unknowns cannot
  silently accumulate.
- **Admin-triggered single-resource check** reuses the same primitive on demand.
- **Everything that anchors or checks holds the per-dataset worker lock.** The relay tasks
  already run under the standard `datasets:‹id›` cross-pod lock; the synchronous admin actions
  (enable / disable / `_fix` / `_check` / both restores) and the nightly sweep acquire the **same
  lock** (bounded wait then `409` for the admin actions; skip-until-next-pass for the sweep).
  Without it, an inline admin anchor can race the relay to the same LIST-derived revision index —
  both PUT the same key, and the loser becomes a shadowed noncurrent version that the purge later
  reclaims (permanent trail loss). With it, a check can also never interleave with a relay drain.
  Organic API writes take no lock; a stamped write landing **during** a check is therefore still
  visible as a pending flag when the check ends, and a would-be breach verdict is downgraded to
  `unknown` instead of recorded/notified (the relay re-anchors and the next pass converges) — a
  check racing a legitimate write can produce a deferral, never a false alert.
- **Orphaned line stamps self-heal.** A line write racing the lines relay's final hint clear can
  leave per-line stamps with no dataset hint (the shape the task filter would never revisit). The
  relay re-sets the hint if a stamp slipped in behind its final scan, and the checker carries the
  same net: stamped lines found with no hint → hint re-set, verdict `unknown` — never a false
  'edited' breach.
- On a confirmed divergence: alert; show a **diff** (level 2 only — requires the stored
  payload); allow a superadmin `fixIntegrity` for legitimate-but-untracked edits. `POST
  _integrity/_fix` is **synchronous**: it re-anchors the current state inline
  (`anchorDataset()`), then runs `checkDataset()` and **responds with the fresh verdict** — the
  reconcile action completes on its own await, with no outbox stamp and no waiting for the next
  sweep.
- **Diff and restore (level 2, delivered).** `GET …/_integrity/revisions/{i}` returns the
  snapshot alongside the dataset's *current* covered projection in one call, so the UI renders
  the metadata diff without a second round-trip; `GET …/_integrity/revisions/{i}/file` streams
  the payload back with a `content-disposition` taken from the snapshot's `originalFile`. `POST
  _integrity/_restore { i, reason? }` writes back **any** payload-bearing revision (not only the
  latest) and always leaves its own auditable `restore` revision — dedupe is bypassed
  (`force: true`) so a remediation that lands back on a byte-identical state cannot silently
  vanish from the trail. Metadata-only restores (no file divergence) are **synchronous**, exactly
  like `_fix`: `restoreUpdate()` writes back only the covered keys that genuinely diverge from the
  snapshot, then the route re-anchors inline and responds with the fresh verdict. A **file**
  restore instead re-ingests the stored payload through the **standard draft pipeline** — the
  same path a manual file replacement takes — because replacing bytes must go through the usual
  validation/finalize flow, not a raw overwrite; the route responds `{ status: 'restoring' }`,
  refuses with 409 if the dataset isn't in a stable `finalized`/`error` state, and the `restore`
  context rides the draft's `_needsHistorizing` stamp through to `finalize`, which the async relay
  then anchors with `force: true` for the same reason.
- **Accepted transient-breach window on file restore.** Between the synchronous metadata write
  and the draft's validation landing at `finalize`, the hot doc reflects healed metadata over
  still-stale (or mid-reprocessing) file bytes; a sliding-checker pass or a manual check that lands
  in that narrow window can compare against the old anchor and record a transient breach — an
  accepted window, resolved once the anchor written at finalize supersedes it.
- Automatic re-push into the history is **not** done initially, but is possible by API.
- **No realtime channel.** The admin actions (enable / check / fix) are synchronous and their
  response carries the fresh state, so the panel updates on the action's own await — there is no
  websocket channel or subscription. Anchoring driven by *organic* writes (the async relay) and
  breach verdicts from the *nightly sweep* are not observable live; the panel shows them on next
  load. (This dropped the `realtime-integrity` operation, the `datasets/{id}/integrity` WS
  channel and the UI subscription — see the simplification design, D4.)
- The checker also **owns lock renewal** for long-lived resources — extending the anchor's
  lock (primary) or re-anchoring (fallback); see §3.4.

### 3.4 Lock lifecycle: time-based vs long-lived resources

Object-lock gives tamper-proofing for a bounded **window**, not permanent anchoring. Two
resource shapes need opposite handling:

- **Time-based / bounded lifetime** (e.g. the aging-out tail of a deleted resource, §8):
  the revision has a natural expiry. A fixed lock set at write = the retention window; it
  expires and is purged. No special handling.
- **Long-lived** (e.g. a file-based dataset unchanged for years): the resource's lifetime is
  **unbounded and unknown at creation**, but the integrity check always compares the hot
  state against the **latest** revision — so that anchor must stay tamper-proof for as long
  as the resource is current. Its lock, set when the resource last changed, will otherwise
  expire while the resource is still live, and the guarantee is lost. A fixed lock alone is
  the wrong tool.
- **Bounded regardless of the resource's own lifetime** (the `.who` attribution sibling, target 8
  / A2, §3.1): the third shape, deliberately **not** treated as either of the above even when it
  sits beside a long-lived anchor. Its lock is fixed at write time
  (`integrity.attribution.retentionDays`, default 180) and structurally excluded from every
  renewal pass (below) — the sliding-anchor treatment that keeps `.file` protected as long as the
  revision it belongs to is never extended to `.who`, on purpose: attribution's value (a
  tamper-proof answer for a bounded compliance window) is orthogonal to how long the *anchor*
  stays current, and letting it slide would silently turn a 180-day promise into an indefinite one.

The lock window is therefore reframed as a fixed **protection horizon**, kept sliding
forward for long-lived resources — except for `.who`, which stays on its own fixed clock. Two
ways to slide the horizon; we adopt the standard one as primary.

**Primary — lock renewal by extension (Option B).** Compliance mode allows *increasing* (never
shortening) a retention period, so the protection horizon is kept ahead of the present by
pushing the current anchor's retain-until date forward in place — no new revision written.
This is the standard object-lock pattern (the same refresh-retention approach backup tools
such as Veeam/Kopia use). Owned by the sliding checker (§3.3): when a long-lived resource's
check passes and its horizon nears expiry, the checker extends the anchor's lock; on a
mismatch it raises a breach instead. A **failed renewal fires an `integrity-renewal-failed`
event** through the same notifications path as a breach (gated on the ok→failed transition —
renewal retries nightly, no daily re-alert): an unnoticed renewal outage is the one silent path
to permanently lost repairability, so it gets the same loudness as a breach, on top of the
`lastRenewal` / `linesRenewal` status fields the UI surfaces. The renewal gate reads the
`integrity.lastRevision` mirror; if that mirror is externally lost, the checker **heals it from
the store** (the authoritative source) rather than letting `needsRenewal(undefined)` silently
disarm the slide. **At level 2 the anchor is a revision *pair***: the latest
revision JSON and the payload object it **references** (§3.1). Renewal extends the latest revision
JSON and, resolving `refIndex = file.i ?? i`, the `‹refIndex›.file` payload it points at — which,
under payload reference dedupe, may be an **earlier** revision's copy. Extending both together keeps
a payload's repairability from silently expiring while the revision JSON stays protected. A
**superseded** payload (one the latest revision no longer references) stops sliding at renewal, but
it was already extended to each referencing revision's retain-until at *write* time (§3.1, §3.5), so
it outlives every revision that references it. **The `.who` sibling is never a renewal target,
structurally**: it is filtered out of the anchor set the renewal pass operates over before extension
runs, at both the dataset and line level, so there is no code path that could accidentally extend
it — the exclusion is not a conditional inside the renewal logic but the absence of `.who` from
what renewal ever sees (§3.1, README.md invariant 14).

> **Dependency — resolved 2026-07-16:** lock prolongation is validated on Scaleway
> (staging, fr-par; aws-cli spike covering inline and default-retention locks, with and
> without version-id, Standard and Glacier classes — see
> `docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md`). Option B is
> confirmed as the primary renewal model; Option A remains a documented fallback for
> providers without prolongation.

**Degraded fallback — re-anchoring (Option A), added later if needed.** Instead of extending
the lock, write a fresh revision of the still-current state (operation type `reanchor`) with
a new lock; the old anchor ages out and is purged. Same checker-driven verify-then-act flow:

1. Verify the hot state still matches the about-to-expire locked anchor — this *is* an
   integrity check.
2. **Match** → write the fresh `reanchor` revision; the old anchor ages out.
3. **Mismatch** → breach: do **not** re-anchor; raise the alert.

For level 1 a re-anchor is a tiny object per window; for level 2 large files it is an **S3
server-side copy** of the still-locked payload (new version, fresh lock, no re-upload —
transient storage overlap until the old version ages out). This mode never extends a lock,
so it works on any provider regardless of the prolongation bug — hence its role as the
degraded fallback.

### 3.5 Storage posture: the sliding-lock mirror (one model for everything)

All data-fair targets are **mutable** resources, with the DB (or the file store) as source of
truth → S3 holds a **locked mirror**, integrity-checked by §3.3. There is a **single rule**,
applied identically to files, metadata documents, and dataset lines:

> Every write appends a new write-once locked revision (object-lock makes *all* revisions
> immutable — nothing is special to any class). The **latest** revision is the anchor: its lock
> slides forward (§3.4) — extending the revision *and*, at level 2, the `.file` payload it
> **references** (its own copy, or, under payload reference dedupe, an earlier revision's) together
> as one pair — so the **current state is preserved indefinitely**, while older revisions age out at
> retention so **history is recoverable only within the retention window**. A **line** deletion is a
> tombstone latest-revision that stops being renewed and ages out; a **dataset** disable or deletion
> ends the trail with a **terminal `disable`/`delete` revision** (round 3): written **before** the
> Mongo flip — a deliberate inversion of §3.2's hot-first rule, because the Mongo-first crash
> residue is indistinguishable from an out-of-band disarm while the revision-first residue (terminal
> latest on a still-active dataset) is benign and self-healed by the checker's force-re-anchor. A
> terminal revision re-records the current hash pair, is **never a dedupe target** (re-enable writes
> a fresh `enable` revision — the trail stays self-describing), then the whole scope ages out within
> one window (§8), discovered from the store rather than from Mongo. The daily **scope audit**
> closes the alarm-kill hole: a scope whose latest revision is live and still protected while Mongo
> claims the dataset inactive or gone — no signed-off terminal revision — fires
> `integrity-scope-incoherent` (deleted datasets get a synthetic event resource rebuilt from the
> revision's own `dataset` descriptor). The purge reports the delete markers it reclaims through the
> same event: markers are attacker artifacts and must never be *silently* swept.

At **write** time a revision that *references* an earlier payload also extends that payload's lock to
its own retain-until, so a payload's lifetime is the max over every revision that references it —
each referencing revision's file survives at least as long as its revision JSON, even once the
payload itself is superseded and stops sliding (§3.4).

**"Ages out" is an owned mechanism, not a bucket setting.** A revision whose compliance lock has
lapsed grounds *no* guarantee — it is ordinary mutable storage that could have been altered, so
keeping it buys nothing and costs both storage and LIST time on every check. A **purge**
(`api/src/integrity/purge.ts`) therefore deletes expired revisions outright, riding the daily
checker pass under the same cross-pod lock (never thrown: a failed purge delays reclamation, not
protection).

Its shape is deliberately the same as the `mc rm --versions --older-than 30d` cleanup cronjobs on
our backup buckets — **list object versions, filter by time, delete what has lapsed**. Deletion is
decided from dates and only then executed, so **an S3 error is a real error**, never control flow:
the purge does not attempt a delete to learn whether an object is still locked.

**Age cannot be pushed server-side, so the saving is in not listing.** S3 LIST takes only
prefix / delimiter / marker / max-keys — there is no date, size or metadata predicate — so
`mc --older-than` walks every version too, and no listing call can pre-filter by age. Nor can a
lifecycle rule replace this job: `NoncurrentVersionExpiration` only touches *noncurrent* versions,
but each revision is the current version of its **own** key, so it would reclaim almost nothing
here (only retried same-key PUTs), and a plain `Expiration` rule cannot express the current-anchor
carve-out below — quite apart from Scaleway not supporting the former yet. What the layout does
allow is to skip whole subtrees: keys are `data-fair/‹owner›/‹datasetId›/…`, so a `Delimiter: '/'`
listing enumerates **dataset scopes** at O(datasets) cost, and each scope carries a **watermark** —
the earliest date at which anything under it could next become deletable. Below that date the scope
is skipped without listing a single object. The watermark is derived, never guessed: after a pass
at `T` it is the minimum of every kept-but-unexpired version's horizon and `T + retention` (nothing
written after `T` can expire sooner). Disabling integrity clears it, since the anchors stop being
protected at that moment and must not wait on a watermark computed while they still were. Scopes
are discovered **from the store, not from Mongo**, so the tail of a *deleted* dataset still ages
out (§8) rather than being orphaned forever.

One thing separates this bucket from a backup bucket, and it is why a date filter alone is not the
whole story: locks here get **extended** (renewal slides the current anchor, §3.4; a revision
referencing an earlier payload extends that payload at write time, above). Object age is therefore
only a *lower* bound on the protection horizon, and is used exactly that way — as a cheap, sound
pre-filter that can only skip work, never authorize a delete (a lock is never earlier than
`lastModified + retention`). What decides is the version's actual `ObjectLockRetainUntilDate`, read
from the store, minus a small clock-skew margin so a boundary case cannot produce a spurious
failure. Two consequences of the pre-filter, both safe: *raising* the configured retention delays
reclamation of already-written objects (bounded by the new window); *lowering* it merely costs one
extra `HEAD` on objects that turn out to be still locked.

The single carve-out is the **current anchor set of a still-enrolled dataset** (the latest dataset
revision plus the `.file` payload it references, and every anchored line sequence's latest
non-tombstone anchor — deliberately without consulting Mongo live-ness, so an
out-of-band-deleted line's evidence is kept too, erring protective), which is kept whatever its
lock says. That is not a guess about the lock but a refusal to
act on a lapsed one: under a renewal outage — already surfaced loudly by `lastRenewal` /
`linesRenewal` (§3.4) — deleting the anchor would manufacture a missing-anchor breach and destroy
repairability irreversibly, while keeping a stale-locked anchor costs only storage. Since the store
is versioned (object-lock requires it), the purge walks *versions*, so a retried same-key PUT's
noncurrent copies and stray delete markers are reclaimed too.

**Retention is per-key, not per-scope (target 8 / A2).** The `.who` attribution sibling carries its
**own, shorter** window (`integrity.attribution.retentionDays`, default 180) distinct from the
revision's own (`integrity.retention.days`, default 365) — a deliberate correctness requirement,
not a nicety: a single global retention assumption in the age pre-filter (`lastModified + retention`
above) would keep a lapsed `.who` "provably young" until the *revision's* horizon, silently
stretching the 180-day promise to 365 days. The purge threads a per-key retention
(`retentionMsFor(key, retentionMs, attributionRetentionMs)`) through both the age pre-filter and the
scope watermark floor (`scopeWatermarkFloor`, which takes the **minimum** of the two windows — a
fresh `.who` must become eligible sooner than a fresh revision, so the watermark cannot be pinned to
the longer window alone). **`.who` is also, deliberately, never in the protected carve-out above**:
the current anchor set that the purge always keeps includes the latest revision and the `.file`
payload it references, but never the `.who` beside it — the single asymmetry with `.file` in this
whole model. The anchor's attribution ages out and is purged on schedule even while the anchor
itself (and its `.file` payload) stays protected indefinitely; this is what makes the 180-day GDPR
promise (§8) hold regardless of how long the dataset itself lives.

This gives every resource the same guarantee as a single file: current state always restorable
(level 2), any past state restorable within the retention window — plus, where captured, a
tamper-proof but time-bounded answer to *who* wrote it.

- **Per-resource vs. per-line is only granularity.** A file or metadata doc has one anchor; an
  editable dataset has **one anchor per line**. Same model, same guarantee — the difference is
  cost, see next point.
- **Renewal coverage cannot be sampled — and that is the scalability limit.** Detection coverage
  may slide/sample (§3.3), but the sliding lock that preserves "latest indefinitely" must be
  **renewed exhaustively**: miss a line's renewal before its lock lapses and that line's
  repairability is lost permanently. For one file that is one op; for a large editable dataset it
  is one op per live line per window. **Level 2 on large editable datasets is therefore an
  inevitable scalability bottleneck** — accepted as such, and gated/activated intelligently
  (cardinality threshold, opt-in per dataset; §5, §12), not engineered away.
- **Deferred — the authoritative-log posture for whole immutable collections.** Taken to its
  limit, an *entirely* append-only store (the `events` collection, HTTP logs, …) can invert the
  model: S3 becomes the authoritative immutable log and the DB a disposable, rebuildable
  projection — the most elegant application, and the one that most directly slays the "infinite DB
  growth" concern of §1, but it brings its own machinery and is **out of scope for this
  iteration**; see [§14](#14-deferred-scope--future-directions).

## 4. Deployment model

- The capability is a **module local to data-fair** — not (yet) an independent web service,
  and not (yet) a shared `@data-fair/lib-node` package. To stay as close to atomicity as
  possible we avoid an extra networking layer: data-fair configures one S3 client and runs
  its own checker in-process. The whole `integrity` config block (plus `integrityCheckCron`) is
  wired to environment variables (`INTEGRITY_ACTIVE`, `INTEGRITY_S3_*`,
  `INTEGRITY_RETENTION_DAYS`, …) like the main `s3` block, so a containerized deployment needs
  no mounted config file to enable it.
- It is nonetheless **factored as a self-contained module** (locked-revision format, write
  wrappers, checker) so that promotion to `@data-fair/lib-node` for other adopters later is a
  packaging change, not a redesign — see [§14](#14-deferred-scope--future-directions). Internally it
  follows the repo's module-role split
  ([code-conventions.md](code-conventions.md) §1): `operations.ts` / `lines-operations.ts` are pure
  (the unit-test surface), `store.ts` is the S3/WORM adapter behind a config-free constructor
  (`store-factory.ts` holds the config-coupled singleton), `relay.ts` / `lines-relay.ts` /
  `checker.ts` / `purge.ts` are express-free services, and **`service.ts` owns the admin-action
  orchestration** (enable/disable, `_fix`, both restores, the revision reads) so
  `datasets/routes/integrity.ts` stays a thin adapter — the actions are therefore callable from
  workers and tests without Express.
- **No central integrity service** and **no central checker** — both deliberately deferred
  (§14).
- **A single bucket for data-fair**, with the per-owner prefix layout of §3.1 (the `‹service›`
  segment is a fixed `data-fair` today, kept so the layout generalizes unchanged). The
  per-owner prefix makes an owner's *total* historized storage a one-query prefix size,
  feeding the storage-quota accounting of §9.

### 4.1 Local dev / test environment

In dev and test a **single MinIO** container (`minio` in `docker-compose.yaml`, profiles
`dev`/`test`) backs *both* the files storage and the integrity revision store — it is a
faithful enough S3 implementation to exercise object-lock locally, which `adobe/s3mock`
is not. Because MinIO does not auto-create buckets, a one-shot `minio-init` sidecar
(`minio/mc`) provisions them on startup:

- `bucketdev` — files storage, mutable
- `data-fair-integrity` — created with `--with-lock` (compliance WORM), the integrity store

`api/config/development.cjs` points `s3` and `integrity.s3` at the same MinIO (`S3_PORT`,
`minioadmin`/`minioadmin`; MinIO enforces credentials, unlike s3mock). `integrity.active`
is `true` with a 2-day revision retention and a 1-day attribution retention (deliberately
distinct windows, so tests can tell the two formulas apart), so the capability is on by default —
but it is still opt-in **per dataset** (admin-mode `PUT /datasets/{id}/_integrity`).

`npm run dev-fixtures` seeds **three** datasets in the `dev_fixtures` org that demonstrate the
feature end-to-end (each is documented in detail in the fixtures script itself):

- `fixtures-integrite-ok` — enabled, organically re-anchored twice (file update + metadata
  patch); check returns `ok`;
- `fixtures-integrite-breach` — file **and** metadata tampered out-of-band via the dev-only
  test-env endpoints → `breach: ['file', 'metadata']` (re-tampered on each run, since any
  legitimate covered write would re-anchor and heal it);
- `fixtures-integrite-lignes` — editable dataset, one line legitimately updated, another
  tampered raw (the silent-edit shape the dropped hash-fold could not see) →
  `breach: ['lines']` with the diverged sample.

Note the WORM retention interacts with re-runs: a revision written today cannot be deleted
for a day (compliance lock), so re-creating a dataset with the same id and identical content
dedupes against the still-locked revision. The fixtures are `skip-if-exists` and thus run
once per environment; on a fresh environment the three datasets seed automatically. These
fixtures also feed the screenshots of the client-facing presentation
(`dev/capture-integrity-screenshots.ts`).

## 5. Resource taxonomy & per-class feasibility

| Resource class | Level 1 (detect) | Level 2 (repair) | Hashing |
|---|---|---|---|
| Mongo metadata docs (dataset/app metadata, settings, …) | ✅ **delivered for datasets** (target 2); applications/settings deferred | ✅ **delivered for datasets** (bundled with the file-class joint anchor, §3.1); applications/settings deferred — note the metadata half rides the file-class joint anchor, so **enrollment itself is gated on a finalized file dataset** (the `_integrity` enable check, §3): a non-file dataset cannot enroll today, even for metadata-only protection | canonical (stable-key-sorted) JSON of a **denylist projection** → SHA-256 |
| Data files | trivial | ✅ **delivered — always-on, no size gate** | SHA-256 of the stored bytes (teed while streaming to the locked store) |
| Editable (REST) dataset — **Mongo lines** (source of truth) | ✅ **delivered — per-line locked revisions (detect + repair), gated ~100k live lines, opt-in per dataset; enrollment refused on lines-owner / attachment datasets (§5 limits)** | same mechanism as detect (level 1 and 2 are not separated for lines — every anchor carries its payload) | SHA-256 of the cleaned line body (stable-stringified), embedded in the revision key |
| Dataset **attachments** (bytes beside the document) | ❌ not covered — **enrollment refused** rather than partially claimed | ❌ | n/a |
| **ES index** (derived, both dataset families) | ✅ **delivered (A1)** — count + seeded sampled windows nightly, exhaustive on `?deep=true`, through the alias | reindex from the verified source (panel action, evidence journaled first) | not historized (rebuildable projection) |

> A fold-based level 1 over the existing per-line CRC32 `_hash` — the originally-sketched cheap
> universal detector for datasets **above** the gate — remains a **possible later level** for that
> tail (§10, §12); it was deliberately not built for v1 (design doc §0: it cannot see a direct
> content edit that leaves `_hash` untouched, so its cheapness does not cover the tamper that
> matters most).

- **Dataset metadata hashing (delivered).** The hash is SHA-256 of the **stable-key-sorted**
  JSON serialization of the dataset document with an **operational denylist** removed — every
  `_`-prefixed field (internal/calculated: `_id`, `_uniqueRefs`, …) plus a fixed top-level list:
  `status`, `draft`, `integrity`, `count`, `storage`, `esWarning`, `finalizedAt`,
  `dataUpdatedAt`, `dataUpdatedBy`, `updatedAt`, `updatedBy`, `createdBy`, `errorStatus`,
  `errorRetry`, `loaded`, `descendants`. These are fields that legitimately churn under normal
  operation (worker-maintained bookkeeping, cache/derived state) without representing a
  meaningful metadata edit — hashing them would produce false breaches on ordinary background
  activity. Nested strips remove the same kind of churn one level down:
  `extensions[].needsUpdate` / `extensions[].nextUpdate` (autoUpdateExtension), `rest.ttl.checkedAt`
  (the TTL worker), `extras.applications` (syncApplications propagation), and
  `readApiKey.expiresAt` / `readApiKey.renewAt` (the renewApiKey worker, which rotates these on its
  own clock — anchoring them would churn a WORM revision per renewal for no security value).
  **Fail-loud by construction:** the denylist is an explicit exclusion list, not an inclusion
  allowlist — any *new* field added to the dataset model later is covered by default (hashed, and
  thus protected) unless deliberately added to the denylist. This mirrors `coveredPatchKeys`
  (§3.2/§6), which the legitimate-writer instrumentation (`applyPatch`, permissions, `changeOwner`,
  topics/identities/settings propagation) uses to decide which patches must stamp the outbox.

- **Denormalized names are normalized out of the covered hash (D1, simplification design).**
  `coveredMetadata()` reduces denormalized references to their identifying keys before hashing:
  `owner` → `{ type, id, department? }` (drop `name` / `departmentName`); `topics[]` → `{ id }`
  only (drop title/color/icon); `permissions[]` → drop the display `name` only (type / id /
  department / classes / operations stay covered — the ACL semantics are fully hashed);
  `masterData.shareOrgs[]` → `{ id }` only. These fields are denormalized copies whose
  authoritative source lives elsewhere (simple-directory, `settings.topics`) and which the
  platform re-syncs wholesale — the same "rebuildable projection" argument that excludes ES. The
  trade accepted: tampering with a *display name* on the dataset doc is not detected; the
  visibility/ACL-bearing keys (`permissions`, `publicationSites`) remain covered, as the
  highest-value tamper targets.
  - **Bulk-writer stamp rule (the honest rule — any covered-content writer stamps).** Because a
    name propagation is no longer a *covered* change, the six name-sync stamps are gone (the owner
    / department / permissions / shareOrgs loops in `identities/service.ts` `renameIdentity`, and
    the topic-*update* stamp in `topics.ts`). The stamp is kept only where a bulk writer makes a
    **genuine covered-content change**: `deleteIdentity`'s permission-entry removal, the topic
    *deletion* `$pull` in `topics.ts`, and the `customMetadata` `$unset` + `deletePublicationSite`
    `$pull` in `settings/service.ts`. Those four funnel through `stampHistorizeMany`, which stamps
    every affected integrity-active dataset (with `origin: propagation`) in one pass, called
    **before** any destructive filter-self-invalidating write; over-stamping is harmless (the relay
    dedupes and drops the flag on un-enrolled datasets).

- **Files** default to level 1. The hash is a sha256 of the file, and the **write and verify
  paths both recompute it from the *stored file*** (not from `dataset.originalFile`'s fields): that
  metadata is computed on create and, even with the maintain-on-update fix, an *out-of-band*
  edit (exactly what `fixIntegrity` reconciles) never updates it — so anchoring the metadata would
  dedupe and never re-anchor. Relay and checker therefore call the same `sha256OfStorageFile(...)`,
  keeping them symmetric. **Level 2 is delivered and always-on (no size gate**, §2): every anchor
  copies the file into the historized bucket as its `‹i›.file` payload sibling (§3.1). The
  historized bucket stays fully separate from the main storage bucket (which is unchanged),
  keeping the model homogeneous with the Mongo case at the cost of some duplication.
- **ES is not a historization target — it is a rebuildable projection.** For REST datasets
  Mongo is the source of truth; the ES index is derived (the indexer strips `_hash`/`_deleted`,
  the ES `_id` is a throwaway `nanoid`, and a full reindex rebuilds the index from Mongo). So ES
  is a pure **rebuildable projection**: its integrity is *consistency with Mongo*, **repaired by
  reindex**, and it needs no locked history of its own. The historization target reduces to the **Mongo
  lines collection** — which shrinks this "hard tail" considerably. Not historizing ES no longer means
  not *verifying* it: the index verdict (A1, below) checks that consistency nightly, so the
  check chain is now locked store → source verdicts → index verdict → served data, with no
  unguarded hop between the anchor and what a reader actually sees.
- **Existing primitives reused** (verified in `api/src/datasets/utils/rest.ts`): a precomputed
  per-line `_hash` (CRC32 over stable-stringified data, kept as-is for its original purpose —
  conflict detection, `:269`), a unique monotonic order key `_i` (`:273`, unique index `:187`),
  and the `_needsIndexing` flag+worker relay pattern — mirrored, not reused directly, by the
  lines outbox below. The optional per-line revision log `dataset-revisions-‹id›` (mutable,
  TTL-able, gated by `rest.history`) stays a **separate, disposable UI convenience**: it is not
  the integrity primitive and is never read by the checker.
- **Pure level 2, no fold (the target-3 pivot).** Every line mutation appends a locked revision
  carrying the actual payload; detection, diff and repair come from the same primitive, and the
  hash is a **SHA-256 of the cleaned snapshot the relay stores** (relay/checker symmetric by
  construction — `rest.ts`'s CRC32 `_hash` stays a conflict-detection tool, not an integrity
  primitive). The originally-sketched cheap fold over `_hash` was dropped because it cannot see
  a content edit that leaves `_hash` untouched — full rationale in the target-3 design doc §0.
- **Key layout, hash-in-key.** Revisions live under
  `‹service›/‹owner.type›-‹owner.id›/‹datasetId›/lines/‹encodedLineId›/‹paddedI›-‹sha256|deleted›`
  — a subtree of the dataset's existing prefix, kept invisible to the dataset-level joint-anchor
  listing by switching that listing to `delimiter: '/'`. `‹encodedLineId›` is the Mongo `_id`,
  URI-encoded; `‹paddedI›` is the line's own monotonic `_i` (zero-padded to 16 digits — wide
  enough for `timestamp3` values), which doubles as the revision index so **the relay never lists
  before writing**; the full hex SHA-256 (or the literal marker `deleted` for a tombstone) is
  embedded in the key itself, so the checker recovers every line's latest anchor hash from **LIST
  alone** (paged, no per-object GETs). A line revision may carry the same optional `‹key›.who`
  attribution sibling as the dataset level (target 8 / A2, §3.1) — this is exactly the shape that
  needed covering from the start of the attribution design: there is no per-line journal event at
  all, so `.who` is the *only* tamper-proof identity source a line ever gets, bounded and never
  renewed like its dataset-level counterpart. The revision payload is the **cleaned body**: the line
  document minus every `_`-prefixed field — internals and `_ext_*` extension outputs (rebuildable
  projections, same argument that excludes ES) are not covered content — and minus
  **extension-owned plain columns** (`extensionOwnedKeys()`: exprEval outputs and remoteService
  `overwrite` columns). Those are non-underscore fields, but they are equally derived and
  rebuildable, and the extender writes them back **outside** the transaction pipeline
  (unstamped), racing the relay — covering them would false-breach every organic
  write-then-extend flow and every expression recompute. `sha256 =
  sha256(stableStringify(cleanedBody))`, computed by the relay from the payload it stores, so
  relay and checker stay symmetric by construction (the checker derives the same exclusion set
  from `dataset.extensions`).
- **Write path — per-line transactional outbox.** Every legitimate line mutation (transaction
  pipeline create/update/patch/delete, the TTL worker's tombstones) adds `_needsHistorizing: { context? }` to the line document in the **same single-document
  write** — the `_needsIndexing` pattern, atomic on any shard key, stamped only when
  `dataset.integrity.active`. Whole-collection resets (`deleteAllLines`, `bulkLines?drop=true`)
  are refused with 400 while integrity is active — integrity anchors would be orphaned by a collection
  drop; deletions must go through the ordinary transaction path (per-line tombstones). The one
  **bulk covered-content rewrite outside the transaction pipeline** — `applyPatch` `$unset`ting a
  removed schema property from every line on a narrowing patch — is stamped through the same
  outbox (hint first, then the stamp merged into the very `updateMany` that rewrites the lines),
  so a legitimate property removal re-anchors the rewritten lines instead of mass false-breaching
  them; extension-removal `$unset`s need no stamp (their columns are outside the covered body). A
  dataset-level hint (`_needsHistorizingLines`) is set *before* the line stamps so a crash
  between the two leaves a harmless empty hint, never orphaned stamps. The relay (`historizeLines`)
  picks up hinted datasets, batches concurrent S3 PUTs, clears line flags per batch and the hint
  once none remain — retry-forward, per line. `commitLines` additionally requires `_needsHistorizing`
  to be absent before purging a `_deleted` doc, so a deletion revision can never be lost to a race
  with indexing. The extender does **not** stamp. A dataset with pending line stamps (or the hint)
  reports `unknown` rather than a false verdict — same posture as the dataset-level outbox. To
  perform mass deletion or disable integrity first (allowing anchors to age out at retention), then
  delete through transactions; to drop the collection, disable integrity, perform the reset, then
  optionally re-enable.
- **Enable, gate, and lifecycle.** `PUT …/_integrity {active: true}` on a REST dataset first
  counts live lines and **refuses above the gate** (`config.integrity.lines.maxLines`, default
  100 000) with a `409`; on success it anchors the joint metadata revision inline as today, then
  stamps every live line (`operation: 'enable'`) and sets the hint — the relay backfills
  asynchronously, and `GET …/_integrity` exposes `lines: { anchored, pending }` for progress until
  it drains. Growth past the gate after enrollment never blocks writes; anchoring continues with a
  loud warning rather than silently dropping protection. Disable stops stamping/renewal (anchors
  age out at retention), clears the dataset flags AND sweeps per-line stamp residue (with the
  hint gone the relay would never visit those lines again); owner transfer stays refused while active (avoids re-anchoring the whole
  line set under a new prefix, integrity4's rule). **Re-enable false-missing.** Lines deleted while
  integrity was disabled purge (no outbox stamp, so no tombstone revision) — on re-enable, the
  backfill has no way to distinguish "never existed" from "deleted during the gap", so the first
  check after re-enable reports every still-anchored-but-now-absent line as an out-of-band delete;
  `_fix` reconciles by writing the tombstone the gap never produced.
- **Check and renewal.** The nightly `checkDataset` gains a lines part for enrolled REST datasets:
  LIST recovers every line's latest `{ _i, sha256 | deleted }` from key names — **folded page by
  page** (`foldLatestLineAnchors`) rather than materialized, so the checker's memory is
  O(**distinct lines within the retention window**) — live lines plus not-yet-aged-out deleted
  ones, so a high-churn dataset can hold more anchors than the gate's live-line count — even
  though the prefix holds every revision in the retention window — a live-Mongo scan recomputes each line's sha256 and compares — content-hash mismatch, `_i` mismatch, a live line
  with no revision (out-of-band insert), or a latest revision with no live line (out-of-band
  delete) are all breaches; a live tombstone (both anchor and doc absent) is `ok`. The verdict
  gains a `'lines'` breach member and `integrity.lastCheck.lines = { checked, diverged, sample:
  [≤20 lineIds] }`. **Renewal rides the check** (verify-then-renew, §3.4 Option B): when the
  dataset's lines-renewal horizon is due and the check passes, every live line's anchor retention
  is extended in the same pass, **batch-concurrent** (100 in flight, like the relay's PUTs);
  failures aggregate into `integrity.linesRenewal: { date, status, renewed, failed }`, loud, never
  thrown. Per §3.5 this coverage must be exhaustive — a missed renewal permanently loses that
  line's repairability — so the *number* of operations is irreducible (one `PutObjectRetention` per
  live line per window) and **level 2 on a large editable dataset remains an inevitable scalability
  bottleneck**: accepted, not engineered away, and exactly why the cardinality gate exists. Only
  their serialization was avoidable, and is avoided.
- **Repair.** `POST …/_integrity/lines/_restore` (superadmin, synchronous) re-runs the per-line
  comparison and, for each diverged line, rewrites it from its latest revision payload through the
  standard transaction pipeline (`operation: 'restore'`), re-inserts out-of-band-deleted lines,
  and **deletes out-of-band-inserted lines** (no verified state to restore to) — then re-checks
  and returns the fresh verdict, bounded by the gate. `POST …/_integrity/_fix` extends naturally:
  edited/inserted lines get their **current** content re-written through that **same transaction
  pipeline** (`createOrUpdate` from `cleanedLineBody()`, `operation: 'fixIntegrity'`, `_hash`
  invalidated first so the dedupe doesn't 304 identical content) — "bless the current state" — and
  vanished (out-of-band-deleted) lines get an explicit tombstone anchored past the stale anchor's
  `_i`. Anchoring the bless directly at the line's *current* `_i` (an earlier, since-fixed shape)
  was nondeterministic: an out-of-band edit that leaves `_i` untouched ties the fresh anchor
  against the still-live stale one at the same `_i`, and `latestLineAnchors`'s tie-break (keeps the
  lexically-first key) can silently keep the *stale* anchor latest; routing the bless through the
  pipeline instead mints a fresh `_i` strictly greater than any prior anchor's, so the result is
  always deterministically latest. Per-line history (`GET …/_integrity/lines/{lineId}/revisions`
  and the `/revisions/{i}` payload/diff endpoint) reuses the dataset-level revisions UI pattern and
  permissions (`readIntegrityRevisions`, superadmin-only writes).
- **Explicit limits — enforced by refusing enrollment, never by a caveat.** The rule is that a
  dataset is either **fully covered or not enrolled**: the verdict must never overstate what the
  snapshot actually protects. Two shapes fall outside the line snapshot, and **both are refused at
  enable with a `400`** (`enableIntegrity`, `api/src/integrity/service.ts`), and refused as
  *transitions* on an already-enrolled dataset by the dataset `PATCH` route — acquiring them later
  would silently degrade a live guarantee, exactly like the owner transfer of §3.1:
  - **Attachments.** A dataset carrying an `x-refersTo: http://schema.org/DigitalDocument` field
    stores bytes outside the document (and outside the file anchor's `originalFile`), so those
    bytes are neither detected nor restorable. Enrolling would let an `ok` verdict coexist with
    tampered attachment files. Refused at **three** points, because a dataset can acquire
    attachments three ways: at enable (`400`), when a schema patch would add the field, and — the
    one a patch guard cannot see — when an `attachments` archive is **uploaded** onto an enrolled
    dataset (`preparePatch`), since there the field is added later by the normalize worker rather
    than by the patch itself. This applies to file datasets as much as REST ones.
  - **Lines-owner attribution.** A line snapshot is `cleanedLineBody()` — the user-visible body
    only — so the `_`-prefixed `_owner`/`_ownerName` columns an application-key write stamps are
    excluded from both the hash and the payload. Worse than undetected: both `lines/_restore` and
    `_fix`'s bless rewrite a line via `createOrUpdate` through the transaction pipeline (§3.2)
    **without** a `linesOwner`, so the repair itself would **drop** whatever `_owner`/`_ownerName`
    the line held — a remediation causing collateral data loss. Refused (both at enable, and when a
    patch would set `rest.lineOwnership` while active).

  Covering either properly (attachment content hash + locked copy in the line's revision; `_owner` inside
  the covered projection with a linesOwner-preserving rewrite) is a possible later addition — the
  refusals are what keep the *stated* guarantee true until then.

  A dataset **above the gate has no lines integrity at all** — the accepted coverage cliff of
  skipping the fold (§10, §12): sensitive editable datasets are bet to be modest-cardinality
  reference tables. Enrollment above the gate is likewise refused (`409`), so this cliff is never
  silently entered either; only *growth past the gate after* enrollment continues anchoring, with a
  loud `overGate` warning rather than silent partial protection.

- **ES index consistency verdict (A1, delivered).** The lines verdict above guards Mongo, the
  source of truth — but users read datasets through ES (`/lines`), and a direct write into the
  index served all of that data without ever touching a guarded primitive. `checkDataset` now
  produces a third verdict member, `'index'`, for **both** file and REST datasets, closing that
  gap. One uniform mechanism, only the source adapter differs per family:
  - **Count check, every run.** The ES doc count **through the alias** (`aliasName(dataset)` —
    never a physical index name, so a diverted alias is caught rather than silently trusted) is
    compared against the authoritative count: live Mongo line count for REST — solid, because the
    lines verdict grounds that collection in the locked store — or `dataset.count` (set by the
    indexer from rows actually read) for file. `count` sits on the metadata hash **denylist**
    (`EXCLUDED_TOP_LEVEL`, an indexer-churn field — covering it would WORM-churn a locked revision
    per reindex), so a Mongo-writing adversary *can* silently adjust `dataset.count`; the file-side
    compare is therefore a cheap tripwire, hint-grade, not a proof. It still instantly catches a
    bulk ES add/remove by an adversary who does not also forge `dataset.count`; one who forges both
    is caught by the sampled windows below (probabilistically, each night) or by `?deep=true`
    (deterministically) — both re-derive rows from the file itself, whose bytes the file hash does
    cover.
  - **Seeded sampled windows, every run.** A **fresh crypto-random seed drawn per run and never
    persisted before use** picks `windows` random `_i` pivots (default 8), each compared over
    `windowSize` rows (default 128) between the ES alias and the verified source (Mongo for
    REST, a streamed re-read of the file for file datasets) — an adversary has no way to know in
    advance which rows tonight's run will visit, so there is no permanently-safe row to tamper.
  - **Exhaustive on demand.** `POST /_check?deep=true` (existing route) reuses the same
    comparison with a single window spanning every row — a full lockstep compare rather than a
    sample.
  - **Pending states report `unknown`, never a false breach:** `_needsIndexing` lines,
    `_partialRestStatus`, a dataset not yet finalized/indexed, or a missing alias mid-(re)index
    all downgrade the index verdict to `unknown`; a fresh check re-runs after any divergence is
    found, so a transient pending state cannot mask a real one.

    > **Stated residual limit (follow-up, not fixed in this wave):** the `integrity-check-stale`
    > alert does **not** bound a *per-verdict* index `unknown`. It fires off
    > `integrity.lastDefinitiveCheck`, which advances on every **overall** definitive check
    > (`ok`/`breach`) — and the overall check stays definitive even while the `index` member alone
    > is `unknown`. So a Mongo-writing adversary can pin the index verdict to `unknown` **forever**
    > (an orphaned `_needsIndexing: true` line with no relay hint, or a forged non-finalized
    > `dataset.status` — both outside hash coverage) without tripping the stale alert. Closing this
    > needs a per-verdict freshness clock, deliberately deferred (design doc §3.4 correction,
    > `api/src/integrity/README.md` A1 invariants).
  - **Malformed ES docs are surfaced, not dropped:** a doc with a missing/null/non-numeric `_i`
    (unorderable, unjoinable) is recorded as a `surplus` divergence keyed by its ES `_id` — the
    sampled window query explicitly pulls `_i`-less docs (a `range` alone never matches them), and
    the compare guards its `_i` span frontier with `Number.isFinite` so a stray non-finite value
    can never collapse the span to NaN and skip a whole batch uncompared.
  - **Evidence before repair.** A capped excerpt of the expected vs. actual doc for each
    divergent entry (`_rand`, index-time `Math.random`, is the only excluded compare key) is
    persisted in `integrity.lastCheck.index.sample` at detection time. The panel's superadmin
    reindex action **journals that evidence first** (`integrity-index-repair` event), then
    triggers the standard reindex — the repair destroys the live divergence, the journal entry
    survives it.

  Config lives under the existing `integrity` block (`integrity.index.windows`,
  `integrity.index.windowSize`, `integrity.index.sampleCap`); an explicit seed is accepted only
  from the superadmin `_check` route, for test determinism — production nightly runs never pass
  one. Full rationale and the rejected alternatives are in the design doc,
  [2026-07-22-integrity-index-consistency-design.md](../plans/2026-07-22-integrity-index-consistency-design.md).

## 6. Atomicity & failure model

- Atomicity rides the **transactional outbox** (§3.2) everywhere: a single-document flag on the
  resource, relay to locked S3, retry-forward. Any residual window (the known two-write crash
  gaps of the propagation writers) is **surfaced as a detectable defect** — a transient false
  breach a superadmin reconciles — rather than silently tolerated.
- Legitimate out-of-band writers (workers, upgrade scripts) must either go through the
  wrapper too, or be reconciled with a `fixIntegrity` revision. Failing to do so will
  (correctly) raise an integrity alert.

## 7. Access & audit

### 7.1 Endpoint & field permissions

The integrity API splits read from write:

- **Writes are superadmin-only** (`reqAdminMode`), matching the `_diagnose` pattern: `PUT
  /datasets/{id}/_integrity` (enable/disable — disable accepts a trail-recorded `reason`),
  `POST …/_integrity/_check` (`?deep=true` re-verifies trail date coherence over the whole
  window), `POST …/_integrity/_fix`, and `POST …/_integrity/trail/_ack { reason }` (round 3 —
  acknowledges the trail anomalies the fresh check surfaces, as a locked ackTrail revision).
  All are gated by admin mode (never grantable through permissions).
  `_check` and `_fix` are **synchronous** and respond with the fresh check verdict — `_fix`
  re-anchors inline, then runs the check and returns its result.
- **Reads are open to the owner account's admins** via the registered admin-class operations
  `readIntegrity` / `readIntegrityRevisions`: `GET /datasets/{id}/_integrity`, `GET
  …/_integrity/revisions` (+ `GET …/_integrity/revisions/{i}`), and the `integrity` field embedded
  in dataset responses (which drives the list breach badge and the `status=error` filter row).
  These are enforced with the standard `permissions.middleware(...)` machinery, so an owner admin
  holds them implicitly and a superadmin holds them via admin mode. (There is no
  `realtime-integrity` operation or websocket channel — the admin actions are synchronous, §3.3.)
  **The same `readIntegrityRevisions` gate governs `.who` reads** (target 8 / A2): both the
  dataset-level revision endpoints and the per-line `GET …/_integrity/lines/{lineId}/revisions`
  (+ `/revisions/{i}`) enrich each page item with its `.who` body when the sibling exists (one GET
  per item; a 404 simply means "absent", not an error), same permission, no separate gate — this
  was a deliberate call in the design (owner admins already see everything else about their own
  account's activity through this same surface; attribution is not superadmin-only).
- `clean()` (`api/src/datasets/utils/index.ts`) **strips the `integrity` field** from any
  response whose reader cannot `readIntegrity`, so anonymous/unauthorized readers never see
  breach verdicts or anchors even when they can otherwise read the dataset. This also scopes the
  list breach badge to authorized readers.
- **UI:** the integrity tab is shown when the reader holds `readIntegrity` (or is in admin
  mode); the enable/disable switch and the check/fix action buttons inside it render only in
  admin mode. The status alerts and revision-history table are visible to every viewer of the
  tab. The three actions that change the trail or the protection state are **confirmed in a
  dialog stating their consequence**: restore (overwrites data), reconcile (blesses the current
  state as legitimate, so pending divergences stop being reported), **disable** (clears the
  verdicts and stops renewal — additive *enable* needs no such guard) and **trail-anomaly ack**
  (round 3 — stops reporting the reviewed anomalies; itself a locked, audited revision).
  Reconcile, both restores, disable and the ack offer the optional free-text `reason`, which is
  the only free-text field a WORM revision carries; both history tables render it, so what an
  admin can write is also what an auditor can read. The panel shows the trail verdict as a
  second status row with the anomaly list (kind, key, confidence). Both revision-history tables
  (dataset-level and per-line) additionally carry an **attribution column** (target 8 / A2, en +
  fr) showing the `.who` body when present — user id or API-key ref, IP, country flag/code — raw
  ids as stored, with **no display-name resolution**: looking one up would re-personalize what
  minimization deliberately stripped (§8), and the id is already meaningful to the owner admin and
  resolvable through the directory while the user still exists.

### 7.2 Store access

The historized store itself is **admin-mediated**. Two access models, by provider capability:

1. **App-mediated (baseline, portable).** The service holds the bucket credentials and serves
   an owner's revisions through its own authz layer (it already knows owner boundaries) —
   listing revisions and issuing pre-signed URLs for individual revision objects. Works on
   every provider, including Garage. This is the default; "admin-only" is enforced at the app
   layer while immutability is enforced by object-lock.
2. **Independent direct-S3 credentials (stronger, provider-gated).** Hand an auditor
   read-only, **prefix-scoped** credentials so they verify *without trusting our code* — e.g.
   during an audit. Available on Scaleway/AWS/MinIO/Ceph via prefix-scoped bucket/IAM
   policies; **not** on Garage (per-bucket grants only). On Scaleway specifically there is
   **no STS/AssumeRole**, so this means **pre-provisioning a scoped IAM-application key**
   (long-lived until revoked), not minting a short-lived session. Recorded as a manual,
   opt-in enhancement.

## 8. GDPR & retention

Compliance-mode immutability and right-to-erasure are reconciled the only way that
preserves the guarantee:

- **The revision context holds no personal data by construction.** Since the three-tier split
  (§1), a revision's `context` records only an operation type and an actor *category*
  (`origin: user | superadmin | worker | propagation | upgrade`) — never a `user:‹id›`. At level 2
  the payload is the *covered projection*, from which `createdBy` / `updatedBy` are already
  excluded (denylist §5) and the personal-info cleanup removed them from the dataset doc besides.
  So a **user-erasure** request no longer conflicts with the undeletable revision at all: there is
  no identity to erase inside it. Identity attribution beyond the bounded `.who` window (below)
  lives in the mutable events/journal, which is anonymized on identity deletion. This is what
  replaced the earlier "context retained even under GDPR pressure" stance — retention is a
  non-issue for *user* erasure as far as the undeletable revision JSON is concerned.
- **Bounded, owner-visible retention = protection horizon.** The compliance-lock duration is
  a single fixed window that serves two roles at once (see §3.4): the protection horizon for
  long-lived resources, and the **maximum lag between a resource's deletion and full erasure
  of its history**. While a resource is live, lock renewal (§3.4) keeps it protected — and
  its data cannot be erased anyway, as it is still in the hot store. Once the resource is
  deleted, renewal stops and the tail ages out within one window — and that erasure is
  **actively performed** by the purge described in §3.5 (a daily attempt-delete whose only
  authority is the lock's own refusal), not left to an out-of-band bucket lifecycle rule. This
  matters for the erasure promise below: the wait-out is bounded by a mechanism this codebase
  owns and tests, so "erased within one window" is a claim the system actually makes good on.
- **Erasure = wait-out.** Erasure requests are honored once the window elapses after
  deletion; the window length is a **documented policy / contract term** that must be
  assumable long-term.
- Governance mode was rejected (a privileged role could delete → defeats "even an admin
  cannot contradict it"). Dropping the modifier reference was rejected (guts forensics).
- **Owner-level erasure still uses the wait-out.** The remaining erasure unit is the **owner
  (organization)**: an org's historized data cannot be destroyed early, so org-deletion is honored
  once the window elapses — unchanged, and identical to the wait-out we already carry in global
  backups. The retention window (indestructible for its whole length) must still be chosen
  deliberately with this owner-level wait-out in mind.

### 8.1 Bounded individual attribution (`.who`, target 8 / A2) — a second, shorter erasure clock

The revision JSON's freedom from personal data (above) does not mean the platform captures no
identity for a legitimate write — it means the identity does not live *there*. When captured, it
lives in the `.who` sibling (§3.1), and that object gets its **own** GDPR analysis, distinct from
the revision's:

- **Lawful basis.** Security/integrity journalisation (legitimate interest): the data set
  captured — user id or API-key id, timestamp, IP, coarse geo — is exactly the CNIL délib.
  2021-122 journalisation scope, and the 180-day default sits mid-band (the délib. allows 6 months,
  extensible to 1 year with justification; the *revision's own* 365-day window, §12, already sits
  at that upper bound for a different purpose — the protection horizon, not journalisation).
- **Erasure.** Deferred **≤ 180 days after write**, and — like the revision's own erasure above —
  **actively performed by the purge** (§3.5), not left to a lifecycle rule: the same
  deferred-erasure-on-WORM doctrine this section already applies at the *dataset* level is applied
  here at the *individual write* level, with a much shorter, non-negotiable bound. The non-renewal
  of `.who` (§3.4) is what makes this promise unconditional — there is no code path by which an
  attribution sibling's clock could be pushed out by the dataset staying live, the way the revision
  it sits beside is.
- **Stated asymmetry — this is the feature, not a gap.** Journal-based identity is erased
  *immediately* (anonymized) when a user account is deleted; `.who` attribution instead survives up
  to 180 days **after the write**, independent of any subsequent account deletion, because it is
  compliance-locked like everything else in this store. The two erasure timings are deliberately
  different, and that difference is the entire value proposition of the sibling (tamper-proof
  attribution for a bounded window that not even the platform operator can shorten) — it must be
  documented plainly in the privacy policy / DPA (**action item, out of repo** — see the design
  doc's status line, `2026-07-22-integrity-attribution-design.md`).
- **Article 15 (right of access).** A subject-access request is answered by the standard
  journalisation clause: "attribution records are retained for a maximum of 180 days for integrity
  purposes." No per-user index over `.who` objects is built (or needed) for this — enumerating every
  write a given user made is not currently a served query; a later mutable Mongo index remains a
  possible addition if a DPO requires per-user enumeration, but nothing in the design depends on it.
- **Minimization, restated.** Id-only, never name/email (a name would stay readable long after a
  directory-side erasure; a bare id degrades gracefully into a dangling pseudonym instead); raw IP
  plus proxy-computed coarse geo only, never in-app geo-IP resolution (§13); neutral proxy fillers
  (`XX`/`0`/`Unknown`) are dropped rather than stored as false precision; the attribution kill
  switch (`integrity.attribution.active: false`) lets a deployment opt out of storing IPs/geo
  altogether, at the cost of `.who` never being written.

## 9. Storage accounting (internal to data-fair)

No separate billing surface. Historized storage is **counted toward the owner's existing
static-content / storage quota**: the per-owner historized prefix size (§3.1) is added to what
data-fair already meters. Activating integrity for an owner is a setting, not a separately
priced product.

**Implemented as a daily measure, not a hot-path LIST.** A measurement pass rides the daily
checker/purge run (`api/src/integrity/storage.ts`, same cross-pod lock, after the purge so
freshly reclaimed bytes stop counting immediately): it walks each owner prefix's **versions**
(revision JSONs, `.file` payloads, noncurrent duplicates — everything the bucket genuinely
holds), sums the sizes into a per-owner `integrity-storage` Mongo doc, and refreshes the owner's
metered consumption. `updateTotalStorage` (the function every storage-affecting change calls)
then adds that stored figure to the datasets/applications aggregation — a cheap Mongo read, never
a live S3 walk. Because owners are discovered **from the store**, the aging-out tail of a
**deleted dataset keeps counting** until the purge reclaims it — the bytes are held either way —
and an owner whose only remaining historized data is such a tail still gets refreshed by the
daily pass (no organic `updateStorage` call would otherwise touch it).

The dominant cost driver is level 2's payload retention: it stores one full locked file copy per
**distinct file version** within the retention window (not per revision). Metadata-only revisions —
the joint anchor re-records them whenever covered metadata changes — carry only a lightweight
reference (`payload.file.i`) to the existing copy rather than duplicating the bytes (payload
reference dedupe, §3.1). So the accumulated payload size scales with the number of *file* changes,
not the number of revisions, and that size is metered into the owner's storage consumption.

## 10. Delivery state & what remains

Everything below the line is **delivered**; the per-iteration narratives, decision records and
review findings live in the `docs/plans/2026-07-*-integrity-*` design/plan documents (spec →
plan → build, test-first), not here.

| Iteration | Delivered | Design doc |
|---|---|---|
| Target 1 — dataset files | detect + repair + lock renewal (~monthly cadence, 1/12 of the window) | `2026-07-17-integrity-level2-repair-design.md` |
| Target 2 — dataset metadata | detect + repair, folded into the joint anchor | (with target 1) |
| Simplification | joint anchor, depersonalized context, synchronous admin actions, name normalization | `2026-07-16-integrity-simplification-design.md` |
| Target 3 — REST lines | per-line locked revisions (pure level 2 — the fold-based level 1 was deliberately dropped: it cannot see a content edit that leaves `_hash` untouched) | `2026-07-20-integrity-target3-lines-design.md` |
| Pre-release hardening | sha256 file hashes, pipeline-routed restore, locking, race nets, renewal alerting, storage quota, env wiring | `2026-07-21-integrity-followups-plan.md` |
| Security round 3 | trail-coherence verdict, terminal revisions + scope audit, realerts, `_i` wedge | `2026-07-22-integrity-trail-coherence-design.md` |
| A1 — ES index consistency | third `'index'` verdict (count + seeded sampled windows nightly, exhaustive on `?deep=true`), both dataset families, through the alias; panel reindex journals evidence first | `2026-07-22-integrity-index-consistency-design.md` |
| A2 — bounded attribution | `.who` sibling (user id / apiKey id / ip / geo, own short retention), `who.apiKey.id` capture | `2026-07-22-integrity-attribution-design.md` |

**Deliberately not built yet** (each is additive; the enrollment refusals of §5 keep the stated
guarantee honest until they land):

- applications and settings metadata (the joint anchor covers **datasets** only);
- attachment bytes (dataset or line level) — enrollment refused meanwhile;
- lines-owner attribution coverage — enrollment refused meanwhile;
- a fold-based level 1 for datasets **above** the lines gate (a possible later, separate level);
- everything in §14 (generalization, log posture, central service).

## 11. Provider support (target: Scaleway)

| Provider | Object-lock compliance | Prefix-scoped grants | STS / short-lived creds |
|---|---|---|---|
| **Scaleway** (target) | ✅ (versioning required; default retention supported; Glacier OK) | ✅ via bucket policy (`bucket/prefix/*`) | ❌ — pre-provisioned IAM-app keys only |
| AWS S3 / MinIO | ✅ | ✅ | ✅ |
| Ceph RGW | ✅ | ✅ | ✅ (STS / STS Lite) |
| Garage (self-host/OSS) | per-bucket only | ❌ (no prefix IAM) | ❌ | 

Scaleway covers the load-bearing requirements: compliance-mode object-lock (the entire
premise) and prefix-scoped access within a single bucket. App-mediated audit access remains
the portable baseline for the OSS/Garage story.

## 12. Open questions / decided records

Genuinely open:

- **Next actions (assessed 2026-07-22, one dedicated branch each — pre-design notes in
  [2026-07-22-integrity-next-actions-notes.md](../plans/2026-07-22-integrity-next-actions-notes.md)):**
  **A1** ES index consistency verification and **A2** bounded attribution are both
  **delivered** (see below; A2's second half — the apiKey-only write lock — was extracted to
  the level-3 locking plan, `2026-07-23-integrity-level3-lock-notes.md`); **A3** visual
  revision diffs in the panel remains.
- **Scope list** — exactly which data-fair resources count as "sensitive": which metadata
  collections, and which datasets opt into editable-line history. A product conversation per
  deployment, not a design gap.
- **Level 3 — tamper-evident freeze (assessed 2026-07-23, not scheduled).** Reversible,
  store-authoritative dataset lock as trail revisions; the strong/weak knob is checker policy,
  not storage location, and within the threat model the reversible lock ≈ the permanent one —
  full assessment in
  [2026-07-23-integrity-level3-lock-notes.md](../plans/2026-07-23-integrity-level3-lock-notes.md)
  and §14.

Decided / resolved (one line each; details in the linked docs):

- **Default retention window — one year, uniform (2026-07-21).** One bucket → one policy
  (`config.integrity.retention.days`, default 365), simultaneously the protection horizon (§3.4)
  and the maximum deletion→erasure lag (§8). Top of the CNIL journalisation band
  (délib. 2021-122), matches ANSSI PA-022 (≥ 12 months), inside CNIL's deferred-erasure doctrine
  for WORM stores; archives-publiques obligations bind the producing collectivité, not the
  hosting platform. Locks extend but never shorten: a deployment may raise the default, never
  lower it retroactively.
- **Scaleway lock prolongation — validated (2026-07-16 spike).** `PutObjectRetention` extension
  works in every tested combination; shortening/deleting correctly refused. Renewal-by-extension
  (§3.4 Option B) is the primary model; re-anchoring (Option A) is a portability note only
  (`2026-07-16-scaleway-lock-prolongation-spike-runbook.md`).
- **Line hashing — SHA-256 of the cleaned snapshot (2026-07-20).** The CRC32-fold level 1 was
  dropped (cannot see a content edit that leaves `_hash` untouched); the relay computes the hash
  from the payload it stores, checker symmetric by construction.
- **Outbox rides the resource document, not a separate collection (§3.2)** — single-document,
  single-shard atomicity on any shard key, future-proof against sharding.
- **Security round 3 — trail coherence & store authority: delivered (2026-07-22).** Second
  verdict, terminal revisions + scope audit, realerts, `_i` wedge, threat-model rewrite —
  see §1/§3.3/§3.5 and `2026-07-22-integrity-trail-coherence-design.md`. The guarantee now
  reads: tamper-evident against anyone who cannot destroy locked versions, with the
  stamp-forging first-write lie (§1) and operator/provider collusion (§13) as residual limits.
- **A1 — ES index consistency verdict: delivered (2026-07-22).** Third verdict member
  `'index'`, closing the last unguarded hop between the locked store and what a reader actually
  sees — see §5 and `2026-07-22-integrity-index-consistency-design.md`.
- **A2 — bounded attribution: delivered (2026-07-22/23).** `who.apiKey.id` capture — see §7.1
  and `2026-07-22-integrity-attribution-design.md`. The second half of the original A2 sketch —
  the apiKey-only write lock — was **extracted from that iteration**: it is now part of the
  level-3 locking plan (see the tamper-evident-freeze assessment,
  `2026-07-23-integrity-level3-lock-notes.md`), so both lock surfaces get designed together.

## 13. Alternatives considered & deliberately not adopted

These are closed decisions, recorded to avoid relitigation. The first three follow from the threat
model in §1 (detection + audit + repair against a tenant admin — not cryptographic
non-repudiation against the operator/provider).

- **Passive change-stream mirror (CDC) as the write wrapper.** Rejected: it loses the operation
  context, and an uncontrolled background edit *is* the breach to detect — catching it up would
  hide exactly what must surface. The transactional outbox keeps CDC's reliability with context.
- **Mongo-first + compensating rollback as the write wrapper.** Rejected in favor of the outbox
  everywhere: it leaves a residual crash gap (hot write committed, revision never lands) that
  the single-document outbox stamp eliminates. No code path uses it.
- **Per-revision hash chaining / Merkle proofs** (à la CloudTrail digests, AWS QLDB, Sigstore
  Rekor). **Rejected:** our source of trust is **compliance-mode object-lock**, not
  provider-independent cryptographic evidence. Chaining adds machinery to re-prove a property the
  WORM store already enforces, defending against operator/provider collusion — a threat outside
  our model.
- **Crypto-shredding for GDPR** (encrypt payloads; erase by destroying the key). **Rejected:** our
  erasure unit is the **owner (organization)**, not the individual user, so a per-owner key would
  only cover org-deletion — and we already carry the identical wait-out behaviour in global
  backups. Not worth the key-management surface; §8 keeps the bounded wait-out model.
- **Asymmetric signing of revisions** (non-repudiation of `context` at write time). **Rejected:**
  not achievable in our architecture, and unnecessary under the threat model — the auditable trail
  plus always-available rollback is the intended guarantee, not cryptographic attestation. (This
  is the explicit acceptance of the "first-write lie" limit named in §1.)
- **S3 native versioning as the revision mechanism** (one key per resource — dataset or line — with
  the version stack as its history; the "obvious" S3-native design, and the bucket is versioned
  anyway since object-lock requires it). **Rejected**, because it breaks four properties the trail
  depends on:
  1. *The trail must be verifiable from the store alone.* Version ids are opaque provider strings,
     so "revision `i`" would need an `i → versionId` mapping — necessarily in Mongo, which is
     mutable and is precisely what is being guarded: whoever rewrites Mongo could then reorder or
     hide revisions. Ordering by `LastModified` instead is provider clock granularity — two writes
     in the same second have no reliable order. With `‹paddedI›` in the key, LIST alone yields the
     complete, ordered, gap-visible sequence: the WORM store is its own index.
  2. *Checks must stay O(LIST).* LIST (keys or versions) returns no user metadata and no hash we
     control (ETag is the md5 of the stored JSON, not the covered content's hash), so a fixed key
     per line would force one GET per line per nightly check — the exact cost the hash-in-key
     layout of §5 eliminates. Hash-in-key is only possible because each revision has its own key.
  3. *Retries must be unambiguous.* Every PUT on a versioned key mints a new version, so a
     crash-and-retry write yields two versions of "the same revision" with no canonical one. On a
     per-revision key, a retried PUT lands on the same key: the logical trail is unchanged and the
     stray noncurrent duplicate is meaningless garbage the purge sweeps (§3.5) — this is what makes
     the relays' re-run-the-batch crash recovery safe.
  4. *Deletes must be revisions, not markers.* A versioned-key delete is a delete marker: unlocked,
     context-free, and itself deletable (removing it resurrects the hidden state). A tombstone
     written as a first-class locked revision carries `context` and is as protected as any edit.

  Versioning is therefore enabled only because compliance lock demands it, and demoted to a
  nuisance to be swept — with one load-bearing exception: a same-key overwrite attack cannot touch
  the locked original version, which is exactly what the WORM tamper tests exercise.
- **Attribution inside the revision JSON itself** (target 8 / A2). **Rejected:** this is the exact
  problem §1/§8 already solve for — the revision's lock slides forward indefinitely while a
  resource is live, so a `user:‹id›` copied into it would be undeletable personal data for as long
  as the dataset exists, not merely for one retention window. The bounded `.who` sibling (§3.1)
  exists precisely to give this a home with a bound.
- **Names/emails in `.who`** (target 8 / A2). **Rejected on minimization grounds** (§8.1): a name or
  email would remain readable inside the locked sibling for up to 180 days after a directory-side
  erasure, which a bare id does not — the id degrades gracefully into a dangling pseudonym instead.
- **In-app geo-IP resolution (e.g. a bundled MaxMind database)** (target 8 / A2). **Rejected:** the
  trusted reverse-proxy ingress already enriches every request with `X-Country`/`X-ASN`/`X-ASN-Org`
  computed from the same class of GeoLite2-derived data; an in-app dependency would duplicate that
  infrastructure work and widen the surface of stored data (an app-side database to keep current,
  a second place geo logic can drift) for no capability gain. Environments without the enriched
  proxy simply store no geo — never a fallback lookup.
- **Journal-event-id pointer in the revision context** (target 8 / A2, the pre-`.who` sketch).
  **Rejected:** a pointer into a *mutable* store (the journal/events collection) adds no
  tamper-proofing over the date-based join §1 already performs — it would still be trivially
  forgeable by the same in-scope adversary who can forge the outbox stamp (§1's first-write-lie
  limit), and it does nothing for lines, where no per-line journal event exists at all. The join
  stays date-based where the journal exists; `.who` covers where it doesn't.
- **`keyRef` as an additive field on `RevisionContext`** (the A2 assessment note's original sketch,
  superseded by `who.apiKey.id`). **Rejected** once the `.who` sibling existed: putting even an
  *opaque* key reference in the permanently-locked context would widen that object's surface for no
  benefit — the sibling already carries exactly this fact under its own bounded, purge-enforced
  retention, keeping the WORM-forever revision free of even opaque actor references.

## 14. Deferred scope & future directions

Parked deliberately to keep this iteration focused on data-fair's three dataset targets. None
is precluded by the design above; each is an additive step.

- **Generalization to `@data-fair/lib-node`.** The capability is factored as a self-contained
  module (§4) but kept inside data-fair for now. Promoting it to a shared package — so events,
  processings, catalogs, … can adopt it — is a packaging change, not a redesign. The `‹service›`
  segment already reserved in the key layout (§3.1) is the only forward-compat hook needed. The
  single-bucket-per-service decision would then be revisited (one shared bucket vs. one per
  service).
- **Immutable append-only *log posture* (events, HTTP logs, …).** An *entirely* write-once
  store can invert the mirror model: S3 becomes the **authoritative immutable log** and the DB a
  disposable, rebuildable projection (§3.5). For the `events` collection this is the most elegant
  application — it moves the ever-growing activity log onto cheap locked cold storage, directly
  slaying the "infinite DB growth" concern of §1, with integrity that is *intrinsic* (the log is
  object-locked) and a projection that is *rebuildable*, not merely checkable. It brings its own
  machinery, though: a single-revision-per-event guarantee enforced by the checker, an optional
  `If-None-Match: *` conditional-create optimization (needs a versioning + compliance-lock interop
  spike on Scaleway), and a fixed time-based retention (~1 year was the working number, replacing
  today's keep-forever). Deferred as a **family** — events, HTTP request logs, and any other
  append-only journal share this posture.
- **Level 3 — the tamper-evident freeze (assessed 2026-07-23, notes in
  [2026-07-23-integrity-level3-lock-notes.md](../plans/2026-07-23-integrity-level3-lock-notes.md)).**
  A superadmin dataset lock, recorded as first-class trail revisions (`lock`/`unlock`, with
  `reason`) — the Mongo flag is only the write-path mirror, cross-checked like
  `integrity.active`. Prevention proper is unattainable (hot stores are mutable; enforcement is
  app code the in-scope adversary bypasses), so the honest guarantee is: **while frozen, any
  change by anyone through any path becomes a permanent breach record — any post-lock revision
  is automatically illegitimate — and unfreezing is itself a permanent audited event.** That
  mechanically closes §1's self-laundering first-write lie for frozen datasets (today caught
  only by human trail-vs-journal review). Key conclusions: (a) the strong/weak knob is
  **checker policy** (is a superadmin `unlock` revision honored?), not storage location — both
  modes live in the store, with the mode recorded *inside* the compliance-locked lock revision
  so it cannot be downgraded, and the relay never minting lock/unlock operations from outbox
  stamps; (b) within the threat model (tenant admin, who cannot call the superadmin route)
  **the reversible lock is as strong as the permanent one**, while permanent mode collides
  with upgrade scripts, GDPR rectification, deletion/erasure (§8) and is operationally bounded
  by renewal anyway — so the product is the reversible lock, "permanent" at most a recorded
  intent flag; (c) **partial locks** ("only processing X may write") are cut from the
  integrity surface: origins are claimed, not proven, so they re-open exactly the ambiguity
  the full lock removes — that need is served by permissions and A2's API-key-only write lock
  (process discipline, §12). Enforcement reuses the existing boundary: locked = the write
  wrapper refuses any write that would stamp `_needsHistorizing`.
- **Central integrity service.** Instead of an in-process module, a `registry`-style technical
  service could own S3-credential custody, revision-format governance across services, the
  audit/listing API (§7), storage accounting, and retention/lock-renewal orchestration — while
  the write wrapper and per-class hashing necessarily stay in-process (they intercept writes and
  read hot data). The natural split is **write path stays a library, governance/read side becomes
  a service**, operating out-of-band on the (already central) bucket. Worth revisiting if/when
  multiple services adopt the capability; unjustified while data-fair is the only adopter.
