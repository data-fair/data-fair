# Integrity — bounded attribution siblings (`.who`) + A2 — implementation plan

Design: [2026-07-22-integrity-attribution-design.md](./2026-07-22-integrity-attribution-design.md).
Branch `feat-integrity-8`. Repo protocol: test commit → impl commit per step; dev env for the
worktree is started by the maintainer; run only the related specs while iterating
(`tests/features/integrity/`). Read `api/src/integrity/README.md` invariants first.

## T1 — sibling model + pure operations (unit surface)

- `operations.ts`: `WHO_SUFFIX = '.who'`, `SIBLING_SUFFIXES = [PAYLOAD_SUFFIX, WHO_SUFFIX]`,
  `isSiblingKey(key)` (keep `isPayloadKey` for `.file`-specific consumers);
  `whoKey(owner, datasetId, i)`. Switch every sequence-shaped consumer from `isPayloadKey` to
  `isSiblingKey`: `nextIndex`, `latestKey` (operations.ts), checker `seqIndexes`
  (checker.ts:219), service revision listing (service.ts:452-453), scope audit (audit.ts:51),
  purge revKeys grouping (purge.ts:100).
- `lines-operations.ts`: `lineWhoKey(...)` = `lineRevisionKey(...) + WHO_SUFFIX`;
  `parseLineRevisionKey` returns `undefined` for sibling keys (explicit, not lexical luck) —
  this makes `foldLatestLineAnchors`, lines renewal and the purge's line-latest protection
  sibling-blind by construction.
- `WhoBody` type `{ date, user?: { id }, apiKey?: { id }, ip?, geo?: { country?, asn?,
  asnOrg? } }`; `HistorizeContextHint` gains `who?: WhoHint` (api/types/dataset/index.ts —
  canonical declaration, same pattern as the context types).
- Pure `buildWho({ userId?, apiKeyId?, ip?, country?, asn?, asnOrg? }, date): WhoBody |
  undefined` — undefined when no attributable field; drops the proxy's neutral fillers
  (`XX` / `0` / `Unknown`); skips pseudo-users (`readApiKey`).
- Unit specs: `operations.unit.spec.ts` (latestKey/nextIndex ignore `.who`; a `‹i›.who` key
  must never win latest), `lines-operations.unit.spec.ts` (parse exclusion, fold blindness),
  `buildWho` cases.

## T2 — store + config

- `store.ts`: `writeWho(key, body: WhoBody, retainUntil)` (PUT with explicit
  `ObjectLockRetainUntilDate`, same shape as `writeRevision`) and `getWho(key): WhoBody`
  (404 → undefined helper at call sites, like `getRevisionOr404`).
- Config `integrity.attribution: { active: true, retentionDays: 180 }` + env wiring
  (`INTEGRITY_ATTRIBUTION_ACTIVE`, `INTEGRITY_ATTRIBUTION_RETENTION_DAYS`) + config schema/type,
  following the existing `integrity.*` block pattern; startup assert
  `attribution.retentionDays <= retention.days`.
- API spec (`hardening.api.spec.ts` or new `attribution.api.spec.ts`): write + read-back of a
  `.who` object with a retain-until ≠ the revision's (MinIO honors per-object dates — this is
  also the dev-side proof for the §6.3 spike).

## T3 — dataset-level write path

- `whoFromReq(req): WhoHint | undefined` (integrity module, express-aware — thin adapter over
  `buildWho`: session user id, apiKeyRef accessor (T7 fills it), `req.ip`, `X-Country` /
  `X-ASN` / `X-ASN-Org`).
- Stamp sites attach `who`: dataset PATCH / file-upload default context
  (datasets/service.ts:482,535-542 — the draft path carries it through finalize untouched),
  permissions update stamp (permissions.ts:384). Propagation (`stampHistorizeMany`) and pure
  worker stamps stay who-less by design.
- Synchronous admin actions (service.ts enable / `_fix` / both restores / disable / ack): pass
  `whoFromReq(req)` into the context hint.
- `anchorDataset` (relay.ts): when the hint carries `who` AND a fresh revision is being
  written (not deduped, incl. terminal/force paths), write `whoKey(…, i)` **before** the
  revision JSON (who-first, design §1.3), retainUntil = now + attribution window; skip when
  `attribution.active` is false.
- API specs (`attribution.api.spec.ts`): user PATCH → revision + `.who` with user id/ip;
  API-key PATCH → `.who` with apiKey id (completed in T7); worker re-anchor (`_fix` after
  out-of-band tamper has `who` of the superadmin; organic finalize without session → no
  `.who`); dedupe → no `.who`; kill switch (`attribution.active=false`) → no `.who`.

## T4 — lines write path

- Route layer → `applyTransactions` plumbing: pass `whoFromReq(req)` alongside the existing
  `sessionState` / `historizeContext` params; per-line stamps (rest.ts:476-483) embed it in
  `_needsHistorizing.context.who`. TTL-worker tombstones and extender stay who-less.
- `anchorLine` (lines-relay.ts): who-first sibling write next to the line revision key
  (`lineWhoKey`), same skip rules as T3. Enable-backfill lines get the enabling admin's who
  (the stamp context set by `enableIntegrity`).
- API specs (`lines.api.spec.ts` additions or attribution spec): line create/update/delete by
  user and by API key → sibling present with the right identity; `_fix` bless carries the
  fixing superadmin; relay batch with mixed who/no-who lines.

## T5 — lifecycle: purge, renewal, trail coherence

- `purge.ts`: per-suffix retention — `retentionMsFor(key)` (attribution window for `.who`
  keys) used by the age pre-filter (:145) and its `nextEligible` contribution; scope floor
  becomes `now + min(retentionMs, attributionRetentionMs)`; `protectedKeys` never returns
  `.who` keys (the current anchor's attribution ages out — the deliberate asymmetry with
  `.file`, own test).
- Renewal non-extension: covered structurally (T1 filters) — add explicit API tests: after
  forced renewal (`needsRenewal` window manipulation as in existing renewal specs), the
  revision's retain-until moved, the `.who`'s did not.
- Trail coherence: tests that a delete-marker / shadow version on a `.who` key surfaces as an
  anomaly while it lives (tamper via test-env raw S3 endpoints, as in `trail.api.spec.ts`),
  and that a fully purged `.who` (short-retention + `ignoreAge`-style purge run) leaves a
  clean trail verdict and a kept anchor.

## T6 — read path + UI

- `service.ts`: `listRevisions` / line-revisions endpoints enrich each page item with `who`
  (per-item `getWho`, absent on 404); `GET …/_integrity/revisions/{i}` (and the line variant)
  include `who`. Permission unchanged (`readIntegrityRevisions` — owner admins).
- UI `dataset-integrity.vue`: attribution column in both history tables (user id or
  `apiKey:‹id›`, ip, country code); line-revision dialog same. i18n en+fr. No display-name
  resolution (design §3).
- API spec: owner-admin reads see `who`; response shape stable when absent.

## T7 — A2: API-key ref capture

- `req-context.ts`: `setReqApiKeyRef` / `reqApiKeyRef` accessor. `api-key.ts` middleware sets
  it on every settings-key branch (incl. adminMode+asAccount — the processings admin key path;
  verify its auth route in the spike step of this task), NOT on the resource-scoped
  `_readApiKey` pseudo-user branch.
- `whoFromReq` consumes it → `who.apiKey.id` (no `RevisionContext` change — design §5.1
  supersedes the next-actions sketch).
- API spec: write with an org API key → `.who` carries the key's opaque id and no user id
  leakage of the pseudo user; adminMode+asAccount write → key id recorded.

## T8 — A2: apiKey-only write lock

- Model: `integrity.writeLock?: 'apiKey'` set/cleared through `PUT /datasets/{id}/_integrity`
  body (superadmin both ways, existing `reqAdminMode` route); requires `integrity.active`;
  refused (400) when the dataset has application keys configured (incoherent with anonymous
  writes — design §5.2).
- Enforcement: one check in the permission layer (permissions.ts middleware resolution): a
  covered mutation (`write` class + admin-class mutations of covered content/ACLs) on a
  locked dataset without `reqSession.isApiKey` → 403 with explanatory message (i18n).
  Internal pipeline writers don't traverse the middleware — untouched. The `_integrity`
  routes themselves stay session-superadmin actions.
- UI: toggle + copy in the integrity tab (admin mode, consequence-stating confirm like
  disable); lock indicator for non-key sessions where write actions live.
- API specs: locked dataset — UI-session line write & metadata PATCH → 403; API-key write →
  200 + attributed `.who`; application-key write → 403; superadmin session write → 403 too
  (discipline applies to everyone); lock/unlock round-trip; enable-lock-without-integrity →
  400. Doc: architecture Mongo-is-a-hint list gains `writeLock` (denylisted field, tampering
  it off doesn't hide subsequent writes — they still anchor + attribute).

## T9 — docs, runbook, fixtures

- `docs/architecture/integrity.md`: §1 (trail records a kind; identity now in the **bounded
  attribution sibling**, journal join elsewhere), §3.1 key layout (`.who`), §3.4/§3.5
  (never-renewed sibling, per-suffix purge retention), §5 lines row, §7 read permissions,
  §8 GDPR rewrite (design §6.2 — CNIL journalisation, 180 d, purge-enforced deferred erasure,
  stated journal-vs-who asymmetry, Art. 15 clause), §10/§12 (A2 delivered), §13 (+ rejected:
  in-app geoIP, journal-pointer, keyRef-in-context).
- `api/src/integrity/README.md` invariants: sibling-awareness rule, who-first ordering,
  `.who` never renewed / never protected / never load-bearing.
- Scaleway runbook (`2026-07-16-scaleway-lock-prolongation-spike-runbook.md`): append the
  explicit-shorter-retain-until case (§6.3) as a pre-prod-enable checklist item.
- `docs/presentation-integrite-fr/`: attribution + write-lock rows; regen screenshots
  (`dev/capture-integrity-screenshots.ts`) — fixtures: give `fixtures-integrite-ok` a
  user-attributed revision so the screenshot shows the column.
- Privacy-policy / DPA paragraph: **out-of-repo action item** — leave a TODO note in the
  design doc's status line for the maintainer.

## Verification

Per-step: related unit + integrity API specs. Final: full `tests/features/integrity/` suite,
type ratchet (`dev/check-types-ratchet.sh` — new dataset-schema field `integrity.writeLock`
must be classified; it lives inside the already-denylisted `integrity` object so the
classification ratchet in `operations.unit.spec.ts` should stay green — verify), lint. The
§6.3 Scaleway spike is a **pre-production gate, not a merge gate** (MinIO proves the semantics
in CI).
