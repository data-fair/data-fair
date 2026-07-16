# Data integrity & traceability

> Status: **target 1 (dataset files) — level 1 detection delivered; target 2 (dataset
> metadata) — level 1 detection delivered**, then **simplified** (joint anchor, depersonalized
> context, synchronous admin actions — see
> [docs/plans/2026-07-16-integrity-simplification-design.md](../plans/2026-07-16-integrity-simplification-design.md)).
> The shared core (locked-revision store, transactional-outbox relay, sliding checker) uses a
> **single joint anchor per dataset**: one revision sequence records **both** the file md5 and the
> covered-metadata sha256 on every revision, with one verdict, one outbox stamp and one API/UI
> surface — the file and metadata parts are named inside a breach, not carried as separate anchor
> classes. The superadmin API and admin UI ship in this iteration;
> [§10](#10-decomposition--build-order) records precisely what is built vs. what remains (level
> 2 repair, applications/settings metadata, target 3). This document describes a focused
> **data-fair feature**, delivered as **three progressive targets** (dataset files → dataset
> metadata → editable-dataset collections); target 3 and level 2 each get their own
> spec → plan → implementation cycle next. Scope deliberately left out for now —
> generalization beyond data-fair, an immutable append-only **log posture** (events, HTTP
> logs), and a central integrity service — is parked in
> [§14 Deferred scope](#14-deferred-scope--future-directions).

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
What the store does **not** prevent is a **first-write lie** — whoever controls the legitimate
write path can record a false `context`. We accept this deliberately: the value is a
**transparent, append-only, auditable trail** in which a bad or out-of-band write always leaves
a mark, and rolling back to an earlier verified revision is always possible — *detection + audit
+ repair*, not cryptographic non-repudiation. This scoping is exactly why per-revision
hash-chaining and signatures are out of scope (§13).

**Trail vs. journal — the locked trail records a *kind*, not a *who*.** A revision's context
names the **category** of legitimate write (`operation` + an actor category `origin` —
`user | superadmin | worker | propagation | upgrade`), never a user identity. The reason is that
a revision is an **undeletable, compliance-locked object**: a `user:‹id›` copied into it is
personal data (pseudonymized ≠ anonymized) that a user-erasure request could no longer reach while
the dataset lives on — §8's wait-out only covers *dataset* deletion. **Identity-level attribution
lives entirely in the mutable events/journal system**, which is already anonymized when an identity
is deleted; joining the trail to the journal by date answers "*which* user" within the journal's
own lifecycle, while the locked trail answers "was this a legitimate *kind* of write" for as long
as the anchor exists. This keeps the WORM store free of personal data by construction (§8) without
losing the forensic value — legitimacy review scans the revision list for unexpected
operation/origin combinations, which needs the write *category*, not the identity.

## 2. Core model: one mechanism, three levels

There is **a single underlying mechanism**, parameterized by *level*. Levels 1 and 2 share
the same machinery; they differ only in what each revision stores.

- **Level 1 — Detection.** Every legitimate write records, in a locked S3 store, a
  **hash + traceability context** (operation, actor *category*, timestamp, optional reason —
  no user identity, see §1's trail/journal split). An integrity
  check recomputes the hot resource's hash and compares it to the latest stored hash; any
  divergence means something wrote out-of-band → breach. Cheap. **Baseline goal for every
  sensitive resource.**
- **Level 2 — Repair.** The same revision additionally stores the **full payload** alongside
  the hash. This unlocks the admin-facing diff *and* "restore the hot resource from the
  latest verified revision." An opt-in *upgrade* of level 1, applied **where the storage cost
  is reasonable**.
- **Level 3 — Prevention.** **Out of scope** here, and mechanically different: a superadmin
  marks a resource read-only even to client admins. Noted for completeness; it would be a
  separate feature, not built on this store.

Priority: **level 1 everywhere it makes sense first**, level 2 added afterward where
reasonable (it may never be reasonable for large editable datasets — see §5).

## 3. Foundational mechanism

### 3.1 The locked revision store

- A dedicated S3 bucket with **versioning enabled** and **object-lock in compliance mode**,
  with a **default bucket-level retention** so the writer need not set retention per object.
- A **revision** object is `{ hash, context, dataset, [payload] }` where:
  - `hash` — `{ md5?, sha256 }`: the md5 of the stored file (absent for non-file datasets) and
    the sha256 of the covered metadata (§5). A dataset has **one joint anchor**, so both hashes
    are recorded on **every** revision; the breach verdict names which part diverged (file /
    metadata) by comparing each half against the latest anchor's pair.
  - `context` — `{ operation, origin, date, reason? }`: the operation type, the actor
    **category** (`origin`: `user | superadmin | worker | propagation | upgrade`), a timestamp,
    and an optional free-text reason (on `fixIntegrity` only). It carries **no user identity**
    by construction (§1's trail/journal split), so it holds no personal data — see §8.
  - `dataset` — `{ id, slug }`, a small denormalized descriptor of the anchored dataset.
  - `payload` — present only at level 2 (the full covered projection / file copy).
- **Key layout (flat, id-keyed, one joint sequence per dataset):**
  `‹service›/‹owner.type›-‹owner.id›/‹resourceId›/‹i›` (zero-padded `‹i›`). There is no
  `‹class›` segment — the file and metadata parts share a **single revision sequence** indexed
  from `0`, since they always enable, anchor and check together (per-class enable was never
  exposed). Zero-padding makes the keys sort lexically == numerically, so "latest" is the
  lexical-max key and a revisions page maps to a computed index range. The goal is to retrieve a
  dataset's history from its id, not to browse — minimal traversability is fine. The per-owner
  prefix makes storage accounting a simple prefix-size query (feeds storage accounting, §9) and
  enables per-owner access scoping (§7).
- Cold storage (e.g. Scaleway **Glacier**, which supports object-lock) is acceptable for the
  historized store, since it is not on the hot read path.
- Keys are **owner-scoped** (`‹owner.type›-‹owner.id›` segment): an owner transfer therefore
  re-anchors the dataset under the new owner's prefix (one stamp re-anchors the joint sequence —
  both hashes), since the old-prefix anchors do not carry over. The old prefix's anchors simply
  age out at their existing retention — they are not migrated or deleted.

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
back** (the relay's filter is simply `{ _needsHistorizing: { $exists: true } }`). The write is
atomic with no multi-document transaction, and the relay only ever acts on already-committed state
(ordering preserved).

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

**Why not a passive change-stream mirror.** Rejected: (a) it loses the operation context, and
(b) an uncontrolled background edit *is* the breach we want to detect — catching it up would hide
exactly what we must surface.

**Fallback — Mongo-first + compensating rollback.** Where an in-document flag isn't feasible,
commit Mongo first, then write the revision, and on revision-write failure **compensate by rolling
back the Mongo operation**. This leaves a residual gap (Mongo committed, process dies before the
revision lands) — surfaced as the "not-really-a-breach" defect that a superadmin resolves via a
`fixIntegrity` revision (a no-op for hot storage, traced in the history). The outbox above is
preferred precisely because it eliminates this gap.

### 3.3 The integrity check

- Recompute the hot resource's hash and compare to the latest revision's hash.
- **Sliding scheduled checker:** data-fair runs a scheduled job that walks protected
  resources in batches and emits an alert on divergence through its normal alerting/events
  path. At scale we cannot check everything all the time, hence "sliding" coverage.
- **Admin-triggered single-resource check** reuses the same primitive on demand.
- On a confirmed divergence: alert; show a **diff** (level 2 only — requires the stored
  payload); allow a superadmin `fixIntegrity` for legitimate-but-untracked edits. `POST
  _integrity/_fix` is **synchronous**: it re-anchors the current state inline
  (`anchorDataset()`), then runs `checkDataset()` and **responds with the fresh verdict** — the
  reconcile action completes on its own await, with no outbox stamp and no waiting for the next
  sweep.
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

The lock window is therefore reframed as a fixed **protection horizon**, kept sliding
forward for long-lived resources. Two ways to do it; we adopt the standard one as primary.

**Primary — lock renewal by extension (Option B).** Compliance mode allows *increasing* (never
shortening) a retention period, so the protection horizon is kept ahead of the present by
pushing the current anchor's retain-until date forward in place — no new revision written.
This is the standard object-lock pattern (the same refresh-retention approach backup tools
such as Veeam/Kopia use). Owned by the sliding checker (§3.3): when a long-lived resource's
check passes and its horizon nears expiry, the checker extends the anchor's lock; on a
mismatch it raises a breach instead.

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
> slides forward (§3.4) so the **current state is preserved indefinitely**, while older revisions
> age out at retention so **history is recoverable only within the retention window**. A deletion
> is just a tombstone latest-revision that stops being renewed and ages out.

This gives every resource the same guarantee as a single file: current state always restorable
(level 2), any past state restorable within the retention window.

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
  its own checker in-process.
- It is nonetheless **factored as a self-contained module** (locked-revision format, write
  wrappers, checker) so that promotion to `@data-fair/lib-node` for other adopters later is a
  packaging change, not a redesign — see [§14](#14-deferred-scope--future-directions).
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
is `true` with a 1-day retention, so the capability is on by default — but it is still
opt-in **per dataset** (admin-mode `PUT /datasets/{id}/_integrity`).

`npm run dev-fixtures` seeds **two** datasets in the `dev_fixtures` org that demonstrate the
feature end-to-end:

- `fixtures-integrite-ok` — integrity enabled (one joint anchor), a compatible published update
  historizes a second revision (new file md5), and a legitimate metadata PATCH through the API
  historizes a further revision (new metadata sha256); the history tab shows the write category
  (`operation` / `origin`), not a user identity; on-demand check returns `ok`
- `fixtures-integrite-breach` — integrity enabled, then **both parts** are tampered out-of-band:
  the stored file via the dev-only `test-env/tamper-dataset-file` endpoint, and the metadata via
  a raw `test-env/patch-dataset` write (no outbox stamp) that changes `description` — so the check
  reports `status: 'breach'` with `breach: ['file', 'metadata']`. The reconcile flow is
  demonstrated in this fixture's comments: the demo re-tampers the metadata on every run because a
  legitimate covered-field write would silently re-anchor and heal the metadata half — a
  superadmin `_fix` would likewise re-anchor and return the verdict to `ok`.

The on-demand check's response is the joint verdict `{ status, breach?: ('file'|'metadata')[] }`;
the fixtures script logs `status` plus the diverged parts. (The former per-class-independence and
reconcile demos lost their purpose with the joint anchor and synchronous fix — see the
simplification design, D5.)

Note the WORM retention interacts with re-runs: a revision written today cannot be deleted
for a day (compliance lock), so re-creating a dataset with the same id and identical content
dedupes against the still-locked revision. The fixtures are `skip-if-exists` and thus run
once per environment; on a fresh environment both datasets seed automatically.

## 5. Resource taxonomy & per-class feasibility

| Resource class | Level 1 (detect) | Level 2 (repair) | Hashing |
|---|---|---|---|
| Mongo metadata docs (dataset/app metadata, settings, …) | ✅ **delivered for datasets** (target 2); applications/settings deferred | cheap — reasonable, deferred alongside file-class level 2 | canonical (stable-key-sorted) JSON of a **denylist projection** → SHA-256 |
| Data files | trivial (md5 already stored) | duplication cost — reasonable up to a size threshold | reuse existing `md5` |
| Editable (REST) dataset — **Mongo lines** (source of truth) | feasible (see below) | size/cardinality-gated | exact fold over the precomputed per-line `_hash`, sorted by `_i` |
| Editable dataset — **ES index** (derived) | n/a — rebuildable projection | n/a — repair = reindex | not historized (rebuildable projection) |

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

- **Files** default to level 1. The hash is an md5 of the file, but the **write and verify
  paths both recompute it from the *stored file*** (not from `dataset.originalFile.md5`): that
  metadata field is computed on create and, even with the maintain-on-update fix, an *out-of-band*
  edit (exactly what `fixIntegrity` reconciles) never updates it — so anchoring the metadata would
  dedupe and never re-anchor. Relay and checker therefore call the same `md5OfStorageFile(...)`,
  keeping them symmetric. Level 2 copies the file into the historized bucket and is **gated by a
  size threshold**. The historized bucket stays fully separate from the main storage bucket
  (which is unchanged), keeping the model homogeneous with the Mongo case at the cost of some
  duplication.
- **ES is not a historization target — it is a rebuildable projection.** For REST datasets
  Mongo is the source of truth; the ES index is derived (the indexer strips `_hash`/`_deleted`,
  the ES `_id` is a throwaway `nanoid`, and a full reindex rebuilds the index from Mongo). So ES
  is a pure **rebuildable projection**: its integrity is *consistency with Mongo*, **repaired by
  reindex**, and it needs no locked history of its own. The historization target reduces to the **Mongo
  lines collection** — which shrinks this "hard tail" considerably.
- **Existing primitives to build on** (verified in `api/src/datasets/utils/rest.ts`): a
  precomputed per-line `_hash` (CRC32 over stable-stringified data, `:269`), a unique monotonic
  order key `_i` (`:273`, unique index `:187`), an optional per-line revision log
  `dataset-revisions-‹id›` (mutable + TTL-able today, gated by `rest.history`), and the
  `_needsIndexing` flag+worker relay — the outbox of §3.2, already in production for Mongo→ES.
- **Level 1 (detect) = whole-state rolling fingerprint — and it can be *exact*, not statistical.**
  Scan the lines projecting only `{_id, _i, _hash}` and fold into one digest stored as a single
  locked anchor per check. Because `_hash` is **already computed and stored**, the fold needs no
  re-serialization of payloads — a cheap, index-covered scan — so the earlier "must sample →
  statistical confidence" posture is downgraded to a **fallback above a size threshold**, not the
  default. *Caveat:* `_hash` is CRC32 (non-cryptographic, chosen for conflict detection); folding
  it detects accidental/careless out-of-band writes but not a determined forger. Matching our
  threat model (detection + auditable trail + rollback, not non-repudiation) that is acceptable;
  to resist adversarial tampering, fold a parallel SHA-256 instead (recomputed, costlier). An
  explicit hash-strength choice, not an inherited default.
- **Level 2 (repair) = the §3.5 sliding-lock mirror, one anchor per line.** Each line mutation
  appends a write-once locked object `{ hash, context, snapshot? }` keyed `‹dataset›/‹lineId›/‹i›`
  — the per-resource revision shape of §3.1, just keyed per line; the latest object is that line's
  sliding repair anchor, and the existing mutable `dataset-revisions` collection is its rebuildable
  projection. Cost scales with **row cardinality × write volume**, not dataset bytes — and per §3.5
  the per-line lock renewal must be *exhaustive*, so **level 2 on a large editable dataset is an
  inevitable scalability bottleneck**: accepted, not engineered away. It stays **cardinality-gated
  and opt-in per dataset** — activated intelligently where the row count makes it affordable.
  Level 1 has no backfill and stays universal.

## 6. Atomicity & failure model

- Atomicity is **best-effort**, never perfect — though the **transactional-outbox refinement
  (§3.2)** closes the residual gap entirely where applicable (single-document flag on the
  resource, relay ships to locked S3, retry-forward). The fallback wrapper minimizes the window
  (Mongo-first, compensating rollback), and any residual gap is **surfaced as a detectable
  defect** rather than silently tolerated.
- Legitimate out-of-band writers (workers, upgrade scripts) must either go through the
  wrapper too, or be reconciled with a `fixIntegrity` revision. Failing to do so will
  (correctly) raise an integrity alert.

## 7. Access & audit

### 7.1 Endpoint & field permissions

The integrity API splits read from write:

- **Writes are superadmin-only** (`reqAdminMode`), matching the `_diagnose` pattern: `PUT
  /datasets/{id}/_integrity` (enable/disable), `POST …/_integrity/_check`, `POST
  …/_integrity/_fix`. All three are gated by admin mode (never grantable through permissions).
  `_check` and `_fix` are **synchronous** and respond with the fresh check verdict — `_fix`
  re-anchors inline, then runs the check and returns its result.
- **Reads are open to the owner account's admins** via the registered admin-class operations
  `readIntegrity` / `readIntegrityRevisions`: `GET /datasets/{id}/_integrity`, `GET
  …/_integrity/revisions`, and the `integrity` field embedded in dataset responses (which
  drives the list breach badge and the `status=error` filter row). These are enforced with the
  standard `permissions.middleware(...)` machinery, so an owner admin holds them implicitly and
  a superadmin holds them via admin mode. (There is no `realtime-integrity` operation or
  websocket channel — the admin actions are synchronous, §3.3.)
- `clean()` (`api/src/datasets/utils/index.ts`) **strips the `integrity` field** from any
  response whose reader cannot `readIntegrity`, so anonymous/unauthorized readers never see
  breach verdicts or anchors even when they can otherwise read the dataset. This also scopes the
  list breach badge to authorized readers.
- **UI:** the integrity tab is shown when the reader holds `readIntegrity` (or is in admin
  mode); the enable/disable switch and the check/fix action buttons inside it render only in
  admin mode. The status alerts and revision-history table are visible to every viewer of the
  tab.

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

- **The revision context holds no personal data by construction.** Since the trail/journal split
  (§1), a revision's `context` records only an operation type and an actor *category*
  (`origin: user | superadmin | worker | propagation | upgrade`) — never a `user:‹id›`. At level 2
  the payload is the *covered projection*, from which `createdBy` / `updatedBy` are already
  excluded (denylist §5) and the personal-info cleanup removed them from the dataset doc besides.
  So a **user-erasure** request no longer conflicts with the undeletable store at all: there is no
  identity to erase inside it. Identity attribution lives in the mutable events/journal, which is
  anonymized on identity deletion. This is what replaced the earlier "context retained even under
  GDPR pressure" stance — retention is now a non-issue for *user* erasure.
- **Bounded, owner-visible retention = protection horizon.** The compliance-lock duration is
  a single fixed window that serves two roles at once (see §3.4): the protection horizon for
  long-lived resources, and the **maximum lag between a resource's deletion and full erasure
  of its history**. While a resource is live, lock renewal (§3.4) keeps it protected — and
  its data cannot be erased anyway, as it is still in the hot store. Once the resource is
  deleted, renewal stops and the tail ages out (auto-unlock + purge of non-fresh revisions)
  within one window.
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

## 9. Storage accounting (internal to data-fair)

No separate billing surface. Historized storage is **counted toward the owner's existing
static-content / storage quota**: the per-owner historized prefix size (§3.1) is added to what
data-fair already meters. Activating integrity for an owner is a setting, not a separately
priced product.

## 10. Decomposition & build order

Three progressive targets, easiest first. Each is its own spec → plan → build cycle and ships
**level 1 (detect) then level 2 (repair)** — the levels stay separate (§2), so a target can run
detect-only where repair is too costly. The shared core primitive (locked-revision format,
write wrapper, checker) is **extracted from target 1 and reused**, not built up front as a
speculative framework.

1. **Dataset data files** — ✅ **level 1 (detect) + lock renewal delivered.** The relay historizes
   the *stored file's* md5 on every finalize (transactional outbox, §3.2); the sliding checker
   recomputes and compares it, raising a breach on divergence (§3.3); and it now **renews the
   anchor's lock by extension** (§3.4 Option B) — pushing the compliance retain-until forward on a
   ~monthly cadence (`RENEW_INTERVAL = 1/12` of the retention window) so the current state stays
   protected indefinitely, and surfacing a loud `lastRenewal: failed` state (alert + UI warning) if
   a provider rejects the prolongation. The superadmin enable/disable/check/fix API plus the admin
   UI panel (§7) are wired end to end. Lock prolongation is **validated on Scaleway** (spike,
   2026-07-16 — §12), so renewal-by-extension stands as the primary model on the target provider.
   **Immediate next step for this target:** *level 2 (repair)* — copy the file into the historized
   bucket, size-gated. Re-anchoring (§3.4 Option A) is not needed for Scaleway; it remains a
   portability note for providers that cannot prolong a lock.
2. **Dataset Mongo metadata** — ✅ **level 1 (detect) delivered this iteration, for datasets**,
   then folded into the **joint anchor** (§3.1). A dataset has one revision sequence carrying
   **both** the file md5 and the covered-metadata sha256, one verdict
   (`integrity.lastCheck: { status, breach?: ('file'|'metadata')[] }`) and one outbox sub-doc
   (`_needsHistorizing: { context? }`, §3.2). Level 1 hashes a canonical (stable-key-sorted) JSON
   serialization of the dataset document **minus an operational denylist**, with denormalized names
   normalized out (D1, §5) → SHA-256, recomputed fresh from Mongo at check time (not from the
   caller's possibly-cleaned/projected copy). The legitimate write paths are instrumented end to
   end: `applyPatch` (metadata-field patches, gated by `coveredPatchKeys`), permissions changes,
   `changeOwner`, and the four covered-content propagation writers (funneled through
   `stampHistorizeMany`, §5). Superadmin API and admin UI (§7) cover file and metadata uniformly
   (per-class enable was never exposed — enabling integrity anchors both together).
   **Explicitly deferred:** applications and settings metadata (this iteration covers **datasets
   only**); level 2 (payload snapshots, diff, restore) — file and metadata level 2 stay a single
   follow-on unit of work since they share the same payload-storage machinery.

   **Simplification (2026-07-16,
   [design](../plans/2026-07-16-integrity-simplification-design.md)).** After targets 1+2 landed,
   the two integrity PRs were simplified into the shape this document now describes: the
   file/metadata classes collapsed into **one joint anchor** (D2); the revision context was
   **depersonalized** to an actor category (trail/journal split, D3); the admin actions (enable /
   fix) became **synchronous**, deleting the realtime websocket channel (D4); denormalized names
   were **normalized out** of the covered hash, dropping the six name-sync stamps (D1); and the
   tests/fixtures/UI were trimmed accordingly (D5) — a net deletion.
3. **Editable (REST) datasets** — ⏳ **later.** *ES is not historized* (rebuildable projection,
   repair = reindex). Target is the Mongo lines collection: level 1 = exact rolling fold over the
   precomputed per-line `_hash` (sample only past a threshold); level 2 = the per-line locked
   log (§5), reusing `dataset-revisions` as the projection, cardinality-gated. The hard tail —
   level 1 stays universal, level 2 is gated.

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

## 12. Open questions / risks

- **Scaleway "prolong lock" bug — RESOLVED (2026-07-16).** A reported defect (the Veeam
  incompatibility) supposedly broke *prolonging* an existing lock — the exact operation our
  primary lock-renewal model (extension, §3.4 Option B) depends on. The validation spike
  **did not reproduce it**: `PutObjectRetention` (COMPLIANCE, later retain-until) works on
  Scaleway fr-par with and without version-id, on inline and default-retention locks, on
  Standard and Glacier classes, while shortening/deleting are correctly refused
  (`docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md`). Option B is no
  longer blocked; re-anchoring (Option A) stays a portability fallback only.
- **Editable-dataset hashing — reframed, far narrower than first feared (§5).** ES drops out
  (rebuildable projection); only the Mongo lines collection is a target; level 1 is an *exact*
  fold over the precomputed `_hash` (sampling only past a threshold); level 2 is the §3.5 per-line
  locked log, cardinality-gated. The one genuinely open decision is **hash strength**: reuse the
  existing CRC32 `_hash` (detects careless out-of-band writes, cheap) vs. a parallel SHA-256
  (resists adversarial tampering, recomputed). A policy call, not an architecture problem.
- **Outbox vs sharding — decided (§3.2).** The integrity write rides a flag on the resource
  document (the existing `_needsIndexing`/`commitLines` shape), not a separate collection, so the
  atomic write stays single-document and single-shard on any shard key. This is future-proof
  against later sharding of the high-volume collections; a separate outbox collection is reserved
  for collections we commit to never sharding.
- **Default retention window** — a legal/product decision per resource class (files, metadata,
  lines), pending stakeholder input. It is simultaneously the protection horizon (§3.4) and the
  maximum deletion→erasure lag (§8), so it must be assumable long-term.
- **Scope list** — exactly which data-fair resources count as "sensitive": which metadata
  collections, and which datasets opt into editable-line history.

## 13. Alternatives considered & deliberately not adopted

These are closed decisions, recorded to avoid relitigation. All three follow from the threat
model in §1 (detection + audit + repair against a tenant admin — not cryptographic
non-repudiation against the operator/provider).

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
- **Central integrity service.** Instead of an in-process module, a `registry`-style technical
  service could own S3-credential custody, revision-format governance across services, the
  audit/listing API (§7), storage accounting, and retention/lock-renewal orchestration — while
  the write wrapper and per-class hashing necessarily stay in-process (they intercept writes and
  read hot data). The natural split is **write path stays a library, governance/read side becomes
  a service**, operating out-of-band on the (already central) bucket. Worth revisiting if/when
  multiple services adopt the capability; unjustified while data-fair is the only adopter.
