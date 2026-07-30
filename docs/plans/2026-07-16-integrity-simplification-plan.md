# Integrity Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the five approved simplification decisions (D1–D5 of [the design](2026-07-16-integrity-simplification-design.md)) to the integrity module: joint anchor, depersonalized context, synchronous admin actions without the WS channel, name-normalized hash with fewer propagation stamps, and merged tests/fixtures.

**Architecture:** One PR on `feat-integrity3`, commits per task. The core module (`api/src/integrity/`) is reshaped once with the combined D2+D3+D4 shape (implementing them sequentially would rewrite the same files three times); D1's stamp-site cleanup and D5's test/fixture/UI trims follow. No migration (nothing enrolled in prod).

**Tech Stack:** Node/TS (`api/`), Vue 3 + Vuetify (`ui/`), Playwright tests, MinIO for the WORM store in dev/test.

## Global Constraints

- Never expose per-class anchors again: key layout is `data-fair/‹owner.type›-‹owner.id›/‹datasetId›/‹i›`, one sequence per dataset.
- Revision context is `{ operation, origin, date, reason? }` with `origin: 'user' | 'superadmin' | 'worker' | 'propagation' | 'upgrade'` — **no user ids anywhere in the WORM store**.
- The relay/checker read S3 as the authority; `integrity.lastRevision` stays a display/renewal hint only.
- `permissions` and `publicationSites` remain covered by the hash (ACL/visibility); only *display names* are normalized out.
- Run only integrity-related tests while iterating (`npx playwright test tests/features/integrity/`); the full suite runs in the pre-push hook.
- All commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Reshape `operations.ts` + `outbox.ts` (TDD via the unit spec)

**Files:**
- Modify: `api/src/integrity/operations.ts`
- Modify: `api/src/integrity/outbox.ts`
- Test: `tests/features/integrity/operations.unit.spec.ts`

**Interfaces (produces — every later task consumes these):**
- `revisionPrefix(owner, datasetId): string` and `revisionKey(owner, datasetId, i): string` — no class parameter.
- `coveredMetadata(dataset)` — adds D1 normalization (owner/topics/permissions/shareOrgs names stripped).
- `RevisionOrigin`, `RevisionContext = { operation, origin, date, reason? }`, `HistorizeContextHint = { operation, origin, reason? }`.
- `stampHistorize(update, context?)` — no classes parameter; sets the whole `_needsHistorizing` sub-doc via `$set`.
- `stampHistorizeMany(filter)` (outbox.ts) — stamps with `origin: 'propagation'`.
- Deleted: `IntegrityClass`, `INTEGRITY_CLASSES`, `parseRevisionClass`, `buildContext`, `coveredPatchKeys` stays.

- [ ] **Step 1: Rewrite the unit spec for the new shapes**

Replace `tests/features/integrity/operations.unit.spec.ts` entirely. Keep the `padIndex`, `nextIndex`, `latestKey`, `needsRenewal` (3 tests), `coveredMetadata` (denylist + nested churn + readApiKey), `metadataHash` stability and `coveredPatchKeys` tests as they are **except**: drop the class argument from every `revisionPrefix`/`revisionKey` call and expectation (`'data-fair/organization-acme/ds1/'`, `'data-fair/organization-acme/ds1/000000007'`), delete the `parseRevisionClass` and `buildContext` tests, and replace the two `stampHistorize` tests with:

```ts
test('stampHistorize sets the outbox sub-doc, with and without context', () => {
  const update: any = { $set: { permissions: [] } }
  ops.stampHistorize(update, { operation: 'update', origin: 'user' })
  expect(update).toEqual({
    $set: { permissions: [], _needsHistorizing: { context: { operation: 'update', origin: 'user' } } }
  })
  const bare: any = {}
  ops.stampHistorize(bare)
  expect(bare).toEqual({ $set: { _needsHistorizing: {} } })
})
```

Add the D1 normalization tests:

```ts
test('coveredMetadata strips denormalized display names (owner, topics, permissions, shareOrgs)', () => {
  const doc = {
    id: 'ds1',
    owner: { type: 'organization', id: 'acme', name: 'ACME Corp', department: 'dep1', departmentName: 'Dept One' },
    topics: [{ id: 't1', title: 'Topic One', color: '#f00', icon: { name: 'x', svgPath: 'y' } }],
    permissions: [{ type: 'user', id: 'u1', name: 'User One', classes: ['read'] }],
    masterData: { shareOrgs: [{ id: 'o2', name: 'Org Two' }], other: 'kept' }
  }
  expect(ops.coveredMetadata(doc)).toEqual({
    id: 'ds1',
    owner: { type: 'organization', id: 'acme', department: 'dep1' },
    topics: [{ id: 't1' }],
    permissions: [{ type: 'user', id: 'u1', classes: ['read'] }],
    masterData: { shareOrgs: [{ id: 'o2' }], other: 'kept' }
  })
})

test('metadataHash is stable across a pure display-name rename', () => {
  const base = { id: 'ds1', owner: { type: 'organization', id: 'acme', name: 'Old Name' }, topics: [{ id: 't1', title: 'Old' }] }
  const renamed = { id: 'ds1', owner: { type: 'organization', id: 'acme', name: 'New Name' }, topics: [{ id: 't1', title: 'New' }] }
  expect(ops.metadataHash(base)).toBe(ops.metadataHash(renamed))
  // but an owner-identity change (the id, not the name) changes the hash
  const moved = { ...base, owner: { type: 'organization', id: 'other', name: 'Old Name' } }
  expect(ops.metadataHash(base)).not.toBe(ops.metadataHash(moved))
})
```

- [ ] **Step 2: Run the unit spec, verify it fails**

Run: `npx playwright test tests/features/integrity/operations.unit.spec.ts`
Expected: FAIL (old signatures — `revisionPrefix` still takes a class, `stampHistorize` still takes classes).

- [ ] **Step 3: Rewrite `operations.ts`**

Keep the file's existing content and apply exactly these changes:

- `revisionPrefix`/`revisionKey`/`parseRevisionIndex` lose the class dimension; delete `parseRevisionClass`, `IntegrityClass`, `INTEGRITY_CLASSES`:

```ts
export const revisionPrefix = (owner: { type: string, id: string }, datasetId: string): string =>
  `data-fair/${owner.type}-${owner.id}/${datasetId}/`

export const revisionKey = (owner: { type: string, id: string }, datasetId: string, i: number): string =>
  `${revisionPrefix(owner, datasetId)}${padIndex(i)}`
```

- In `coveredMetadata`, after the existing nested strips, add the D1 normalization (before the `return`):

```ts
  // D1 (simplification design): denormalized display names are synced wholesale from their
  // authoritative sources (simple-directory, settings.topics) — hash the identifying keys only,
  // so a name propagation is not a covered change and needs no outbox stamp
  if (covered.owner) {
    const { type, id, department } = covered.owner
    covered.owner = { type, id, ...(department ? { department } : {}) }
  }
  if (Array.isArray(covered.topics)) covered.topics = covered.topics.map(({ id }: any) => ({ id }))
  if (Array.isArray(covered.permissions)) {
    covered.permissions = covered.permissions.map(({ name, ...rest }: any) => rest)
  }
  if (Array.isArray(covered.masterData?.shareOrgs)) {
    covered.masterData = { ...covered.masterData, shareOrgs: covered.masterData.shareOrgs.map(({ id }: any) => ({ id })) }
  }
```

- Replace the context/stamp block (`RevisionOperation` down to `stampHistorize`) with:

```ts
export type RevisionOperation = 'create' | 'update' | 'enable' | 'fixIntegrity'
// actor CATEGORY, never an identity: user ids are personal data and must not enter the
// undeletable WORM store — identity-level attribution lives in the events/journal system
export type RevisionOrigin = 'user' | 'superadmin' | 'worker' | 'propagation' | 'upgrade'
export type RevisionContext = { operation: RevisionOperation, origin: RevisionOrigin, date: string, reason?: string }
export type HistorizeContextHint = { operation: RevisionOperation, origin: RevisionOrigin, reason?: string }

// Merge the transactional-outbox stamp (spec §4) into a writer's own Mongo update, keeping the
// write single-document atomic. A stamp means "re-anchor this dataset" (every anchor covers both
// the file and metadata hashes since the joint-anchor simplification).
export const stampHistorize = (
  update: { $set?: Record<string, any>, [k: string]: any },
  context?: HistorizeContextHint
) => {
  update.$set = { ...update.$set, _needsHistorizing: context ? { context } : {} }
  return update
}
```

- `RENEW_INTERVAL` / `needsRenewal`: unchanged.

- [ ] **Step 4: Rewrite `outbox.ts`**

```ts
import mongo from '#mongo'

export { stampHistorize } from './operations.ts'

// Second-pass stamp for bulk propagation writers that make GENUINE covered-content changes
// (permission-entry removal on identity deletion, topic deletion $pull, customMetadata cleanup,
// publicationSite deletion $pull) — their updateMany cannot carry a per-doc conditional stamp,
// so stamp the affected integrity-active datasets separately. Not single-doc atomic with the
// propagation write — a crash between the two surfaces as a loud false breach at the next check,
// reconciled by _fix (the accepted fail-loud posture). Call it BEFORE a destructive write whose
// filter self-invalidates ($pull/$unset removing the matched field). Over-stamping is harmless:
// the relay dedupes, and drops the flag on datasets whose integrity is not active.
export const stampHistorizeMany = async (filter: Record<string, any>): Promise<void> => {
  await mongo.datasets.updateMany(
    { ...filter, 'integrity.active': true },
    { $set: { _needsHistorizing: { context: { operation: 'update', origin: 'propagation' } } } }
  )
}
```

- [ ] **Step 5: Run the unit spec, verify it passes**

Run: `npx playwright test tests/features/integrity/operations.unit.spec.ts`
Expected: PASS. (The API build is broken at this point — consumers still use old signatures; that's fine, tasks 2–5 fix them before any API test runs.)

- [ ] **Step 6: Commit**

```bash
git add api/src/integrity/operations.ts api/src/integrity/outbox.ts tests/features/integrity/operations.unit.spec.ts
git commit -m "refactor(integrity): joint-anchor keys, depersonalized context, name-normalized hash (D1-D3 core)"
```

---

### Task 2: Dataset schema + types + registered operations

**Files:**
- Modify: `api/types/dataset/schema.js` (the `integrity` property + `$defs.integrityClassState`)
- Modify: `api/types/dataset/index.ts` (the 6 lines referencing per-class integrity, if any — adjust to the new shape)
- Modify: `shared/permissions/operations.ts` (drop `realtime-integrity`)

**Interfaces:**
- Produces: `dataset.integrity: { active, lastCheck?: { date, status, breach?: ('file'|'metadata')[] }, lastRevision?: { i, hash, date, retainUntil? }, lastRenewal?: { date, status, retainUntil?, error? } }` — consumed by relay/checker/routes/UI.

- [ ] **Step 1: Reshape the schema**

In `api/types/dataset/schema.js`, replace the `integrity` property's `properties` (currently `active` + `file`/`metadata` `$ref`s) with the inlined single state, and delete `$defs.integrityClassState` entirely:

```js
  integrity: {
    type: 'object',
    readOnly: true,
    description: 'Tamper-detection state for the dataset (data file + metadata), managed by the integrity checker. Only present in responses to the owner account admins and superadmins.',
    required: ['active'],
    properties: {
      active: { type: 'boolean' },
      lastCheck: {
        type: 'object',
        required: ['date', 'status'],
        properties: {
          date: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['ok', 'breach', 'unknown'] },
          breach: { type: 'array', items: { type: 'string', enum: ['file', 'metadata'] } }
        }
      },
      lastRevision: {
        type: 'object',
        required: ['i', 'hash', 'date'],
        properties: {
          i: { type: 'number' },
          hash: {
            type: 'object',
            properties: { md5: { type: 'string' }, sha256: { type: 'string' } }
          },
          date: { type: 'string', format: 'date-time' },
          retainUntil: { type: 'string', format: 'date-time' }
        }
      },
      lastRenewal: {
        type: 'object',
        required: ['date', 'status'],
        properties: {
          date: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['ok', 'failed'] },
          retainUntil: { type: 'string', format: 'date-time' },
          error: { type: 'string' }
        }
      }
    }
  },
```

- [ ] **Step 2: Adjust `api/types/dataset/index.ts` and drop `realtime-integrity`**

In `api/types/dataset/index.ts`: `git show e41148af0 -- api/types/dataset/index.ts` shows what #499 added; update any helper referencing `integrity.file`/`integrity.metadata` to the single state (if it only re-exports generated types, nothing to do beyond regeneration).

In `shared/permissions/operations.ts`: delete line 177 (`'realtime-integrity': { title: ... }`) and remove `'realtime-integrity'` from the datasets admin class list on line 206.

- [ ] **Step 3: Regenerate types and commit**

Run: `npm run build-types`
Expected: regenerates `api/types/dataset` output without errors.

```bash
git add api/types/dataset shared/permissions/operations.ts
git commit -m "refactor(integrity): single integrity state in the dataset schema, drop realtime-integrity operation"
```

---

### Task 3: Relay → shared `anchorDataset()` + joint checker

**Files:**
- Modify: `api/src/integrity/relay.ts`
- Modify: `api/src/integrity/checker.ts`
- Modify: `api/src/workers/tasks.ts:238` (historize filter)
- Modify: `api/src/workers/short-processor/finalize.ts:36-43` (stamp shape)

**Interfaces:**
- Produces: `anchorDataset(dataset, hint?): Promise<void>` (relay.ts) — computes both hashes, dedupes against the latest anchor, writes the revision, persists `integrity.lastRevision`; consumed by `historize` and by Task 4's sync routes.
- Produces: `checkDataset(dataset): Promise<{ status: 'ok'|'breach'|'unknown', date?: string, breach?: ('file'|'metadata')[] }>` — consumed by routes and tests.

- [ ] **Step 1: Rewrite `relay.ts`**

```ts
import mongo from '#mongo'
import config from '#config'
import type { DatasetInternal } from '#types'
import { isFileDataset } from '#types/dataset/index.ts'
import * as datasetUtils from '../datasets/utils/index.ts'
import { integrityStore } from './store-factory.ts'
import { md5OfStorageFile } from './hash.ts'
import * as ops from './operations.ts'

// Compute both hashes from the authoritative sources (stored file bytes + fresh Mongo doc),
// dedupe against the latest anchor, write the next locked revision and persist the
// integrity.lastRevision hint. Shared by the async relay (organic writes) and the synchronous
// admin routes (enable / fixIntegrity).
export const anchorDataset = async (dataset: DatasetInternal, hint?: ops.HistorizeContextHint): Promise<void> => {
  const store = integrityStore()
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + (config.integrity!.retention?.days ?? 365) * 24 * 3600 * 1000)

  const hash: { md5?: string, sha256?: string } = {}
  // Hash the actual stored file, NOT dataset.originalFile.md5: an out-of-band edit (exactly what
  // fixIntegrity reconciles) never updates that metadata field, so anchoring it would dedupe and
  // never re-anchor. Hashing the stored file keeps the relay symmetric with the checker.
  if (isFileDataset(dataset)) {
    const md5 = await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
      // missing file (both backends normalize to 404): genuinely nothing to anchor for the file part
      if (err.status === 404) return undefined
      throw err // transient storage error: propagate so the caller/worker retries
    })
    if (md5) hash.md5 = md5
  }
  // re-read the freshest doc: the caller's copy may lag behind the write that set the flag,
  // and the checker hashes the live doc — relay and checker must see the same state
  const fresh = await mongo.datasets.findOne({ id: dataset.id })
  if (!fresh) return // deleted in the meantime
  hash.sha256 = ops.metadataHash(fresh)

  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const keys = (await store.listRevisions(prefix)).map((r) => r.key)
  const latest = ops.latestKey(keys)
  if (latest) {
    const latestHash = (await store.getRevision(latest)).hash
    if (latestHash.md5 === hash.md5 && latestHash.sha256 === hash.sha256) return // already anchored
  }

  const i = ops.nextIndex(keys)
  const operation: ops.RevisionOperation = hint?.operation ?? (i === 0 ? 'create' : 'update')
  const context: ops.RevisionContext = {
    operation,
    origin: hint?.origin ?? 'worker',
    date,
    ...(hint?.reason ? { reason: hint.reason } : {})
  }
  await store.writeRevision(ops.revisionKey(dataset.owner, dataset.id, i), {
    hash,
    context,
    dataset: { id: dataset.id, slug: dataset.slug }
  }, retainUntil)
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.lastRevision': { i, hash, date, retainUntil: retainUntil.toISOString() } }
  })
}

// The async relay behind the historize worker task, driven by the _needsHistorizing outbox flag.
export const historize = async (dataset: DatasetInternal): Promise<void> => {
  const clearFlag = () => mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizing: '' } })

  // capability disabled at the deployment level: drop the flag instead of letting integrityStore()
  // throw on every worker poll (retry storm). A later finalize re-sets the flag if re-enabled.
  if (!config.integrity?.active) { await clearFlag(); return }
  // defensive: bulk propagation writers may stamp datasets whose integrity is not active —
  // drop silently rather than anchoring an un-enrolled dataset
  if (!dataset.integrity?.active) { await clearFlag(); return }

  await anchorDataset(dataset, dataset._needsHistorizing?.context)
  // Known narrow window (accepted): a stamp written while this relay run is in-flight can be
  // cleared by this unconditional $unset and thus dropped. Fail-loud: the next sliding check
  // re-detects the mismatch and alerts; a follow-up _fix recovers.
  await clearFlag()
}
```

Note: `RevisionBody` in `store.ts` already types `hash`/`context`/`dataset` — its `context: RevisionContext` import now resolves to the new shape; no change needed in `store.ts`.

- [ ] **Step 2: Rewrite the check/renew part of `checker.ts`**

Replace `maybeRenew`'s per-class parameters, delete `emitChecked` and `checkClass`, and make `checkDataset` the single-pass check. Keep the cron/lock/start/stop plumbing at the bottom of the file untouched. New middle section:

```ts
export type Check = { status: 'ok' | 'breach' | 'unknown', date?: string, breach?: Array<'file' | 'metadata'> }

// Lock renewal by extension (architecture §3.4 Option B): when a passing check finds the current
// anchor is "old" (per ops.needsRenewal), push its compliance retain-until forward in place so the
// current state stays protected indefinitely. Failure is surfaced loudly, never thrown — the anchor
// stays valid until its existing retain-until, leaving lead time to react.
const maybeRenew = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, latestKey: string): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal((dataset.integrity as any)?.lastRevision?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  try {
    await store.extendRetention(latestKey, retainUntil)
    await mongo.datasets.updateOne({ id: dataset.id }, {
      $set: {
        'integrity.lastRevision.retainUntil': retainUntil.toISOString(),
        'integrity.lastRenewal': { date, status: 'ok', retainUntil: retainUntil.toISOString() }
      }
    })
  } catch (err) {
    internalError('integrity-renew', err)
    await mongo.datasets.updateOne({ id: dataset.id }, {
      $set: { 'integrity.lastRenewal': { date, status: 'failed', error: err instanceof Error ? err.message : String(err) } }
    })
  }
}

export const checkDataset = async (dataset: DatasetInternal): Promise<Check> => {
  // a relay is pending: the hot state legitimately differs from the latest anchor until the relay
  // writes the new revision — checking now would raise a false breach alert
  if (dataset._needsHistorizing) return { status: 'unknown' }
  const store = integrityStore()
  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const latest = ops.latestKey((await store.listRevisions(prefix)).map((r) => r.key))
  if (!latest) {
    // no anchor written yet (e.g. right after an owner transfer, before the re-anchor lands under
    // the new prefix): persist the verdict so a stale pre-transfer 'ok' cannot linger and the
    // sweep cursor (sorted on lastCheck.date) advances past this dataset
    const date = new Date().toISOString()
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastCheck': { date, status: 'unknown' } } })
    return { status: 'unknown', date }
  }

  const expected = (await store.getRevision(latest)).hash
  const breach: Array<'file' | 'metadata'> = []
  // a missing file is the strongest tamper signal (deleted out-of-band) → breach, not an exception
  const actualMd5 = isFileDataset(dataset)
    ? await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
      if (err.status === 404) return undefined
      throw err
    })
    : undefined
  if (expected.md5 !== actualMd5) breach.push('file')
  // hash the live doc, freshly re-read (the caller's copy may be a cleaned/projected response doc)
  const freshDoc = await mongo.datasets.findOne({ id: dataset.id })
  if (!freshDoc || ops.metadataHash(freshDoc) !== expected.sha256) breach.push('metadata')

  const status: 'ok' | 'breach' = breach.length ? 'breach' : 'ok'
  const date = new Date().toISOString()
  const wasBreach = (dataset.integrity as any)?.lastCheck?.status === 'breach'
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.lastCheck': { date, status, ...(breach.length ? { breach } : {}) } }
  })
  if (status === 'breach' && !wasBreach) {
    await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', 'integrity-breach')
  }
  if (status === 'ok') await maybeRenew(dataset, store, latest)
  return { status, date, ...(breach.length ? { breach } : {}) }
}
```

Also in `runOnce`, change the sort to `.sort({ 'integrity.lastCheck.date': 1 })`, and delete the now-unused imports (`wsEmitter` — keep `internalError`, `isFileDataset` / `md5OfStorageFile` / `datasetUtils` move up from the deleted `checkClass`).

- [ ] **Step 3: Worker filter and finalize stamp**

`api/src/workers/tasks.ts:238`: `mongoFilter: () => ({ _needsHistorizing: { $exists: true } })`.

`api/src/workers/short-processor/finalize.ts:36-43`: replace the comment + line with:

```ts
  // Intentionally unconditional (no `!dataset.draftReason` guard). applyPatch (below) prefixes keys
  // with `draft.` based on its TARGET's draftReason, which routes this correctly: a plain draft
  // finalize persists `draft._needsHistorizing` (never matched by the relay filter → drafts are NOT
  // historized), while a draft validation patches the published doc → top-level flag → anchored.
  if (dataset.integrity?.active) result._needsHistorizing = { context: { operation: 'update', origin: 'worker' } }
```

- [ ] **Step 4: Type-check the touched area and commit**

Run: `npx tsc --noEmit -p api 2>&1 | grep -c "src/integrity\|workers/tasks\|short-processor/finalize" || true`
Expected: 0 errors mentioning these files (other files still reference old exports until Tasks 4–5; the repo-wide check runs in Task 10).

```bash
git add api/src/integrity/relay.ts api/src/integrity/checker.ts api/src/workers/tasks.ts api/src/workers/short-processor/finalize.ts
git commit -m "refactor(integrity): shared anchorDataset, joint single-pass checker, no WS emits"
```

---

### Task 4: Routes — synchronous enable/fix, single-prefix revisions; applyPatch + error filter

**Files:**
- Modify: `api/src/datasets/routes/integrity.ts`
- Modify: `api/src/datasets/service.ts:501-516` (applyPatch stamp) and `:126-129` (status=error filter)
- Modify: `api/src/misc/utils/permissions.ts:381-386`
- Modify: `api/src/datasets/routes/metadata.ts:253-257` (changeOwner)

**Interfaces:**
- Consumes: `anchorDataset` (Task 3), `checkDataset` (Task 3), `stampHistorize(update, context?)` (Task 1).
- Produces: `PUT …/_integrity` (sync anchor on enable), `POST …/_fix` → returns the fresh `Check` JSON (was 204), `GET …/_integrity/revisions` → `{ count, results: [{ i, hash, date, operation, origin, reason? }] }` (no `class` field, no `class` query param).

- [ ] **Step 1: Rewrite `api/src/datasets/routes/integrity.ts`**

```ts
import { type Router } from 'express'
import { reqAdminMode } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import mongo from '#mongo'
import { reqDataset, readDataset } from '../middlewares.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import { isFileDataset } from '#types/dataset/index.ts'
import { integrityStore } from '../../integrity/store-factory.ts'
import { revisionPrefix, parseRevisionIndex } from '../../integrity/operations.ts'
import { anchorDataset } from '../../integrity/relay.ts'

export const registerIntegrityRoutes = (router: Router) => {
  router.put('/:datasetId/_integrity', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    const active = !!req.body?.active
    if (active) {
      if (!config.integrity?.active) throw httpError(400, 'integrity capability is not configured on this deployment')
      if (!isFileDataset(dataset) || !dataset.originalFile?.md5) throw httpError(400, 'integrity can only be enabled on a finalized file dataset')
      // bump updatedAt so the dataset read-cache (getDatasetFresh) detects the change; a raw
      // updateOne leaves updatedAt untouched and reads then serve a stale doc without integrity.active
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.active': true, updatedAt: new Date().toISOString() } })
      // anchor synchronously: enable is a rare superadmin action, and the response then reflects
      // the anchored state. On failure (S3 down) active stays true with no anchor — the check
      // reports 'unknown' and a later _fix retries (fail-loud, no compensating rollback).
      await anchorDataset(dataset, { operation: 'enable', origin: 'superadmin' })
    } else {
      await mongo.datasets.updateOne({ id: dataset.id }, {
        // clear the verdicts and any pending relay work: a disabled dataset must not keep showing
        // a breach badge / error-filter listing it no longer allows acting on
        $set: { integrity: { active: false }, updatedAt: new Date().toISOString() },
        $unset: { _needsHistorizing: '' }
      })
    }
    res.status(200).json({ active })
  })

  router.get('/:datasetId/_integrity', readDataset({ noCache: true }), permissions.middleware('readIntegrity', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    res.json(dataset.integrity ?? { active: false })
  })

  router.post('/:datasetId/_integrity/_fix', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    // synchronous re-anchor + verify: the reconcile action responds with a fresh verdict
    await anchorDataset(dataset, { operation: 'fixIntegrity', origin: 'superadmin', reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined })
    const checker = await import('../../integrity/checker.ts')
    const fresh = await mongo.datasets.findOne({ id: dataset.id })
    res.json(await checker.checkDataset(fresh as any))
  })

  router.post('/:datasetId/_integrity/_check', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const checker = await import('../../integrity/checker.ts')
    res.json(await checker.checkDataset(dataset))
  })

  router.get('/:datasetId/_integrity/revisions', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const store = integrityStore()
    // zero-padded indices sort lexically == numerically; newest first = reversed
    const keys = (await store.listRevisions(revisionPrefix(dataset.owner, dataset.id))).map((r) => r.key).sort().reverse()
    const count = keys.length
    const size = Math.min(parseInt(String(req.query.size ?? '20'), 10) || 20, 100)
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1
    const results = await Promise.all(keys.slice((page - 1) * size, (page - 1) * size + size).map(async (key) => {
      const rev = await store.getRevision(key)
      return {
        i: parseRevisionIndex(key),
        hash: rev.hash,
        date: rev.context.date,
        operation: rev.context.operation,
        origin: rev.context.origin,
        ...(rev.context.reason ? { reason: rev.context.reason } : {})
      }
    }))
    res.json({ count, results })
  })
}
```

(`reqSessionAuthenticated` and `originatorOf` are gone — nothing in this file reads the session user anymore.)

- [ ] **Step 2: applyPatch stamp + error filter in `service.ts`**

Replace the block at `api/src/datasets/service.ts:501-516` with:

```ts
  // integrity outbox (spec §4): a patch touching covered metadata fields must be anchored.
  // Draft-prefixed patches land under the excluded `draft` subtree and are not anchored.
  // Plain-$set of the sub-doc can overwrite a concurrently written stamp between our read and
  // this write — accepted narrow window, both stamps only meant "re-anchor" (fail-loud recovery).
  if (dataset.integrity?.active && !dataset.draftReason && !patch._needsHistorizing) {
    if (integrityOps.coveredPatchKeys(patch).length) {
      patch._needsHistorizing = { context: { operation: 'update', origin: 'user' } }
    }
  }
```

(Finalize passes its own `patch._needsHistorizing` with `origin: 'worker'` — the `!patch._needsHistorizing` guard preserves it.)

At `:126-129`, replace the two per-class `$or` members with the single `{ 'integrity.lastCheck.status': 'breach' }`.

- [ ] **Step 3: permissions.ts and changeOwner stamps**

`api/src/misc/utils/permissions.ts:381-386`:

```ts
      const permissionsUpdate: any = { $set: { permissions: req.body, updatedAt: new Date().toISOString() } }
      if (resourceType === 'datasets' && (resource as any).integrity?.active) {
        // also covers the publications.$.status='waiting' write just above (same request)
        stampHistorize(permissionsUpdate, { operation: 'update', origin: 'user' })
      }
```

(Drop the `reqSessionAuthenticated` import only if nothing else in the file uses it — check with grep first.)

`api/src/datasets/routes/metadata.ts:253-257`:

```ts
    const changeOwnerUpdate: any = { $set: patch }
    // S3 anchor keys are owner-scoped (data-fair/‹owner.type›-‹owner.id›/…) — after a transfer
    // there is no anchor under the new prefix, so a re-anchor must be stamped
    if (dataset.integrity?.active) stampHistorize(changeOwnerUpdate, { operation: 'update', origin: 'user' })
```

Fix the `stampHistorize`/`INTEGRITY_CLASSES` imports in both files (`INTEGRITY_CLASSES` no longer exists).

- [ ] **Step 4: Commit**

```bash
git add api/src/datasets/routes/integrity.ts api/src/datasets/routes/metadata.ts api/src/datasets/service.ts api/src/misc/utils/permissions.ts
git commit -m "refactor(integrity): synchronous enable/fix, single-sequence revisions endpoint, simplified stamps"
```

---

### Task 5: D1 stamp-site cleanup (identities / topics / settings)

**Files:**
- Modify: `api/src/identities/service.ts`
- Modify: `api/src/misc/utils/topics.ts`
- Modify: `api/src/settings/service.ts` (no code change — verify only)

**Interfaces:**
- Consumes: the D1-normalized `coveredMetadata` (Task 1) — the reason name-sync stamps are now removable.

- [ ] **Step 1: Remove the 5 name-sync stamps in `identities/service.ts`**

In `renameIdentity`, delete these lines (and nothing else):
- `if (c === 'datasets') await stampHistorizeMany(ownerFilter)` (line 29 — owner.name sync)
- `if (c === 'datasets') await stampHistorizeMany(departmentFilter)` (line 34 — departmentName sync)
- `if (c === 'datasets') await stampHistorizeMany({ id: doc.id })` (line 47 — permissions[].name sync)
- `if (c === 'datasets') await stampHistorizeMany({ id: doc.id })` (line 62 — dead code: this loop iterates `privateAccessCollectionNames`, `c` is never `'datasets'`)
- `await stampHistorizeMany({ id: dataset.id })` (line 80 — masterData.shareOrgs[].name sync)

**Keep** the stamp in `deleteIdentity` (line 104): removing permission *entries* is a genuine ACL change, still covered by the hash.

- [ ] **Step 2: Remove the topic-update stamp in `topics.ts`**

In `updateTopics`, delete `await stampHistorizeMany(filter)` from the first loop (line 27 — title/color/icon propagation; topics are hashed as `{id}` only now) and shrink its comment to the propagation-perf rationale:

```ts
    // unchanged topic → no propagation write needed
    const oldTopic = oldTopics.find(t => t.id === topic.id)
    if (oldTopic && equal(topicReference, topicReferenceOf(oldTopic))) continue
```

**Keep** the stamp in the deletion loop (line 36) with its stamp-before-$pull comment — removing a topic changes the hashed id list.

- [ ] **Step 3: Verify `settings/service.ts` needs no change**

Both its stamps (`customMetadata` cleanup, `deletePublicationSite`) are genuine covered-content changes and keep working through the reshaped `stampHistorizeMany`. Run `grep -n stampHistorizeMany api/src/settings/service.ts` and confirm exactly 2 call sites remain (lines ~202, ~324).

- [ ] **Step 4: Commit**

```bash
git add api/src/identities/service.ts api/src/misc/utils/topics.ts
git commit -m "refactor(integrity): drop name-sync propagation stamps (names normalized out of the hash)"
```

---

### Task 6: Event i18n — one breach key

**Files:**
- Modify: `api/i18n/messages/en.json:167-174`, `api/i18n/messages/fr.json` (same keys)

- [ ] **Step 1: Replace the two per-class entries with one**

In both language files, replace the `integrity-breach-file` and `integrity-breach-metadata` entries with a single `integrity-breach` (keep the existing title wording of the file variant, generalized). en:

```json
			"integrity-breach": {
				"title": "Integrity breach",
				"body": "Dataset {{label}} was modified outside the legitimate write path (divergence detected by the integrity check on its data file or metadata)."
			},
```

fr (mirror the existing French wording generalized the same way — check the current fr entries first with `grep -A3 integrity-breach api/i18n/messages/fr.json`).

- [ ] **Step 2: Commit**

```bash
git add api/i18n/messages/en.json api/i18n/messages/fr.json
git commit -m "refactor(integrity): single integrity-breach event key"
```

---

### Task 7: Tests — support helpers + merge 6 API spec files into 2

**Files:**
- Modify: `tests/support/integrity.ts`
- Create: `tests/features/integrity/core.api.spec.ts` (absorbs store + relay + checker + renewal specs)
- Create: `tests/features/integrity/admin.api.spec.ts` (absorbs endpoints + metadata specs)
- Delete: `tests/features/integrity/{store,relay,checker,renewal,endpoints,metadata}.api.spec.ts`

**Interfaces:**
- Consumes: everything above. New API surfaces to assert: sync enable (anchor exists when the PUT returns — **no wait needed**), `_fix` returns the fresh `Check`, `check` response is `{ status, breach? }` (not per-class), revisions entries `{ i, hash, date, operation, origin }`.

- [ ] **Step 1: Update `tests/support/integrity.ts`**

Keep `integrityTestClient`, `integrityTestStore`, `ensureIntegrityBucket`, `listIntegrityKeys`, `waitForIntegrityRevisions` as they are. Simplify `waitForFlagCleared`'s comment (no more "other class" caveat — it still guards the organic-write relay window before a check). Add the single-prefix helper:

```ts
export const revisionsPrefix = (dataset: any): string =>
  `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`
```

- [ ] **Step 2: Write `core.api.spec.ts`**

Port, with the new shapes, these tests (same `beforeAll` bucket init + `beforeEach` clean() conventions and comments as today):

1. The 5 store tests from `store.api.spec.ts` **verbatim**, except each `context:` literal becomes the new shape, e.g. `{ operation: 'create', origin: 'worker', date: new Date().toISOString() }`.
2. From `relay.api.spec.ts` (use `revisionsPrefix(dataset)`; the test-env stamp becomes `_needsHistorizing: { context: { operation: 'enable', origin: 'superadmin' } }` or `{}`):
   - "relay writes a locked revision when _needsHistorizing is set, then dedupes" — assertions: 1 key after flag, `raw.integrity.lastRevision.hash.md5` equals `dataset.originalFile.md5`, still 1 key after re-flag (dedupe: hashes unchanged).
   - "a file replacement writes a new (second) revision" — unchanged flow; note the joint anchor means the metadata part re-records too, still ONE new revision.
   - Drop "relay clears the flag without writing a revision on a dataset without a file": with the joint anchor a REST dataset **does** get anchored (sha256 only). Replace with: flag a REST dataset (integrity.active true via test-env) → wait 1 revision → `getRevision` of that key has `hash.sha256` and **no** `hash.md5`.
3. From `checker.api.spec.ts` (enable is now synchronous — **delete every `waitForIntegrityRevisions`/`waitForFlagCleared` call that follows a `PUT _integrity`**; check responses are `check.status`/`check.breach`):
   - ok → tamper file → `{ status: 'breach', breach: ['file'] }` + event → `_fix` (response IS the fresh check: expect `res.data.status === 'ok'`) — merges the old checker test and the metadata `_fix` test.
   - "a check during a pending legitimate update never reports a breach" — same flow, `['unknown', 'ok']` contains `check.status`.
   - "out-of-band deletion of the stored file is reported as a breach" — expect `breach` to contain `'file'`.
   - "breach notification fires once per transition" — same, single `integrity-breach` topic key.
4. The 4 renewal tests from `renewal.api.spec.ts`, with `integrity.file.lastRevision` → `integrity.lastRevision` in the test-env patches and reads, `check.file.status` → `check.status`, and `latestKey` = `` `${revisionsPrefix(dataset)}000000000` ``. The `enabledDataset` helper drops all its waits — enable is synchronous and `lastRevision` (including `retainUntil`) is persisted before the PUT returns, so read it directly; the `pollFor` helper stays only where a worker is genuinely involved.

- [ ] **Step 3: Write `admin.api.spec.ts`**

Port from `endpoints.api.spec.ts` and `metadata.api.spec.ts`, new shapes, sync enable (no waits after PUT):

- "superadmin enable writes the initial anchor; non-admin is forbidden" — after the PUT returns, `listIntegrityKeys(revisionsPrefix(dataset))` has 1 key and the `_integrity` GET shows `lastRevision.hash.md5` + `lastRevision.hash.sha256`.
- "enable is rejected on a dataset without an md5 file" — unchanged.
- "_fix on an unchanged state dedupes (no spurious revision)" — sync `_fix`, then still 1 key.
- "revisions endpoint lists revisions newest-first and is readable by the owner admin" — enable (1 revision) + tamper file + `_fix` (revision 1) → `count === 2`, `results[0].i === 1`, entries have `hash`/`operation`/`origin`/`date` and **no** `class`; pagination `size:1,page:1` → `results[0].i === 1`.
- "integrity reads are allowed to the owner admin, writes stay superadmin-only" — counts become 1 (one joint anchor); rest unchanged.
- "integrity state is hidden from readers who are not owner admins" — unchanged.
- "disabling integrity clears the breach state and error-filter listing" — `status.lastCheck` undefined after disable (not `status.file?.lastCheck`).
- "internal historize fields are stripped from API responses" — the test-env patch sets `_needsHistorizing: { context: { operation: 'enable', origin: 'superadmin' } }` on a dataset **without** `integrity.active`; the relay will clear the flag (it now matches the `$exists` filter) — so assert the response stripping *before* the relay runs, or simpler: keep the patch but drop the raw-doc assertion's timing dependency by reading the API response immediately after the cache drop. Keep the `getRawDataset` assertion only if it reads before the worker poll (poll interval in tests makes this racy) — **decision: drop the raw-doc assertion, keep the response-stripping assertion**.
- "breached dataset appears under the status=error listing" — `row.integrity.lastCheck.status === 'breach'`.
- From `metadata.api.spec.ts`:
  - "an out-of-band covered-field write breaches metadata while file stays ok" → expect `{ status: 'breach', breach: ['metadata'] }` (per-hash detail replaces per-class independence), then sync `_fix` → response `status === 'ok'`.
  - "an out-of-band write to an EXCLUDED field neither breaches nor creates a revision" — unchanged flow, `check.status === 'ok'`, 1 key total.
  - "a legitimate metadata PATCH historizes a new revision" — wait 2 revisions after the PATCH; then assert the newest revision's `origin === 'user'` and `operation === 'update'` (replaces the `originator: /^user:/` assertion).
  - "a permissions change historizes a new revision" — unchanged flow, count on the single prefix.
  - "a topic removed from owner settings historizes a new revision" — **updated flow**: with topics hashed as ids only, the initial topic *assignment* PATCH still historizes (id list changed), the settings *rename* propagation no longer stamps, the settings *removal* still does. Keep the assignment (rev 1) → removal (rev 2) flow and add in the middle: rename the topic in settings, `await waitForFlagCleared`, assert the key count did NOT grow (a rename is not a covered change anymore).
  - "deleting a publication site historizes a new revision" — same flow, single prefix.
  - "a settings write with unchanged topics does not re-anchor tagged datasets" — same tamper-not-healed flow and assertions (`check.status === 'breach'` at the end).
  - Drop the standalone "_fix re-anchors then refreshes the verdict itself" test — `_fix` is synchronous now and its response-is-the-verdict behavior is asserted in the breach/fix tests above.

- [ ] **Step 4: Delete the old spec files, run the suite**

```bash
git rm tests/features/integrity/store.api.spec.ts tests/features/integrity/relay.api.spec.ts tests/features/integrity/checker.api.spec.ts tests/features/integrity/renewal.api.spec.ts tests/features/integrity/endpoints.api.spec.ts tests/features/integrity/metadata.api.spec.ts
npx playwright test tests/features/integrity/
```

Expected: all integrity tests pass (unit + core + admin). Debug failures before proceeding — this is the main verification gate of the refactor.

- [ ] **Step 5: Commit**

```bash
git add tests/support/integrity.ts tests/features/integrity/
git commit -m "test(integrity): merge specs around flows, cover the simplified shapes"
```

---

### Task 8: UI — single status block, no WS, shared types

**Files:**
- Modify: `ui/src/components/dataset/dataset-integrity.vue`
- Modify: `ui/src/components/dataset/dataset-list-item.vue:33`
- Modify: `ui/src/pages/dataset/[id]/index.vue:1141`

- [ ] **Step 1: Rewrite the script + status section of `dataset-integrity.vue`**

Template: replace the `v-for="cls in ..."` block with a single status group (same alert components):
- breach alert when `state.lastCheck?.status === 'breach'`, its text listing the diverged parts: `:text="(state.lastCheck.breach ?? []).map(p => t('part_' + p)).join(', ') + ' — ' + t('breachBody')"`
- ok / not-checked / renewal-failed alerts and the lastCheck caption as today, reading `state.lastCheck` / `state.lastRenewal` directly.
- history table: drop the `class` column and its header/slot; add an `origin` rendering slot `{{ t('origin_' + item.origin) }}` in place of the raw originator column (`colOriginator` header stays, renamed key `origin`).

Script:
- Types come from the schema: `import type { Dataset } from '#api/types'` and `type IntegrityState = NonNullable<Dataset['integrity']>`; `RevisionEntry` becomes `{ i: number, hash: { md5?: string, sha256?: string }, date: string, operation: string, origin: string, reason?: string }`.
- `anyBreach` → `state.value?.lastCheck?.status === 'breach'`.
- Delete the whole WS block (`useWS`, `wsRefreshTimer`, subscription) — `check`, `fix` and `toggle` already `await load.execute()` after their (now synchronous) calls; add `datasetStore.datasetFetch.refresh()` at the end of `check`/`fix`/`toggle` so the badge/tab color refresh without the WS push.
- i18n: drop `class_file`/`class_metadata`/`breachBody_file`/`breachBody_metadata`/`colClass`, add `part_file: Fichier de données / Data file`, `part_metadata: Métadonnées / Metadata`, `breachBody: modifié(es) en dehors du circuit d'écriture légitime / modified outside the legitimate write path`, and `origin_user/origin_superadmin/origin_worker/origin_propagation/origin_upgrade` labels (fr: Utilisateur / Superadmin / Traitement interne / Propagation / Script de migration; en: User / Superadmin / Internal worker / Propagation / Upgrade script). Update `fixOk` (fr: `Réconciliation effectuée`, en: `Reconciliation completed`) — it is synchronous now.

- [ ] **Step 2: Badge conditions**

`dataset-list-item.vue:33`: `v-if="dataset.integrity?.lastCheck?.status === 'breach'"`.
`pages/dataset/[id]/index.vue:1141`: `const integrityBreach = d.integrity?.lastCheck?.status === 'breach'` (and shorten the comment above it — no per-class mention).

- [ ] **Step 3: Type-check the UI and commit**

Run: `npm run check-types -w ui 2>&1 | tail -5` (or the repo's UI check variant — `npm run check-types` covers workspaces)
Expected: no new errors in the three touched files.

```bash
git add ui/src/components/dataset/dataset-integrity.vue ui/src/components/dataset/dataset-list-item.vue "ui/src/pages/dataset/[id]/index.vue"
git commit -m "refactor(integrity): single-state UI panel, no realtime channel"
```

---

### Task 9: Fixtures — 4 demo datasets → 2

**Files:**
- Modify: `dev/fixtures.ts`

- [ ] **Step 1: Simplify the integrity helpers and seeds**

- `currentRevisionIndex(id)` — drop the `cls` parameter (read `data.lastRevision?.i`); same for `waitForNewRevision(id, afterIndex)`.
- Delete the `worst()` helper; `runCheck` returns `{ status, breach? }` (fallback reads `data.lastCheck`).
- Delete the `seedIntegriteBreachMeta` and `seedIntegriteReconcilie` seed functions (locate them below line 300: `grep -n "breach-meta\|reconcilie" dev/fixtures.ts`) and their invocations in the main run sequence.
- `fixtures-integrite-breach`: make it tamper **both** the stored file (`tamperFile`) and the metadata (raw description patch) so the panel demonstrates the per-part breach detail (`breach: ['file', 'metadata']`).
- Remove the two deleted ids from `datasetTopics`; `ensureBreachState` keeps only `fixtures-integrite-breach` and asserts on `check.status`/`check.breach` (log both parts).
- Update the narrative comments accordingly (enable is synchronous now: after `enableIntegrity()` the anchor exists, no initial `waitForNewRevision` needed).

- [ ] **Step 2: Verify against the dev stack (if it is up) and commit**

If `bash dev/status.sh` shows the stack healthy, run `npm run dev-fixtures` on a fresh `dev_fixtures` state (or note that the two remaining integrity fixtures are `skip-if-exists` and will only fully exercise on a reset environment — do not reset anything yourself; report to the user instead).

```bash
git add dev/fixtures.ts
git commit -m "refactor(integrity): two integrity demo fixtures (ok + breach with per-part detail)"
```

---

### Task 10: Architecture doc + full gate

**Files:**
- Modify: `docs/architecture/integrity.md`
- Modify: `docs/plans/2026-07-16-integrity-simplification-design.md` (status line)

- [ ] **Step 1: Update `integrity.md`**

- §1 + §3.1: revision = `{ hash: {md5?, sha256}, context, [payload] }` where `context` is `{ operation, origin, date, reason? }` — an actor **category**, never an identity; add the trail/journal split paragraph (identity-level attribution lives in the events/journal system; the locked trail records the *kind* of legitimate write). Key layout drops the `‹class›` segment (joint anchor).
- §3.2: outbox sub-doc is `_needsHistorizing: { context? }` (a stamp = "re-anchor"); enable/fix are synchronous and bypass the outbox.
- §3.3: remove the realtime/websocket bullet; `_fix` responds with the fresh verdict directly.
- §5: document the D1 normalization (owner/topics/permissions/shareOrgs reduced to identifying keys) and the rule for bulk writers (genuine covered-content changes stamp; name syncs don't need to).
- §7: remove `realtime-integrity` from the operations list; `_fix` returns the check result.
- §8: replace the "context retained even under GDPR pressure" stance with: the context contains no personal data by construction (origin categories), so retention no longer conflicts with user-erasure requests; the owner-level wait-out (§8) is unchanged.
- §10: note the simplification (joint anchor, depersonalized context, sync admin actions) with a pointer to this plan/design.

- [ ] **Step 2: Design doc status + final gate**

Set the design doc's `> Status:` line to `implemented <date> on feat-integrity3 (this plan)`.

Run the full gate:

```bash
npm run lint
npm run check-types            # ratchet: no net-new tsc errors
npx playwright test tests/features/integrity/
```

Expected: lint clean, ratchet green, integrity suite green. Then:

```bash
git add docs/architecture/integrity.md docs/plans/2026-07-16-integrity-simplification-design.md
git commit -m "docs(integrity): joint anchor, trail/journal split, sync admin actions"
```

- [ ] **Step 3: Verify the whole diff reads as a net deletion**

Run: `git diff e41148af0..HEAD --stat | tail -3` — expect deletions to clearly exceed insertions across `api/src` and `tests`. Report the before/after line counts of `api/src/integrity/` + instrumentation sites in the completion summary.
