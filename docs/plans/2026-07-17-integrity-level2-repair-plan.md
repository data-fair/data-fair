# Integrity Level 2 (Repair) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every integrity anchor revision additionally stores the full payload (file copy + covered-metadata snapshot), unlocking metadata diff, audit download of any historical file version, and restore of the hot dataset from any stored revision.

**Architecture:** The spec is `docs/plans/2026-07-17-integrity-level2-repair-design.md` — read it first. Metadata snapshot goes inline in the revision JSON (`payload.metadata`); the file copy is a sibling locked object at `{i}.file` written *before* the revision JSON. Dedupe becomes payload-aware (self-healing upgrade of L1-era anchors). Restore is a superadmin route: metadata-only restores are synchronous (like `_fix`); file restores re-ingest through the standard draft/worker pipeline with a `restore` outbox context preserved by finalize. Owner transfer is forbidden while integrity is active.

**Tech Stack:** TypeScript (Node, `--experimental-strip-types`), Express 5, MongoDB, S3 (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage` — already a dependency), MinIO in dev/test, Playwright tests, Vue 3 + Vuetify UI.

## Global Constraints

- Never start/stop dev processes; tests run against the test env (`npx playwright test <file>` — see `docs/architecture/testing.md`). Run only the related spec files, not the whole suite.
- Type ratchet: no net-new tsc errors (`dev/check-types-ratchet.sh` gates pushes). `npm run lint` must stay clean (a pre-commit hook runs it).
- Key layout is frozen: `data-fair/{owner.type}-{owner.id}/{datasetId}/{i}` (zero-padded width 9). The payload suffix is exactly `.file`.
- The WORM store must never receive personal data: `payload.metadata` is the covered projection only (already strips `createdBy`/`updatedBy`, normalizes denormalized names).
- Write order is payload first, then revision JSON — never the reverse.
- All code comments in English; UI strings in French + English (component `<i18n>` blocks).

---

### Task 1: Store payload primitives

**Files:**
- Modify: `api/src/integrity/store.ts`
- Test: `tests/features/integrity/core.api.spec.ts`

**Interfaces:**
- Consumes: existing `IntegrityStore` (S3 client wrapper), `RevisionBody`.
- Produces: `RevisionBody.payload?: { metadata: Record<string, any>, file?: { size: number } }`; `IntegrityStore.writePayload(key: string, body: Readable, retainUntil: Date): Promise<void>`; `IntegrityStore.readPayload(key: string): Promise<{ body: Readable, size?: number }>`. Later tasks (4, 8, 9, 10) rely on these exact names.

- [ ] **Step 1: Write the failing tests** — append to the "store" section of `tests/features/integrity/core.api.spec.ts`:

```ts
test('writePayload stores a compliance-locked binary sibling object', async () => {
  const store = integrityTestStore
  const base = `data-fair/test-store-payload/${Date.now()}/000000000`
  const retainUntil = new Date(Date.now() + 24 * 3600 * 1000)
  const { Readable } = await import('node:stream')
  await store.writePayload(base + '.file', Readable.from(Buffer.from('payload-bytes')), retainUntil)

  const { body, size } = await store.readPayload(base + '.file')
  const chunks: Buffer[] = []
  for await (const c of body) chunks.push(c as Buffer)
  expect(Buffer.concat(chunks).toString()).toBe('payload-bytes')
  expect(size).toBe('payload-bytes'.length)

  // WORM: the locked payload version cannot be destroyed within retention
  const versionId = await originalVersionId(base + '.file')
  await expect(integrityTestClient.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: base + '.file', VersionId: versionId })))
    .rejects.toThrow()
})

test('a revision body can carry an inline metadata payload', async () => {
  const store = integrityTestStore
  const key = `data-fair/test-store-meta/${Date.now()}/000000000`
  await store.writeRevision(key, {
    hash: { md5: 'abc', sha256: 'def' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: 'ds-meta' },
    payload: { metadata: { title: 'snap' }, file: { size: 13 } }
  }, new Date(Date.now() + 24 * 3600 * 1000))
  const back = await store.getRevision(key)
  expect(back.payload?.metadata.title).toBe('snap')
  expect(back.payload?.file?.size).toBe(13)
})
```

Note: `originalVersionId` and `DeleteObjectCommand` already exist in this file (reuse them — `originalVersionId` reads the *first* version of a key, which is the only one here).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/core.api.spec.ts -g "writePayload|inline metadata payload"`
Expected: FAIL — `store.writePayload is not a function` / TS type error on `payload`.

- [ ] **Step 3: Implement in `api/src/integrity/store.ts`**

Add to imports: `import { Upload } from '@aws-sdk/lib-storage'` and `import type { Readable } from 'node:stream'`. Extend `RevisionBody`:

```ts
export type RevisionBody = {
  hash: { md5?: string, sha256?: string }
  context: RevisionContext
  dataset: { id: string, slug?: string }
  // level 2: the full covered-metadata projection, and the descriptor of the sibling
  // `{key}.file` locked object when the revision carries a file copy
  payload?: { metadata: Record<string, any>, file?: { size: number } }
}
```

Add two methods to `IntegrityStore`:

```ts
  // Level-2 file payload: a sibling `{revisionKey}.file` object under the same compliance
  // lock, streamed via multipart upload (files can be many GB).
  async writePayload (key: string, body: Readable, retainUntil: Date): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/octet-stream',
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: retainUntil
      }
    })
    await upload.done()
  }

  async readPayload (key: string): Promise<{ body: Readable, size?: number }> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return { body: res.Body as Readable, size: res.ContentLength }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/integrity/core.api.spec.ts -g "writePayload|inline metadata payload"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/store.ts tests/features/integrity/core.api.spec.ts
git commit -m "feat(integrity): store primitives for level-2 payloads (inline metadata + .file sibling)"
```

---

### Task 2: Suffix-aware key operations

**Files:**
- Modify: `api/src/integrity/operations.ts`
- Test: `tests/features/integrity/operations.unit.spec.ts`

**Interfaces:**
- Produces: `PAYLOAD_SUFFIX = '.file'`, `payloadKey(owner, datasetId, i): string`, `isPayloadKey(key): boolean`; `latestKey` and `nextIndex` now ignore payload keys. Tasks 4, 5, 8, 9, 10 use `payloadKey`/`isPayloadKey`.

- [ ] **Step 1: Write the failing tests** — append to `tests/features/integrity/operations.unit.spec.ts`:

```ts
test('payloadKey appends the .file suffix to the revision key', () => {
  expect(ops.payloadKey(owner, 'ds1', 7)).toBe('data-fair/organization-acme/ds1/000000007.file')
  expect(ops.isPayloadKey('data-fair/organization-acme/ds1/000000007.file')).toBe(true)
  expect(ops.isPayloadKey('data-fair/organization-acme/ds1/000000007')).toBe(false)
})

test('latestKey and nextIndex ignore payload keys', () => {
  const keys = [
    'data-fair/organization-acme/ds1/000000000',
    'data-fair/organization-acme/ds1/000000001',
    'data-fair/organization-acme/ds1/000000001.file'
  ]
  expect(ops.latestKey(keys)).toBe('data-fair/organization-acme/ds1/000000001')
  expect(ops.nextIndex(keys)).toBe(2)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/operations.unit.spec.ts -g "payloadKey|ignore payload keys"`
Expected: FAIL — `ops.payloadKey is not a function`; `latestKey` returns the `.file` key (lexically greater).

- [ ] **Step 3: Implement in `api/src/integrity/operations.ts`** — add after `parseRevisionIndex`:

```ts
// Level-2 file payloads are sibling objects `{revisionKey}.file` under the dataset prefix;
// every consumer of a prefix listing must distinguish them from revision JSONs.
export const PAYLOAD_SUFFIX = '.file'

export const payloadKey = (owner: { type: string, id: string }, datasetId: string, i: number): string =>
  revisionKey(owner, datasetId, i) + PAYLOAD_SUFFIX

export const isPayloadKey = (key: string): boolean => key.endsWith(PAYLOAD_SUFFIX)
```

And make `nextIndex` and `latestKey` filter (payload keys would otherwise win the lexical sort):

```ts
export const nextIndex = (keys: string[]): number => {
  let max = -1
  for (const k of keys) {
    if (isPayloadKey(k)) continue
    const i = parseRevisionIndex(k)
    if (!Number.isNaN(i) && i > max) max = i
  }
  return max + 1
}

export const latestKey = (keys: string[]): string | undefined => {
  const revisionKeys = keys.filter((k) => !isPayloadKey(k))
  if (!revisionKeys.length) return undefined
  return revisionKeys.sort().at(-1) // zero-padded ⇒ lexical sort == numeric order
}
```

- [ ] **Step 4: Run the whole unit spec to verify pass + no regression**

Run: `npx playwright test tests/features/integrity/operations.unit.spec.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/operations.ts tests/features/integrity/operations.unit.spec.ts
git commit -m "feat(integrity): suffix-aware revision key operations for .file payloads"
```

---

### Task 3: `anchorDataset` writes payloads, payload-aware dedupe

**Files:**
- Modify: `api/src/integrity/relay.ts`, `api/src/integrity/hash.ts`
- Test: `tests/features/integrity/core.api.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`writePayload`, `RevisionBody.payload`), Task 2 (`payloadKey`, filtered `latestKey`/`nextIndex`).
- Produces: every new anchor written by `anchorDataset` carries `payload.metadata` (+ `payload.file` and the `.file` object for file datasets). Dedupe rule: skip only when hashes match AND the latest revision has a payload. `hash.ts` exports `md5Tee(): { stream: Transform, digest: () => string }`.

- [ ] **Step 1: Write the failing tests** — append to the relay section of `core.api.spec.ts`:

```ts
test('anchor carries the level-2 payload: inline metadata snapshot + locked .file sibling', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const keys = await listIntegrityKeys(prefix)
  expect(keys).toContain(`${prefix}000000000`)
  expect(keys).toContain(`${prefix}000000000.file`)

  const rev = await integrityTestStore.getRevision(`${prefix}000000000`)
  expect(rev.payload?.metadata.title).toBe(dataset.title)
  expect(rev.payload?.metadata.createdBy).toBeUndefined() // covered projection only
  expect(rev.payload?.file?.size).toBeGreaterThan(0)

  const { body } = await integrityTestStore.readPayload(`${prefix}000000000.file`)
  const chunks: Buffer[] = []
  for await (const c of body) chunks.push(c as Buffer)
  const { createHash } = await import('node:crypto')
  expect(createHash('md5').update(Buffer.concat(chunks)).digest('hex')).toBe(rev.hash.md5)
})

test('dedupe is payload-aware: an L1-era anchor self-heals to level 2', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)

  // unchanged state and a payload-bearing latest anchor → dedupe, no new revision
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  expect((await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).length).toBe(1)

  // simulate an L1-era anchor: write a payload-less revision as index 1 directly to the store
  const rev0 = await integrityTestStore.getRevision(`${prefix}000000000`)
  await integrityTestStore.writeRevision(`${prefix}000000001`, {
    hash: rev0.hash, context: { operation: 'update', origin: 'worker', date: new Date().toISOString() }, dataset: { id: dataset.id }
  }, new Date(Date.now() + 24 * 3600 * 1000))

  // hashes match but the latest anchor has no payload → a fresh payload-bearing revision is written
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  const keys = await listIntegrityKeys(prefix)
  expect(keys).toContain(`${prefix}000000002`)
  expect(keys).toContain(`${prefix}000000002.file`)
  expect((await integrityTestStore.getRevision(`${prefix}000000002`)).payload?.metadata).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/core.api.spec.ts -g "level-2 payload|self-heals"`
Expected: FAIL — no `.file` key, `rev.payload` undefined, index-1 dedupe skips.

- [ ] **Step 3: Implement**

In `api/src/integrity/hash.ts`, add (mirrors the md5 tee in `api/src/datasets/utils/upload.ts:21`):

```ts
import { Transform } from 'node:stream'

// pass-through md5: hash the payload bytes while they stream to the store, so the anchor's
// md5 always describes the bytes actually stored in the payload (single read of the file)
export const md5Tee = () => {
  const hash = createHash('md5')
  const stream = new Transform({ transform (chunk, _enc, cb) { hash.update(chunk); cb(null, chunk) } })
  return { stream, digest: () => hash.digest('hex') }
}
```

In `api/src/integrity/relay.ts`, import `filesStorage` (`import filesStorage from '#files-storage'`), `md5Tee` from `./hash.ts`, and rework the second half of `anchorDataset` (after `hash.sha256 = ops.metadataHash(fresh)`):

```ts
  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const keys = (await store.listRevisions(prefix)).map((r) => r.key)
  const latest = ops.latestKey(keys)
  if (latest) {
    const latestRevision = await store.getRevision(latest)
    const latestHash = latestRevision.hash
    // level 2: only a payload-bearing anchor is a valid dedupe target — an L1-era anchor
    // with matching hashes still gets a fresh revision, so the store self-heals to level 2
    if (latestHash.md5 === hash.md5 && latestHash.sha256 === hash.sha256 && latestRevision.payload) {
      // (keep the existing lastRevision-restore branch body unchanged)
      ...
      return // already anchored
    }
  }

  const i = ops.nextIndex(keys)
  const operation: ops.RevisionOperation = hint?.operation ?? (i === 0 ? 'create' : 'update')
  const context: ops.RevisionContext = {
    operation,
    origin: hint?.origin ?? 'worker',
    date,
    ...(hint?.reason ? { reason: hint.reason } : {})
  }
  // payload FIRST, revision JSON second: a crash in between leaves an orphan .file that ages
  // out harmlessly — the reverse would leave a revision claiming a payload it doesn't have
  const payload: NonNullable<RevisionBody['payload']> = { metadata: ops.coveredMetadata(fresh) }
  if (hash.md5) {
    const { body, size } = await filesStorage.readStream(datasetUtils.originalFilePath(dataset))
    const tee = md5Tee()
    body.on('error', (err) => tee.stream.destroy(err))
    await store.writePayload(ops.payloadKey(dataset.owner, dataset.id, i), body.pipe(tee.stream), retainUntil)
    // the file may have changed since the dedupe-check read: the anchor must describe the
    // payload's actual bytes, so the teed md5 wins over the first-pass one
    hash.md5 = tee.digest()
    payload.file = { size }
  }
  await store.writeRevision(ops.revisionKey(dataset.owner, dataset.id, i), {
    hash,
    context,
    dataset: { id: dataset.id, slug: dataset.slug },
    payload
  }, retainUntil)
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.lastRevision': { i, hash, date, retainUntil: retainUntil.toISOString() } }
  })
```

Import `RevisionBody` as a type from `./store.ts`.

- [ ] **Step 4: Run tests to verify pass + no regression on the whole file**

Run: `npx playwright test tests/features/integrity/core.api.spec.ts`
Expected: PASS (all — pre-existing relay/checker tests must still pass; if a pre-existing test asserts exact key counts, update it for the new `.file` siblings)

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/relay.ts api/src/integrity/hash.ts tests/features/integrity/core.api.spec.ts
git commit -m "feat(integrity): anchors carry level-2 payloads with payload-aware self-healing dedupe"
```

---

### Task 4: Lock renewal covers the payload object

**Files:**
- Modify: `api/src/integrity/checker.ts`
- Test: `tests/features/integrity/core.api.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`isPayloadKey` not needed here; `latest + PAYLOAD_SUFFIX` addressing), Task 3 (revisions carry `payload`).
- Produces: `maybeRenew(dataset, store, latestKey, latestRevision)` — the extra `latestRevision: RevisionBody` parameter. `checkDataset` already fetches the latest revision; it now passes the whole body, not just `.hash`.

- [ ] **Step 1: Write the failing test** — append to the checker section of `core.api.spec.ts` (pattern on the existing renewal test in that file, which forces `integrity.lastRevision.retainUntil` into the past via `test-env` raw patch or direct mongo access — reuse its exact mechanism):

```ts
test('lock renewal extends the payload object too', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  // age the lock hint so needsRenewal fires (same trick as the existing renewal test)
  await admin.post(`${apiUrl}/test-env/patch-dataset/${dataset.id}`, {
    'integrity.lastRevision.retainUntil': new Date(Date.now() + 1000).toISOString()
  })
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)

  const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
  const revHead = await integrityTestClient.send(new HeadObjectCommand({ Bucket: 'data-fair-integrity', Key: `${prefix}000000000` }))
  const payloadHead = await integrityTestClient.send(new HeadObjectCommand({ Bucket: 'data-fair-integrity', Key: `${prefix}000000000.file` }))
  const yearFromNow = Date.now() + 300 * 24 * 3600 * 1000
  expect(revHead.ObjectLockRetainUntilDate!.getTime()).toBeGreaterThan(yearFromNow)
  expect(payloadHead.ObjectLockRetainUntilDate!.getTime()).toBeGreaterThan(yearFromNow)
})
```

(Adjust the aging mechanism to exactly match the existing renewal test in this file — read it first; the `test-env/patch-dataset` route at `api/src/misc/routers/test-env.ts:101` does a raw `$set`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/integrity/core.api.spec.ts -g "payload object too"`
Expected: FAIL — the `.file` head still shows the original ~1-day (dev retention) retain-until while the revision JSON was extended.

- [ ] **Step 3: Implement in `api/src/integrity/checker.ts`**

Change `maybeRenew` to receive the revision body and extend both objects:

```ts
import { PAYLOAD_SUFFIX } from './operations.ts'
import type { RevisionBody } from './store.ts'

const maybeRenew = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, latestKey: string, latestRevision: RevisionBody): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal((dataset.integrity as any)?.lastRevision?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  try {
    await store.extendRetention(latestKey, retainUntil)
    // the sliding anchor is the revision *pair*: a level-2 anchor's repairability dies with
    // its payload's lock, so the .file sibling must slide forward too
    if (latestRevision.payload?.file) await store.extendRetention(latestKey + PAYLOAD_SUFFIX, retainUntil)
    ... // (existing success updateOne unchanged)
  } catch (err) {
    ... // (existing failure branch unchanged)
  }
}
```

In `checkDataset`, replace `const expected = (await store.getRevision(latest)).hash` with:

```ts
  const latestRevision = await store.getRevision(latest)
  const expected = latestRevision.hash
```

and the renewal call with `if (status === 'ok') await maybeRenew(dataset, store, latest, latestRevision)`.

- [ ] **Step 4: Run the whole core spec**

Run: `npx playwright test tests/features/integrity/core.api.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/checker.ts tests/features/integrity/core.api.spec.ts
git commit -m "feat(integrity): lock renewal slides the payload object's lock with the revision's"
```

---

### Task 5: Forbid owner transfer while integrity is active

**Files:**
- Modify: `api/src/datasets/routes/metadata.ts` (route `PUT /:datasetId/owner`, ~line 191)
- Modify: `docs/architecture/integrity.md` (§3.1 owner-transfer note)
- Test: `tests/features/integrity/admin.api.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PUT /datasets/{id}/owner` → 400 when `dataset.integrity?.active`; the `stampHistorize` import and call in `metadata.ts` are deleted.

- [ ] **Step 1: Write the failing test** — append to `admin.api.spec.ts`:

```ts
test('owner transfer is refused while integrity is active', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  await expect(admin.put(`/api/v1/datasets/${dataset.id}/owner`, { type: 'organization', id: 'test_org', name: 'Org' }))
    .rejects.toMatchObject({ status: 400 })

  // disabling integrity unblocks the transfer
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false })
  const res = await admin.put(`/api/v1/datasets/${dataset.id}/owner`, { type: 'organization', id: 'test_org', name: 'Org' })
  expect(res.status).toBe(200)
})
```

(Check how existing tests in the suite name a transfer-target organization the superadmin can use — grep `'/owner'` under `tests/` and reuse that owner body; adjust `test_org` accordingly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/integrity/admin.api.spec.ts -g "owner transfer is refused"`
Expected: FAIL — the transfer currently succeeds (200).

- [ ] **Step 3: Implement**

In `api/src/datasets/routes/metadata.ts`, at the top of the `PUT /:datasetId/owner` handler (right after `const dataset: any = reqDataset(req)`):

```ts
    // integrity anchors are owner-scoped (data-fair/‹owner.type›-‹owner.id›/…): transferring
    // would orphan the anchor sequence. Deliberate simplification: disable integrity first.
    if (dataset.integrity?.active) {
      return res.status(400).type('text/plain').send('Le contrôle d\'intégrité doit être désactivé avant un changement de propriétaire')
    }
```

Then delete the now-dead re-anchor stamp (lines ~253-256): remove the `stampHistorize(changeOwnerUpdate, …)` call, its comment, and the `import { stampHistorize } from '../../integrity/operations.ts'` (line 30) if no other use remains in the file. Also delete any existing test that asserted the transfer-re-anchor behavior (grep `owner` in `tests/features/integrity/`).

In `docs/architecture/integrity.md` §3.1, replace the owner-transfer bullet ("Keys are **owner-scoped** … not migrated or deleted.") with:

```markdown
- Keys are **owner-scoped** (`‹owner.type›-‹owner.id›` segment). Owner transfer is
  **forbidden while integrity is active** (the transfer route returns 400): a transfer would
  orphan the anchor sequence under the old prefix. To transfer, a superadmin disables
  integrity (anchors age out at their existing retention), transfers, and re-enables — a
  deliberate simplification over re-anchoring under the new prefix.
```

- [ ] **Step 4: Run tests**

Run: `npx playwright test tests/features/integrity/admin.api.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/routes/metadata.ts docs/architecture/integrity.md tests/features/integrity/admin.api.spec.ts
git commit -m "feat(integrity): forbid owner transfer while integrity is active"
```

---

### Task 6: Restore pure functions

**Files:**
- Modify: `api/src/integrity/operations.ts`
- Test: `tests/features/integrity/operations.unit.spec.ts`

**Interfaces:**
- Consumes: `coveredMetadata`, `coveredPatchKeys` (existing).
- Produces: `restoreUpdate(hot: Record<string, any>, snapshot: Record<string, any>): { $set: Record<string, any>, $unset: Record<string, any> }` and `rehydrateTopics(topics: Array<{ id: string }>, settingsTopics: any[]): any[]`. `RevisionOperation` union gains `'restore'`. Task 8/9 (the route) consume all three.

- [ ] **Step 1: Write the failing tests** — append to `operations.unit.spec.ts`:

```ts
test('restoreUpdate writes only diverging covered keys and unsets extra ones', () => {
  const snapshot = { title: 'legit', description: 'legit desc', owner: { type: 'organization', id: 'acme' } }
  const hot = {
    title: 'tampered',
    description: 'legit desc',
    injected: 'evil',
    status: 'finalized', // denylisted: must never be touched
    owner: { type: 'organization', id: 'acme', name: 'Acme Corp' } // normalizes to snapshot → untouched
  }
  const { $set, $unset } = ops.restoreUpdate(hot, snapshot)
  expect($set).toEqual({ title: 'legit' }) // description equal → skipped; owner equal after normalization → skipped
  expect($unset).toEqual({ injected: '' })
})

test('restoreUpdate restores a tampered owner as its normalized form', () => {
  const snapshot = { owner: { type: 'organization', id: 'acme' } }
  const hot = { owner: { type: 'organization', id: 'evil', name: 'Evil' } }
  expect(ops.restoreUpdate(hot, snapshot).$set.owner).toEqual({ type: 'organization', id: 'acme' })
})

test('rehydrateTopics fills titles back from settings, keeps unknown ids bare', () => {
  const settingsTopics = [{ id: 't1', title: 'Topic 1', color: '#f00' }]
  expect(ops.rehydrateTopics([{ id: 't1' }, { id: 'gone' }], settingsTopics))
    .toEqual([{ id: 't1', title: 'Topic 1', color: '#f00' }, { id: 'gone' }])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/operations.unit.spec.ts -g "restoreUpdate|rehydrateTopics"`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement in `api/src/integrity/operations.ts`**

Extend the operation enum: `export type RevisionOperation = 'create' | 'update' | 'enable' | 'fixIntegrity' | 'restore'`.

Add:

```ts
// Level-2 metadata restore (spec §C): compare the hot doc's *covered projection* against the
// snapshot per key, and write back only genuinely diverging keys. Comparing projections (not raw
// fields) means a field whose only difference is denormalized-name noise (owner/topics display
// names) is left untouched — normalized loss only happens where tampering actually happened.
export const restoreUpdate = (
  hot: Record<string, any>,
  snapshot: Record<string, any>
): { $set: Record<string, any>, $unset: Record<string, any> } => {
  const hotCovered = coveredMetadata(hot)
  const $set: Record<string, any> = {}
  const $unset: Record<string, any> = {}
  for (const key of Object.keys(snapshot)) {
    if (stableStringify(hotCovered[key] ?? null) !== stableStringify(snapshot[key] ?? null)) $set[key] = snapshot[key]
  }
  // covered keys present on the hot doc but absent from the snapshot were added out-of-band
  for (const key of Object.keys(hotCovered)) {
    if (!(key in snapshot)) $unset[key] = ''
  }
  return { $set, $unset }
}

// snapshots store topics as { id } only (D1 normalization); on restore, re-hydrate the display
// fields from their authoritative source (the owner's settings.topics). An id no longer present
// in settings stays bare — the same state a topic-deletion propagation would leave.
export const rehydrateTopics = (topics: Array<{ id: string }>, settingsTopics: any[]): any[] =>
  topics.map((t) => settingsTopics.find((st) => st.id === t.id) ?? t)
```

- [ ] **Step 4: Run the whole unit spec**

Run: `npx playwright test tests/features/integrity/operations.unit.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/operations.ts tests/features/integrity/operations.unit.spec.ts
git commit -m "feat(integrity): restoreUpdate/rehydrateTopics pure operations + restore operation type"
```

---

### Task 7: `_restore` route — metadata-only path (synchronous)

**Files:**
- Modify: `api/src/datasets/routes/integrity.ts`
- Test: `tests/features/integrity/admin.api.spec.ts`

**Interfaces:**
- Consumes: Task 6 (`restoreUpdate`, `rehydrateTopics`, `'restore'`), Task 3 (payload-bearing anchors), Task 1 (`getRevision`).
- Produces: `POST /datasets/{id}/_integrity/_restore` body `{ i: number, reason?: string }` — superadmin-only; metadata-only restores respond with the fresh check verdict `{ status, date, breach? }`. Task 8 extends the same route with the file path; Task 9's endpoints share its guards.

- [ ] **Step 1: Write the failing tests** — append to `admin.api.spec.ts` (the raw out-of-band metadata write uses the dev/test-only `test-env/patch-dataset` route, as the existing breach tests in this file do — mirror their call shape exactly):

```ts
test('restore heals a tampered metadata field synchronously and appends a restore revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  // out-of-band tamper (no outbox stamp)
  await admin.post(`${apiUrl}/test-env/patch-dataset/${dataset.id}`, { description: 'tampered-oob' })
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')

  const res = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_restore`, { i: 0, reason: 'undo tamper' })).data
  expect(res.status).toBe('ok') // synchronous: responds with the fresh verdict

  const raw = await getRawDataset(dataset.id)
  expect(raw.description ?? '').not.toBe('tampered-oob')

  // the restore appended a new revision with the restore context
  const keys = (await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file')).sort()
  const latest = await integrityTestStore.getRevision(keys.at(-1)!)
  expect(latest.context.operation).toBe('restore')
  expect(latest.context.origin).toBe('superadmin')
  expect(latest.context.reason).toBe('undo tamper')
})

test('restore guards: inactive, unknown index, payload-less revision, non-admin', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const user = await axiosAuth('test_superadmin@test.com', undefined, false)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)

  await expect(admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_restore`, { i: 0 })).rejects.toMatchObject({ status: 400 }) // inactive
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await expect(user.post(`/api/v1/datasets/${dataset.id}/_integrity/_restore`, { i: 0 })).rejects.toMatchObject({ status: 403 })
  await expect(admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_restore`, { i: 99 })).rejects.toMatchObject({ status: 404 })

  // an L1-era (payload-less) revision is not restorable
  await integrityTestStore.writeRevision(`${prefix}000000001`, {
    hash: (await integrityTestStore.getRevision(`${prefix}000000000`)).hash,
    context: { operation: 'update', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: dataset.id }
  }, new Date(Date.now() + 24 * 3600 * 1000))
  await expect(admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_restore`, { i: 1 })).rejects.toMatchObject({ status: 400 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/admin.api.spec.ts -g "restore heals|restore guards"`
Expected: FAIL — 404 route not found.

- [ ] **Step 3: Implement in `api/src/datasets/routes/integrity.ts`**

Add imports: `restoreUpdate`, `rehydrateTopics`, `revisionKey` from `../../integrity/operations.ts`; `isFileDataset` is already imported; `md5OfStorageFile` from `../../integrity/hash.ts`; `originalFilePath` via existing dataset utils import pattern (`import * as datasetUtils from '../utils/index.ts'`).

```ts
  router.post('/:datasetId/_integrity/_restore', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const i = req.body?.i
    if (!Number.isInteger(i) || i < 0) throw httpError(400, 'missing or invalid revision index "i"')
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
    const store = integrityStore()
    const revision = await store.getRevision(revisionKey(dataset.owner, dataset.id, i)).catch((err: any) => {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) throw httpError(404, 'unknown revision')
      throw err
    })
    if (!revision.payload) throw httpError(400, 'this revision has no payload (level-1 anchor): not restorable')

    // metadata part: write back only the genuinely diverging covered keys
    const fresh = await mongo.datasets.findOne({ id: dataset.id })
    if (!fresh) throw httpError(404, 'dataset not found')
    const { $set, $unset } = restoreUpdate(fresh, revision.payload.metadata)
    if ($set.topics) {
      const settings = await mongo.db.collection('settings').findOne({ type: dataset.owner.type, id: dataset.owner.id })
      $set.topics = rehydrateTopics($set.topics, settings?.topics ?? [])
    }
    if (Object.keys($set).length || Object.keys($unset).length) {
      const update: any = { $set: { ...$set, updatedAt: new Date().toISOString() } }
      if (Object.keys($unset).length) update.$unset = $unset
      await mongo.datasets.updateOne({ id: dataset.id }, update)
    }

    // metadata-only restore (file part comes in the next iteration of this route): re-anchor
    // synchronously with the restore context and respond with the fresh verdict, like _fix
    await anchorDataset(dataset, { operation: 'restore', origin: 'superadmin', reason })
    await mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizing: '' } })
    const checker = await import('../../integrity/checker.ts')
    const freshAfter = await mongo.datasets.findOne({ id: dataset.id })
    res.json(await checker.checkDataset(freshAfter as any))
  })
```

(The exact shape of the store's 404 error against MinIO: verify in the test run and adjust the catch condition; `err.name === 'NoSuchKey'` is the AWS SDK v3 shape.)

- [ ] **Step 4: Run tests**

Run: `npx playwright test tests/features/integrity/admin.api.spec.ts -g "restore heals|restore guards"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/routes/integrity.ts tests/features/integrity/admin.api.spec.ts
git commit -m "feat(integrity): synchronous metadata restore route (_restore)"
```

---

### Task 8: `_restore` route — file path (re-ingest via pipeline)

**Files:**
- Modify: `api/src/datasets/routes/integrity.ts`, `api/src/workers/short-processor/finalize.ts` (line ~40)
- Test: `tests/features/integrity/admin.api.spec.ts`

**Interfaces:**
- Consumes: Task 7 (route skeleton), Task 1 (`readPayload`), Task 2 (`payloadKey`); `preparePatch` from `api/src/datasets/utils/patch.ts:18` (`preparePatch(app, patch, dataset, sessionState, locale, draftValidationMode, files)`), `applyPatch` from `api/src/datasets/service.ts:430`, `loadingDir` from `api/src/datasets/utils/index.ts:39`.
- Produces: a restore whose stored-file md5 differs re-ingests the payload through the standard draft pipeline and responds `{ status: 'restoring' }`; finalize preserves a pre-set `_needsHistorizing` context instead of overwriting it.

- [ ] **Step 1: Write the failing test** — append to `admin.api.spec.ts` (the file tamper uses the dev/test-only `test-env/tamper-dataset-file` route, as existing breach tests do; `doAndWaitForFinalize` comes from `tests/support/workers.ts` — check its exact signature in `core.api.spec.ts` usage before writing):

```ts
test('restore re-ingests a tampered file through the pipeline and anchors with restore context', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  const originalMd5 = dataset.originalFile.md5

  await admin.post(`${apiUrl}/test-env/tamper-dataset-file/${dataset.id}`, { content: 'a,b\n1,tampered' })
  expect((await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.status).toBe('breach')

  const res = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_restore`, { i: 0, reason: 'undo file tamper' })).data
  expect(res.status).toBe('restoring')

  // the pipeline reprocesses the restored bytes; finalize re-anchors with the restore context
  const keys = await waitForIntegrityRevisions(prefix, 3) // rev 0, its .file, + the new pair
  const raw = await waitForFlagCleared(dataset.id)
  expect(raw.originalFile.md5).toBe(originalMd5)

  const revKeys = keys.filter(k => !k.endsWith('.file')).sort()
  const latest = await integrityTestStore.getRevision(revKeys.at(-1)!)
  expect(latest.context.operation).toBe('restore')
  expect(latest.context.origin).toBe('superadmin')

  expect((await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data.status).toBe('ok')
})
```

Note on `waitForIntegrityRevisions(prefix, 3)`: the helper counts raw keys under the prefix (payloads included). After enable there are 2 keys (rev 0 + `.file`); wait for ≥4 if the count proves off — assert on the *filtered* revision list, not the raw count.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/integrity/admin.api.spec.ts -g "re-ingests a tampered file"`
Expected: FAIL — the current route answers with a check verdict (`ok`/`breach`), never `restoring`, and `originalFile.md5` stays the tampered value... (the sync `anchorDataset` in Task 7's version would anchor the *tampered* file — this task fixes that).

- [ ] **Step 3: Implement**

**(a) `api/src/workers/short-processor/finalize.ts` line ~40** — preserve a pre-set context. Replace:

```ts
  if (dataset.integrity?.active) result._needsHistorizing = { context: { operation: 'update', origin: 'worker' } }
```

with:

```ts
  // preserve a caller-provided context (e.g. the _restore route rides its 'restore' context
  // through the draft: mergeDraft overlays draft._needsHistorizing onto the working doc);
  // default to the generic worker context otherwise
  if (dataset.integrity?.active) result._needsHistorizing = (dataset as any)._needsHistorizing ?? { context: { operation: 'update', origin: 'worker' } }
```

(Keep the existing draft-routing comment above it — it still applies.)

**(b) `api/src/datasets/routes/integrity.ts`** — in the `_restore` handler, after the metadata write and **before** the synchronous anchor, insert the file branch. New imports: `path` (`import path from 'node:path'`), `clone` (`import clone from '@data-fair/lib-utils/clone.js'`), `filesStorage` (`import filesStorage from '#files-storage'`), `preparePatch` (`import { preparePatch } from '../utils/patch.ts'`), `applyPatch` (`import { applyPatch } from '../service.ts'`), `payloadKey` from operations, `md5OfStorageFile` from `../../integrity/hash.ts`, `reqSessionAuthenticated` from `@data-fair/lib-express`:

```ts
    // file part: the stored file's actual bytes vs the revision's md5 (metadata fields can lie)
    const currentMd5 = isFileDataset(dataset)
      ? await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err: any) => {
        if (err.status === 404) return undefined
        throw err
      })
      : undefined
    if (revision.payload.file && revision.hash.md5 !== currentMd5) {
      // re-ingest through the standard file-replacement path (spec §C): the payload lands in the
      // loading dir exactly as an upload would, preparePatch/applyPatch route it through the
      // draft pipeline, and finalize re-anchors with the restore context riding the draft
      const filename = revision.payload.metadata.originalFile?.name ?? dataset.originalFile?.name ?? 'restored-file'
      const destination = datasetUtils.loadingDir({ ...dataset, draftReason: true })
      const finalPath = path.join(destination, filename)
      const { body } = await store.readPayload(payloadKey(dataset.owner, dataset.id, i))
      await filesStorage.writeStream(body, finalPath)
      const stats = await filesStorage.fileStats(finalPath)
      const files = [{ fieldname: 'file', originalname: filename, filename, destination, path: finalPath, size: stats.size, md5: revision.hash.md5 }]

      const patch: any = { _needsHistorizing: { context: { operation: 'restore', origin: 'superadmin', ...(reason ? { reason } : {}) } } }
      const datasetClone: any = clone(dataset)
      await preparePatch(req.app, patch, datasetClone, reqSessionAuthenticated(req), req.getLocale(), 'always', files)
      await applyPatch(datasetClone, patch)
      res.json({ status: 'restoring' })
      return
    }

    // metadata-only restore: … (Task 7's synchronous anchor block, unchanged)
```

Mirror `updateDatasetRoute` (`api/src/datasets/routes/write.ts:127`) when in doubt about `preparePatch` details — it is the reference consumer. If `preparePatch` rejects the internal `_needsHistorizing` patch key (schema validation), set the flag via `datasetClone` draft routing as applyPatch does for finalize's internal keys — read `applyPatch` (`service.ts:430`) first; internal `_`-keys are routinely patched through it (`_esCopyToSearch` in finalize), so this should pass as-is.

- [ ] **Step 4: Run the whole admin spec**

Run: `npx playwright test tests/features/integrity/admin.api.spec.ts`
Expected: PASS (including Task 7's tests — the metadata-only path must still respond with a verdict)

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/routes/integrity.ts api/src/workers/short-processor/finalize.ts tests/features/integrity/admin.api.spec.ts
git commit -m "feat(integrity): file restore re-ingests the payload through the standard pipeline"
```

---

### Task 9: Revision detail, metadata diff data & file payload download

**Files:**
- Modify: `api/src/datasets/routes/integrity.ts`
- Test: `tests/features/integrity/admin.api.spec.ts`

**Interfaces:**
- Consumes: Tasks 1-3 (payload-bearing revisions, `readPayload`, `payloadKey`), `coveredMetadata` from operations, `pump` from `api/src/misc/utils/pipe.ts`, `contentDisposition` (`content-disposition` package, used in `routes/files.ts`).
- Produces: `GET /datasets/{id}/_integrity/revisions/{i}` → `{ i, hash, context, payload, current }` (`current` = live covered projection, for the UI diff); `GET /datasets/{id}/_integrity/revisions/{i}/file` → payload bytes; the list endpoint's rows gain `hasPayload: boolean` and `fileSize?: number`. Task 10 (UI) consumes all three.

- [ ] **Step 1: Write the failing tests** — append to `admin.api.spec.ts`:

```ts
test('revision detail returns snapshot + current projection; file endpoint streams the payload', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'edited legitimately' })
  await waitForFlagCleared(dataset.id)

  const list = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  expect(list.results[0].hasPayload).toBe(true)
  expect(list.results[0].fileSize).toBeGreaterThan(0)

  const detail = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions/0`)).data
  expect(detail.i).toBe(0)
  expect(detail.payload.metadata.description ?? '').not.toBe('edited legitimately') // the old snapshot
  expect(detail.current.description).toBe('edited legitimately') // the live projection

  const file = await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions/0/file`, { responseType: 'arraybuffer' })
  const { createHash } = await import('node:crypto')
  expect(createHash('md5').update(Buffer.from(file.data)).digest('hex')).toBe(detail.hash.md5)
  expect(file.headers['content-disposition']).toContain(dataset.originalFile.name)

  // reads follow the readIntegrityRevisions permission (same as the list endpoint)
  const anon = anonymousAx ?? (await import('../../support/axios.ts')).anonymousAx
  await expect(anon.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions/0`)).rejects.toMatchObject({ status: 403 })
})
```

(`anonymousAx` is already imported at the top of `admin.api.spec.ts` — use it directly; the existing permission-scoping test in this file shows the expected rejection status, mirror it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/integrity/admin.api.spec.ts -g "revision detail"`
Expected: FAIL — 404 on `/revisions/0`, `hasPayload` undefined.

- [ ] **Step 3: Implement in `api/src/datasets/routes/integrity.ts`**

**(a)** In the existing `GET /:datasetId/_integrity/revisions` handler: filter payload keys out of the listing and expose the payload descriptor. Replace the `keys` line with:

```ts
    const keys = (await store.listRevisions(revisionPrefix(dataset.owner, dataset.id))).map((r) => r.key)
      .filter((k) => !isPayloadKey(k)).sort().reverse()
```

and extend the mapped row:

```ts
      return {
        i: parseRevisionIndex(key),
        hash: rev.hash,
        date: rev.context.date,
        operation: rev.context.operation,
        origin: rev.context.origin,
        ...(rev.context.reason ? { reason: rev.context.reason } : {}),
        hasPayload: !!rev.payload,
        ...(rev.payload?.file ? { fileSize: rev.payload.file.size } : {})
      }
```

**(b)** Add the two read endpoints (same `readIntegrityRevisions` guard as the list; register them AFTER the list route — Express 5 matches them fine as distinct static/param paths):

```ts
  router.get('/:datasetId/_integrity/revisions/:i', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const i = parseInt(req.params.i as string, 10)
    if (Number.isNaN(i) || i < 0) throw httpError(400, 'invalid revision index')
    const store = integrityStore()
    const rev = await store.getRevision(revisionKey(dataset.owner, dataset.id, i)).catch((err: any) => {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) throw httpError(404, 'unknown revision')
      throw err
    })
    const fresh = await mongo.datasets.findOne({ id: dataset.id })
    // `current` is the live covered projection so the UI can render the metadata diff in one call
    res.json({ i, hash: rev.hash, context: rev.context, payload: rev.payload, current: fresh ? coveredMetadata(fresh) : undefined })
  })

  router.get('/:datasetId/_integrity/revisions/:i/file', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const i = parseInt(req.params.i as string, 10)
    if (Number.isNaN(i) || i < 0) throw httpError(400, 'invalid revision index')
    const store = integrityStore()
    const rev = await store.getRevision(revisionKey(dataset.owner, dataset.id, i)).catch((err: any) => {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) throw httpError(404, 'unknown revision')
      throw err
    })
    if (!rev.payload?.file) throw httpError(404, 'this revision has no file payload')
    const { body, size } = await store.readPayload(payloadKey(dataset.owner, dataset.id, i))
    res.setHeader('content-disposition', contentDisposition(rev.payload.metadata.originalFile?.name ?? `${dataset.slug}-revision-${i}`))
    res.setHeader('content-type', rev.payload.metadata.originalFile?.mimetype ?? 'application/octet-stream')
    if (size !== undefined) res.setHeader('content-length', String(size))
    await pump(body, res)
  })
```

New imports: `isPayloadKey`, `payloadKey`, `coveredMetadata`, `revisionKey` from operations; `contentDisposition` (`import contentDisposition from 'content-disposition'`); `pump` (`import pump from '../../misc/utils/pipe.ts'`).

- [ ] **Step 4: Run the whole admin spec**

Run: `npx playwright test tests/features/integrity/admin.api.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/routes/integrity.ts tests/features/integrity/admin.api.spec.ts
git commit -m "feat(integrity): revision detail (diff data) and file payload download endpoints"
```

---

### Task 10: UI — diff dialog, payload download, restore action

**Files:**
- Modify: `ui/src/components/dataset/dataset-integrity.vue`

**Interfaces:**
- Consumes: Task 9's endpoints (`revisions/{i}` → `{ i, hash, context, payload, current }`, `revisions/{i}/file`), Task 7/8's `POST _restore { i, reason? }` (responds `{ status: 'ok'|'breach'|'unknown'|'restoring' }`).
- Produces: revisions-table row actions. No automated test (matches the existing component, which has none) — verified by lint + types + the dev fixture (Task 11).

- [ ] **Step 1: Extend the revisions table.** In `dataset-integrity.vue`:

Add to `RevisionEntry`: `hasPayload?: boolean, fileSize?: number`.

Add an actions column to `headers`:

```ts
  { title: '', key: 'actions', sortable: false, align: 'end' as const }
```

Add the actions cell in the `<v-data-table-server>` (icons: add `mdiFileCompare`, `mdiDownload`, `mdiBackupRestore` to the `@mdi/js` import):

```html
          <template #item.actions="{ item }">
            <template v-if="item.hasPayload">
              <v-btn
                :icon="mdiFileCompare"
                variant="text"
                size="x-small"
                :title="t('viewDiff')"
                @click="openDiff(item.i)"
              />
              <v-btn
                v-if="item.fileSize"
                :icon="mdiDownload"
                variant="text"
                size="x-small"
                :title="t('downloadPayload')"
                :href="`${$apiPath}/datasets/${dataset!.id}/_integrity/revisions/${item.i}/file`"
              />
              <v-btn
                v-if="adminMode"
                :icon="mdiBackupRestore"
                variant="text"
                size="x-small"
                color="warning"
                :title="t('restore')"
                @click="restoreTarget = item.i; restoreReason = ''"
              />
            </template>
            <span
              v-else
              class="text-caption text-disabled"
            >{{ t('noPayload') }}</span>
          </template>
```

(Check how sibling components build download hrefs — grep `href` + `$apiPath` under `ui/src/components/dataset/`; reuse that exact base-path idiom instead of `$apiPath` if it differs.)

- [ ] **Step 2: Add the diff dialog** (simple two-column JSON compare of the changed keys):

```html
    <v-dialog
      v-model="diffOpen"
      max-width="1100"
    >
      <v-card :title="t('diffTitle', { i: diffData?.i })">
        <v-card-text v-if="diffData">
          <p
            v-if="!diffKeys.length"
            class="text-caption"
          >
            {{ t('noDiff') }}
          </p>
          <template
            v-for="key of diffKeys"
            :key="key"
          >
            <h4 class="text-subtitle-2 mt-2">
              {{ key }}
            </h4>
            <v-row dense>
              <v-col cols="6">
                <div class="text-caption">{{ t('diffRevision') }}</div>
                <pre class="text-caption bg-surface-light pa-2 overflow-auto">{{ pretty(diffData.payload.metadata[key]) }}</pre>
              </v-col>
              <v-col cols="6">
                <div class="text-caption">{{ t('diffCurrent') }}</div>
                <pre class="text-caption bg-surface-light pa-2 overflow-auto">{{ pretty(diffData.current?.[key]) }}</pre>
              </v-col>
            </v-row>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>
```

```ts
type RevisionDetail = { i: number, hash: { md5?: string, sha256?: string }, context: any, payload: { metadata: Record<string, any>, file?: { size: number } }, current?: Record<string, any> }
const diffOpen = ref(false)
const diffData = ref<RevisionDetail | null>(null)
const pretty = (v: any) => v === undefined ? '—' : JSON.stringify(v, null, 2)
const diffKeys = computed(() => {
  if (!diffData.value) return []
  const snapshot = diffData.value.payload.metadata
  const current = diffData.value.current ?? {}
  return [...new Set([...Object.keys(snapshot), ...Object.keys(current)])]
    .filter(k => JSON.stringify(snapshot[k]) !== JSON.stringify(current[k])).sort()
})
const openDiff = async (i: number) => {
  diffData.value = await $fetch<RevisionDetail>(`datasets/${dataset.value!.id}/_integrity/revisions/${i}`)
  diffOpen.value = true
}
```

- [ ] **Step 3: Add the restore confirm dialog** (admin only):

```html
    <v-dialog
      :model-value="restoreTarget !== null"
      max-width="500"
      @update:model-value="(v) => { if (!v) restoreTarget = null }"
    >
      <v-card :title="t('restoreTitle', { i: restoreTarget })">
        <v-card-text>
          <p class="mb-2">
            {{ t('restoreWarning') }}
          </p>
          <v-text-field
            v-model="restoreReason"
            :label="t('restoreReason')"
            density="compact"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="restoreTarget = null">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="warning"
            :loading="restore.loading.value"
            @click="restore.execute()"
          >
            {{ t('restore') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
```

```ts
const restoreTarget = ref<number | null>(null)
const restoreReason = ref('')
const restore = useAsyncAction(async () => {
  const body: any = { i: restoreTarget.value }
  if (restoreReason.value) body.reason = restoreReason.value
  const res = await $fetch<{ status: string }>(`datasets/${dataset.value!.id}/_integrity/_restore`, { method: 'POST', body })
  restoreTarget.value = null
  await load.execute()
  datasetStore.datasetFetch.refresh()
  return res
}, { success: t('restoreOk') })
```

- [ ] **Step 4: Add i18n strings** to both `fr:` and `en:` blocks:

```yaml
fr:
  viewDiff: Voir les différences
  downloadPayload: Télécharger le fichier historisé
  restore: Restaurer
  noPayload: non restaurable
  diffTitle: "Révision {i} — différences avec l'état courant"
  noDiff: Aucune différence de métadonnées avec l'état courant.
  diffRevision: Révision
  diffCurrent: État courant
  restoreTitle: "Restaurer la révision {i}"
  restoreWarning: Les métadonnées couvertes et le fichier de données seront restaurés à l'état de cette révision. Un fichier différent déclenche un retraitement complet du jeu de données.
  restoreReason: Raison (optionnelle, tracée dans l'historique)
  cancel: Annuler
  restoreOk: Restauration lancée
  op_restore: Restauration
en:
  viewDiff: View diff
  downloadPayload: Download historized file
  restore: Restore
  noPayload: not restorable
  diffTitle: "Revision {i} — diff with current state"
  noDiff: No metadata difference with the current state.
  diffRevision: Revision
  diffCurrent: Current state
  restoreTitle: "Restore revision {i}"
  restoreWarning: Covered metadata and the data file will be restored to this revision's state. A differing file triggers a full reprocessing of the dataset.
  restoreReason: Reason (optional, recorded in the history)
  cancel: Cancel
  restoreOk: Restore started
  op_restore: Restore
```

- [ ] **Step 5: Verify types and lint**

Run: `npm run lint && npm run check-types`
Expected: lint clean; check-types with no NET-NEW errors (compare with `dev/check-types-ratchet.sh` if the full check is noisy).

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/dataset/dataset-integrity.vue
git commit -m "feat(integrity): UI revision actions — metadata diff, payload download, restore"
```

---

### Task 11: Dev fixture restore demo + architecture doc update

**Files:**
- Modify: `dev/fixtures.ts` (the `fixtures-integrite-breach` block, ~line 218)
- Modify: `docs/architecture/integrity.md`

**Interfaces:**
- Consumes: everything above. Produces: docs + demo only.

- [ ] **Step 1: Extend the breach fixture.** Read the `fixtures-integrite-breach` block in `dev/fixtures.ts` first (it tampers file + metadata and logs the breach verdict). Append, after the breach check log, a commented demonstration of the new capability — following the block's existing style of logged explanations (do NOT auto-restore: the fixture must keep demonstrating the breach state; the restore is a manual demo action). Add to the block's final log lines:

```ts
  console.log(`  level 2: la révision 0 porte le payload complet — diff/téléchargement dans l'onglet intégrité,`)
  console.log(`  restauration superadmin: POST /api/v1/datasets/${id}/_integrity/_restore {"i": 0}`)
```

- [ ] **Step 2: Update `docs/architecture/integrity.md`.** Precise edits (keep the surrounding prose intact):
  - Header status blockquote: add "**level 2 (repair) delivered for file datasets** — every anchor carries the full payload (file copy + covered-metadata snapshot); diff, audit download and restore-from-any-revision ship with it; owner transfer is forbidden while integrity is active."
  - §2 "Level 2 — Repair" bullet: mark delivered for file datasets, always-on (no size gate — the maintainer's call: storage cost is proportional and metered into the owner's consumption, §9).
  - §3.1: document the `payload` field in the revision object and the `{i}.file` sibling key (same lock, written payload-first), and the suffix-aware key parsing.
  - §3.3: check unchanged; note diff + restore now available (restore = new `restore` revision, metadata-only synchronous / file via pipeline re-ingest with context preserved by finalize).
  - §3.4/§3.5: renewal extends the revision *pair* (`{i}` + `{i}.file`).
  - §5 files row: "level 2 delivered — always-on, no size gate".
  - §10 target 1: mark level 2 delivered; target 2's "deferred" list loses "level 2" (keep applications/settings metadata deferred).

- [ ] **Step 3: Run the full integrity suite one last time**

Run: `npx playwright test tests/features/integrity/`
Expected: PASS (all three specs)

- [ ] **Step 4: Commit**

```bash
git add dev/fixtures.ts docs/architecture/integrity.md
git commit -m "docs(integrity): level 2 delivered — fixture demo pointers and architecture doc update"
```

---

## Self-review notes (already applied)

- Spec §A/§B/§C/§D/§E/§F each map to tasks: A→1-3, B→3+5, C→6-8, D→9-10, E→4 (+automatic accounting: no code), F→ per-task tests + 11.
- The Task 7 route intentionally anchors the tampered *file* state if run before Task 8 lands — Task 8's test documents and fixes this; the two tasks must ship in order (single branch, both before merge).
- `waitForIntegrityRevisions` counts raw keys (payloads included) — tests assert on filtered revision lists where exact counts matter.
- Type consistency: `payload.metadata` / `payload.file.size` / `hasPayload` / `fileSize` / `{ status: 'restoring' }` used identically across Tasks 1, 3, 7, 8, 9, 10.
