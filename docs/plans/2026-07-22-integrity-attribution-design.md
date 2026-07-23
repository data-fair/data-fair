# Integrity — bounded attribution siblings (`.who`) + API-key attribution & write lock (A2)

> Status: **built, 2026-07-23** — attribution only: **T8 (apiKey-only write lock) was built then
> extracted (reverted) on 2026-07-23** — the maintainer reclassified it as part of the level-3
> locking plan studied on `feat-integrity9` (tamper-evident freeze,
> `2026-07-23-integrity-level3-lock-notes.md`), so both lock surfaces get designed together there.
> §5.2 below is kept as the original sketch that plan inherits. Otherwise T1-T7+T9 built — see `docs/architecture/integrity.md` §1/§3.1/§3.4/§3.5/
> §5/§7/§8/§10/§12/§13 and `api/src/integrity/README.md`. **Out-of-repo action item for the
> maintainer:** add the 180-day attribution-retention clause to the privacy policy / DPA (§6.2 —
> the stated journal-vs-`.who` asymmetry must be documented there, not only here). Branch:
> `feat-integrity-8`. This iteration folds
> two threads into one delivery: (1) per-revision **actor attribution** (user id, API-key ref,
> IP, geo) stored in **separate locked sibling objects with a short, fixed, never-renewed
> retention**, and (2) the previously-assessed **A2** pair — API-key attribution and the
> per-dataset **apiKey-only write lock** (see
> `2026-07-22-integrity-next-actions-notes.md` §A2). Read `docs/architecture/integrity.md`
> (esp. §1 trail/journal split, §3.1, §3.4, §3.5, §8) and `api/src/integrity/README.md` first.

## 0. Problem & decisions taken

The trail records a write **category** (`origin`), never an identity — because the anchor's lock
slides forward indefinitely (§3.4), a `user:‹id›` inside it would be personal data no erasure
could ever reach. The identity join lives in the mutable journal — but that join is **weak**
(date-based) and **impossible for lines** (there is no per-line journal event at all).

The resolution: attribution does not need to live as long as the anchor. A **sibling object**
per revision, compliance-locked for a **short fixed window and never prolongated**, gives
tamper-proof attribution for that window while guaranteeing bounded retention — the CNIL
journalisation model, applied to the WORM store.

Decisions locked in with the maintainer (2026-07-22):

- **Lines are covered from the start** — they are precisely where the journal join does not
  exist.
- **Attribution retention: 180 days** (own config knob, distinct from the 365-day trail
  retention). Comfortably inside the CNIL journalisation band (délib. 2021-122: 6 months,
  extensible to 1 year with justification).
- **Owner admins can read attribution** (same `readIntegrityRevisions` gate as revisions), not
  superadmin-only: it is the owner's own audit trail of their own account's activity.
- **Geo comes from trusted reverse-proxy headers**, not an in-app MaxMind dependency: the
  haproxy L1 ingress (see `~/koumoul/env-staging3/manifests/data-fair/ingress-haproxy1/`,
  helm values `helmconfigs/ingress-haproxy1.yaml`) enriches every request with `X-Country`,
  `X-ASN`, `X-ASN-Org` from GeoLite2-derived map files and **forces `X-Forwarded-For` to the
  real client IP**. data-fair only reads headers; environments without the enriched proxy
  simply store no geo. `app.set('trust proxy', 1)` is already in place, so `req.ip` is the
  client IP.
- **Folds with A2**: the API-key ref rides the same attribution object, and the apiKey-only
  write lock ships in the same branch (shared plumbing, shared UI panel work).

## 1. Data model

### 1.1 The `.who` sibling

Every locked revision MAY have a sibling object at `‹revisionKey›.who` (the `WHO_SUFFIX`),
exactly parallel to the level-2 `.file` payload sibling:

- dataset level: `data-fair/‹owner›/‹dsId›/‹paddedI›.who`
- line level: `data-fair/‹owner›/‹dsId›/lines/‹encodedLineId›/‹paddedI›-‹sha|deleted›.who`

Body (`WhoBody`):

```jsonc
{
  "date": "…ISO…",              // stamp date (mirrors context.date semantics)
  "user": { "id": "…" },        // session user id — NO name, NO email (minimization, §6.4)
  "apiKey": { "id": "…" },      // opaque API-key id when the write was key-authenticated (A2)
  "ip": "203.0.113.7",          // req.ip (client IP — X-Forwarded-For forced at L1)
  "geo": { "country": "FR", "asn": 3215, "asnOrg": "Orange" }   // from trusted headers, optional
}
```

Every field except `date` is optional — a worker-origin revision typically has none and then
**no `.who` object is written at all** (no empty siblings).

### 1.2 Lock lifecycle — the whole point

- Written with an **explicit per-object `ObjectLockRetainUntilDate` = now +
  `config.integrity.attribution.retentionDays` (default 180)**. The store already sets explicit
  retain-until on every PUT (`store.ts`), so a different value per suffix is a parameter, not a
  bucket change.
- **Never extended.** Dataset renewal (`maybeRenew`) extends the latest revision JSON + the
  referenced `.file`; lines renewal extends live line anchors. Neither touches `.who` — and the
  design makes that structural, not accidental (siblings are filtered out of every anchor set
  before renewal runs, §4).
- **Purged at expiry** by the existing daily purge — with one required change (§4.3): the age
  pre-filter must know the per-suffix retention, or `.who` objects would silently linger to the
  365-day horizon and break the 180-day promise.
- **Never a dedupe target, never referenced, never load-bearing**: losing a `.who` (crash,
  early purge, disabled attribution) degrades a revision to "unattributed", exactly today's
  state — no verdict, no restore, no renewal depends on it.

### 1.3 Write ordering — who-first

`.who` is written **before** its revision JSON (same rationale shape as payload-first, §3.1,
but driven by retry-forward): if the revision write crashes, the relay's retry recomputes the
same index/key and re-PUTs both (the stray `.who` version is swept garbage). The reverse order
would lose attribution forever on that crash — the retry dedupes against the landed revision
and returns early, so the `.who` would never be written. An orphan `.who` whose revision never
lands is bounded personal-data residue that ages out at 180 days.

Collapse semantics (documented, accepted): the async relay dedupes multiple stamps into one
revision — attribution records the **last** stamper before the drain. The first-write-lie limit
(§1 of the architecture doc) applies to attribution identically: it is as truthful as the
writer. What the sibling adds is that attribution, once written, is **tamper-proof until it
expires**.

## 2. Write path — threading `who` through the outbox

### 2.1 Capture at the HTTP boundary

New helper (misc/utils or integrity module): `whoFromReq(req): WhoHint | undefined` —

- `user.id` from `reqSession(req).user?.id` (skip pseudo-users like `readApiKey`);
- `apiKey.id` from the new req-context accessor set by the api-key middleware (§5.1);
- `ip` from `req.ip`;
- `geo` from `X-Country` / `X-ASN` / `X-ASN-Org` when present (drop haproxy's neutral defaults
  `XX` / `0` / `Unknown` — never store filler).

`HistorizeContextHint` gains an optional `who?: WhoHint`. The hint lives in the **mutable Mongo
outbox stamp** (`_needsHistorizing.context`) — transient personal data in Mongo, erased when
the flag clears, no GDPR concern.

### 2.2 Stamp sites (dataset level)

- `applyPatch` / dataset `PATCH` route and the file-upload flow (`datasets/service.ts:535`,
  default context construction): attach `whoFromReq(req)`; the draft path already preserves
  `draft._needsHistorizing` through finalize, so the **original uploader's** attribution rides
  through to the anchor written at finalize (origin stays `worker`, who stays the uploader —
  the operation carries both facts).
- `permissions.ts:384` (permissions update stamp): attach who — ACL changes are among the
  highest-forensic-value writes.
- Synchronous admin actions (`service.ts`: enable / `_fix` / both restores / disable / ack):
  pass who straight to `anchorDataset` — these run inline in the request.
- **Propagation stamps (`stampHistorizeMany`) deliberately carry no who**: they are
  consequences of an account-level action whose attribution lives in the journal at that level;
  fabricating a per-dataset who would be noise. Same for pure worker stamps.

### 2.3 Stamp sites (lines)

`rest.ts` line stamping (`applyTransactions`, `:476-483`) already holds `sessionState`; the
route layer passes `whoFromReq(req)` down alongside it (same plumbing as `historizeContext`).
Every stamped line carries the who hint; the TTL worker's tombstones carry none.

### 2.4 Relay writes

- `anchorDataset` (`relay.ts`): when the effective context hint has a `who` and a new revision
  is actually being written (not deduped), PUT `‹i›.who` (who-first, §1.3) with the attribution
  retain-until, then the revision JSON as today. Deduped anchor → no who written.
- `anchorLine` (`lines-relay.ts`): same, sibling of the line revision key. This **doubles the
  relay's S3 PUTs** for attributed line writes — accepted (assessment 2026-07-22): bounded by
  the 100k-line gate, batch-concurrency unchanged, enable-backfill (`operation: 'enable'`,
  origin worker/superadmin with who = the enabling admin) roughly doubles in wall-clock.

## 3. Read path

- `GET …/_integrity/revisions` (paged, ~10/page) and `GET …/_integrity/lines/{lineId}/revisions`:
  enrich each page item with its `.who` body when the sibling exists (one GET per item, 404 →
  absent). Permission: unchanged `readIntegrityRevisions` — owner admins see attribution.
- `GET …/_integrity/revisions/{i}` (diff endpoint): include `who` alongside the snapshot.
- UI (`dataset-integrity.vue`): the revision-history tables gain an attribution column —
  user id (or API-key ref), IP, country flag/code when present. Line revision dialog likewise.
  Raw ids are shown as stored; display-name resolution is deliberately NOT built (a name lookup
  would re-personalize what minimization stripped; the id is meaningful to the owner admin and
  resolvable through the directory while the user exists).

## 4. Sibling-awareness sweep (the load-bearing part)

`.who` must be invisible to everything that treats prefix listings as the revision sequence.
Generalize `isPayloadKey` into a sibling concept: `SIBLING_SUFFIXES = ['.file', '.who']`,
`isSiblingKey(key)`. Audited consumers:

### 4.1 Dataset-level sequence

- `nextIndex`, `latestKey` (`operations.ts:106-120`) — **without filtering, `‹i›.who` sorts
  lexically after `‹i›` and would be picked as the latest revision**; switch to `isSiblingKey`.
- checker `seqIndexes` (`checker.ts:219`), date-skew loop, service revision listings
  (`service.ts:452`), scope audit (`audit.ts:51`) — same switch.

### 4.2 Line sequence

- `parseLineRevisionKey` (`lines-operations.ts:32`) must return `undefined` for sibling keys —
  today a `‹i›-‹sha›.who` key would parse as a revision with garbage sha and only lexical luck
  keeps the fold correct. Explicit, tested exclusion.
- `foldLatestLineAnchors` / `latestLineAnchors` are then safe by construction; lines renewal
  (`maybeRenewLines`) never sees siblings → never extends them (structural non-renewal).
- purge `sequenceId` grouping already groups siblings with their sequence (suffix-agnostic) —
  verified, no change.

### 4.3 Purge — per-suffix retention (required correctness fix)

The purge's age pre-filter and watermark math assume one global retention ("a lock is never
earlier than lastModified + retention", `purge.ts:145-148`). With a 180-day `.who` that
assumption **keeps too long**: the pre-filter would skip `.who` objects until 365 days, and the
GDPR promise silently becomes 365 days. Changes:

- pre-filter: `retentionFor(key) = isWhoKey(key) ? attributionRetentionMs : retentionMs`;
- scope `nextEligible` floor: `now + min(retentionMs, attributionRetentionMs)` (a fresh `.who`
  becomes deletable sooner than a fresh revision);
- `protectedKeys`: `.who` siblings are **never** in the protected set — the current anchor's
  attribution ages out while the anchor itself stays protected. This is the single deliberate
  asymmetry with `.file` and gets its own test.
- `hasLapsed` already reads the real per-version retain-until — decides correctly unchanged.

### 4.4 Trail coherence (verdict 2)

- While a `.who` lives, it participates in the versions walk: **delete-marker and
  version-divergence anomalies on `.who` keys are detected** — shadowing or hiding an
  attribution object is tampering and must surface. No change needed (the fold is key-generic);
  add tests.
- `.who` keys are excluded from sequence-gap (via §4.1) and date-skew (context is only read
  from revision JSONs).
- A **purged** `.who` vanishes wholly (all versions deleted) → no anomaly — aging out is
  silent by design, matching revision aging.
- Ack fingerprints pin version sets per key — work unchanged for `.who` anomalies.

### 4.5 Storage accounting

`storage.ts` sums all versions under the owner prefix — `.who` bytes count automatically
(negligible). No change.

## 5. A2 — API-key attribution & write lock

### 5.1 `apiKey.id` capture (A2 idea 1, reshaped)

The next-actions note proposed `keyRef` **in the revision context**; with the `.who` sibling
that home is better: the key id goes in the attribution object (`who.apiKey.id`) — same
GDPR-through-expiry posture as the user id, and the revision context stays exactly as lean as
today. (The note's "additive optional field on RevisionContext" is therefore NOT done.)

- `api-key.ts` middleware: after `readApiKey` resolves, record the matched key's opaque id in a
  req-context accessor (`setReqApiKeyRef` in `misc/utils/req-context.ts`, mirroring
  `setReqBypassPermissions`). Covers every branch that resolves a settings key — including the
  adminMode+asAccount path used by the processings admin key. The resource-scoped
  `_readApiKey` pseudo-user branch sets none (read-only key, never writes).
- `whoFromReq` reads the accessor.

### 5.2 apiKey-only write lock (A2 idea 2)

Honest framing (unchanged from the note): **process discipline, not threat-model extension** —
no accidental UI edits, every legitimate write attributed to a revocable credential; combined
with `who.apiKey.id` the trail↔journal review becomes near-mechanical for locked datasets.

- **Model**: `integrity.writeLock: 'apiKey'` (absent = unlocked), managed through the existing
  superadmin `PUT /datasets/{id}/_integrity` body (both lock and unlock are superadmin, riding
  the route's existing `reqAdminMode` gate — "a dataset frozen because all its keys were
  revoked is the feature"). Requires `integrity.active` (the lock is an integrity posture).
  `integrity` is already in the covered-hash denylist — acceptable: tampering the flag off
  doesn't hide subsequent writes (they still stamp, anchor and attribute normally); document
  this in the architecture doc's Mongo-is-a-hint list.
- **Enforcement**: one central check in the permission layer (`permissions.ts` middleware
  resolution), not scattered in routes: when the resource is a dataset with
  `integrity.writeLock === 'apiKey'` and the operation's class is a covered mutation
  (`write` + the `admin`-class mutations that change covered content or ACLs), refuse with a
  403 and an explanatory message unless `reqSession.isApiKey`. Scope details:
  - covers **lines AND metadata** (coherence, per the note's leaning);
  - the `_integrity` admin routes themselves stay superadmin-session actions (not key-gated);
  - internal pipeline writers (finalize, extenders, TTL worker) never traverse the middleware —
    allowed by construction ("consequences of already-authorized writes");
  - **application-key writes are refused** (they are un-connected pseudo-sessions, not API
    keys) — a dataset can't hold `writeLock` and anonymous-write app keys coherently; document.
- **UI**: toggle + explanatory copy in the integrity tab (visible with `readIntegrity`,
  actionable in admin mode, confirm dialog like disable), plus a lock indicator surfaced where
  write actions are hidden/disabled for non-key sessions.

## 6. Config, GDPR & ops

### 6.1 Config

```
integrity.attribution: {
  active: true,          // kill switch for deployments that must not store IPs at all
  retentionDays: 180     // must be ≤ integrity.retention.days; validated at startup
}
```

Env wiring like the rest of the block: `INTEGRITY_ATTRIBUTION_ACTIVE`,
`INTEGRITY_ATTRIBUTION_RETENTION_DAYS`. When inactive: no `.who` is ever written; existing
`.who` objects still age out (purge logic stays suffix-aware unconditionally).

### 6.2 GDPR posture (to fold into architecture §8)

- **Lawful basis**: security/integrity journalisation (legitimate interest) — the data set
  (user id, timestamp, operation, IP) is exactly CNIL délib. 2021-122's journalisation scope;
  180 days sits mid-band.
- **Erasure**: deferred ≤ 180 days after write, **actively performed by the owned purge** — the
  same deferred-erasure-on-WORM doctrine §8 already invokes, now applied at the individual-user
  level with a much shorter bound than the owner-level wait-out. The non-renewal is what makes
  the promise unconditional.
- **Stated asymmetry**: journal anonymization on identity deletion stays immediate; `.who`
  attribution survives up to 180 days after the write — that IS the feature (tamper-proof
  attribution), documented plainly in the privacy policy / DPA (**action item, out of repo**).
- **Art. 15**: subject-access answered by the standard journalisation clause ("attribution
  records retained ≤ 180 days for integrity purposes"); no per-user index is built now (flagged
  as a possible later mutable Mongo index if a DPO requires enumeration).
- **Minimization**: id-only (no name/email — a name would stay readable after directory
  erasure; a bare id degrades into a dangling pseudonym), raw IP + proxy-computed coarse geo
  only, no storage of neutral filler values.

### 6.3 Provider spike (before prod enable)

One aws-cli case to append to the Scaleway runbook
(`2026-07-16-scaleway-lock-prolongation-spike-runbook.md`): **PUT with an explicit
`ObjectLockRetainUntilDate` shorter than the bucket's default retention** — standard S3
semantics say explicit overrides default in both directions at creation; verify on Scaleway
(fr-par, Standard + Glacier). MinIO honors it (dev/test coverage is native). Low risk; the
fallback if refused is a bucket without default retention (we set explicit dates everywhere
already).

### 6.4 Explicitly rejected in this design

- **Attribution inside the revision JSON** — undeletable personal data under the sliding lock;
  the entire §0 problem.
- **Names/emails in `.who`** — minimization; see §6.2.
- **In-app geo-IP resolution (MaxMind)** — the trusted-proxy headers already exist
  (staging haproxy L1); an app dependency duplicates infrastructure work and widens stored data.
- **Journal-event-id pointer in the revision context** — pointer to a mutable store adds no
  tamper-proofing; the join stays date-based where the journal exists, and `.who` covers where
  it doesn't.
- **`keyRef` in `RevisionContext`** (the original A2 sketch) — superseded by `who.apiKey.id`
  (§5.1): keeps the WORM-forever surface free of even opaque actor references.

## 7. Testing (summary — the plan details cases)

- **Unit** (`operations.unit.spec.ts` + new): sibling filters (`latestKey`/`nextIndex`/
  `parseLineRevisionKey` vs `.who` keys), `whoFromReq` (header parsing, neutral-value
  dropping), purge pre-filter dual retention + watermark floor, protected-set excludes `.who`.
- **API** (`tests/features/integrity/`): attribution written on user/API-key writes (dataset
  patch, file upload through draft, line transactions), readable by owner admin in both
  revision endpoints, absent for worker/propagation writes; `.who` never renewed while its
  revision is (retention read-back); purge deletes lapsed `.who` while keeping the protected
  anchor (ignoreAge-style test with short retention); trail verdict clean after `.who` aging;
  marker/divergence on a `.who` key surfaces as anomaly; writeLock: UI-session write → 403,
  API-key write → ok + `who.apiKey.id` recorded, application-key write → 403, superadmin
  lock/unlock via `PUT _integrity`; attribution kill-switch writes no `.who`.
- **Existing suites green** — the sweep in §4 touches verdict-bearing code.

## 8. Documentation updates (with the build)

- `docs/architecture/integrity.md`: §1 (trail/journal split — now "category in the trail,
  identity in the bounded sibling, journal join elsewhere"), §3.1 (key layout: `.who`), §3.4/
  §3.5 (non-renewal + per-suffix purge), §5 (lines), §7 (read permissions), §8 (GDPR rewrite
  per §6.2), §12 (A2 closed), §13 (rejected alternatives from §6.4).
- `api/src/integrity/README.md` invariants: sibling-awareness rule, who-first ordering,
  never-renew/never-protect `.who`.
- `docs/presentation-integrite-fr/`: attribution + write lock rows (screenshots regen).
- Runbook: the §6.3 spike case.
