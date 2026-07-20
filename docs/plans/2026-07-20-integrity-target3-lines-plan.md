# Integrity Target 3 — Per-Line Locked Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the integrity capability to editable (REST) datasets: every line mutation appends a compliance-locked S3 revision carrying the line's payload, giving per-line detection, diff and restore.

**Architecture:** Per-line transactional outbox (`_needsHistorizing` flag on line docs, mirroring `_needsIndexing`) shipped by a new relay worker to keys `…/‹datasetId›/lines/‹lineId›/‹paddedI›-‹sha256|deleted›`; the checker compares live Mongo lines against latest anchors recovered from S3 LIST alone; restore/fix reuse the standard transaction pipeline. Spec: `docs/plans/2026-07-20-integrity-target3-lines-design.md`.

**Tech Stack:** Node/TypeScript (ESM, `.ts` imports), Express 4, MongoDB driver, `@aws-sdk/client-s3` against MinIO (dev/test) / Scaleway (prod), Playwright test runner.

## Global Constraints

- Branch: `feat-integrity5`. NEVER push (harness SIGPIPE issue; the user pushes). Commit per task with conventional-commit messages (commitlint hook enforces; end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
- Read `docs/architecture/code-conventions.md` before touching API code. Follow existing file roles (router/service/operations).
- Pure logic goes in `*operations*.ts` files and is unit-tested directly — never trick node config (project convention).
- Run only the related tests while iterating: `npx playwright test tests/features/integrity/<file>`. Full suite runs on push via husky.
- Type ratchet: `bash dev/check-types-ratchet.sh` must show NO net-new tsc errors before each commit.
- API error messages in `api/src/datasets/routes/integrity.ts` are English (match existing). UI strings are French.
- The API dev server is managed by the user via zellij — never start/stop it. Tests spin their own instance.
- MinIO in docker compose backs the `data-fair-integrity` bucket in dev/test (compliance lock enabled); tests use helpers from `tests/support/integrity.ts`.
- `api/types` must not import from `api/src` (breaks the UI type graph) — mirror types inline as done for `HistorizeContextHint`.

## File Structure

- Create: `api/src/integrity/lines-operations.ts` — pure key/hash/classify functions (unit-tested).
- Create: `api/src/integrity/lines-relay.ts` — the per-line relay (`historizeLines`, `anchorLine`).
- Create: `tests/features/integrity/lines-operations.unit.spec.ts`, `tests/features/integrity/lines.api.spec.ts`.
- Modify: `api/src/integrity/operations.ts` (add `'delete'` operation), `api/src/integrity/store.ts` (delimiter option, `LineRevisionBody`), `api/src/integrity/checker.ts` (lines part + renewal), `api/src/integrity/relay.ts` (no change expected — verify only).
- Modify: `api/src/datasets/utils/rest.ts` (stamping, purge guard, refusals), `api/src/datasets/routes/integrity.ts` (enable/GET/fix/restore/lines endpoints).
- Modify: `api/src/workers/tasks.ts` + `api/src/workers/short-processor/index.ts` (new `historizeLines` task).
- Modify: `api/types/dataset/index.ts`, `api/config/default.cjs`, `api/config/type/schema.json`, `api/src/misc/routers/test-env.ts`.
- Modify: `ui/src/components/dataset/dataset-integrity.vue`, `dev fixtures script`, `docs/architecture/integrity.md`.

---

### Task 1: Config gate + shared type groundwork

**Files:**
- Modify: `api/config/default.cjs` (integrity section, ~line 1 of the `integrity:` block)
- Modify: `api/config/type/schema.json` (integrity property)
- Modify: `api/types/dataset/index.ts`
- Modify: `api/src/integrity/operations.ts:86` (RevisionOperation)

**Interfaces:**
- Produces: `config.integrity.lines.maxLines: number` (default 100000); `DatasetLine._needsHistorizing?/._deleted?/._hash?`; `DatasetInternal._needsHistorizingLines?: boolean`; `RevisionOperation` includes `'delete'`.

- [ ] **Step 1: Add the gate to config default + schema**

In `api/config/default.cjs`, inside the `integrity: { … }` object after `retention: { days: 365 },` add:

```js
    lines: { maxLines: 100000 },
```

In `api/config/type/schema.json`, inside `properties.integrity.properties` after the `"retention"` entry add:

```json
   "lines": {
    "type": "object",
    "properties": {
     "maxLines": {
      "type": "number"
     }
    }
   }
```

- [ ] **Step 2: Regenerate the config type**

Run: `grep -n "build-types\|config" package.json | head` to find the type-build script, then run it (expected: `npm run build-types` regenerates `api/config/type/.type/*`). Verify `grep -n "maxLines" api/config/type/.type/index.d.ts` finds the new field.

- [ ] **Step 3: Extend the shared types**

In `api/types/dataset/index.ts`:

Change the `HistorizeContextHint` mirror (line ~9) to include `'delete'`:

```ts
type HistorizeContextHint = {
  operation: 'create' | 'update' | 'delete' | 'enable' | 'fixIntegrity' | 'restore'
  origin: 'user' | 'superadmin' | 'worker' | 'propagation' | 'upgrade'
  reason?: string
}
```

In `DatasetInternal` add after `_needsHistorizing`:

```ts
  // work-queue hint for the per-line integrity relay (target 3): set BEFORE line stamps are
  // written (hint-first ordering) so a crash between the two leaves a harmless empty hint
  _needsHistorizingLines?: boolean
```

In `DatasetLine` add the fields the integrity code reads/writes explicitly:

```ts
export type DatasetLine = {
  _id: string,
  _i?: number,
  _updatedAt?: Date,
  _deleted?: boolean,
  _hash?: string | null,
  _needsHistorizing?: { context?: HistorizeContextHint },
  [key: string]: unknown
}
```

- [ ] **Step 4: Extend RevisionOperation**

In `api/src/integrity/operations.ts` change:

```ts
export type RevisionOperation = 'create' | 'update' | 'delete' | 'enable' | 'fixIntegrity' | 'restore'
```

(Verify `'restore'` is already present post-integrity4; keep its position, just add `'delete'`.)

- [ ] **Step 5: Locate and extend the public dataset `integrity` field schema**

Run: `grep -rln "lastRenewal" api/ --include="*.json"` — this finds the JSON schema where `integrity.lastRevision/lastCheck/lastRenewal` are declared (the public Dataset schema). Add, alongside `lastCheck`'s breach enum, `"lines"` to the breach item enum (`"file" | "metadata" | "lines"`), and sibling objects for the new server-managed state (shape only, all optional): `lastCheck.lines: { checked: number, diverged: number, sample: string[] }` and `linesRenewal: { date: string, status: 'ok'|'failed', renewed: number, failed: number, retainUntil: string }`. Then re-run the type build from Step 2.

- [ ] **Step 6: Type-check and commit**

Run: `npm run check-types` then `bash dev/check-types-ratchet.sh`
Expected: no net-new errors.

```bash
git add api/config api/types api/src/integrity/operations.ts
git commit -m "feat(integrity): config gate + shared types for per-line revisions (target 3)"
```

---

### Task 2: Pure line operations module

**Files:**
- Create: `api/src/integrity/lines-operations.ts`
- Test: `tests/features/integrity/lines-operations.unit.spec.ts`

**Interfaces:**
- Produces (all pure):
  - `LINE_INDEX_WIDTH = 16`, `DELETED_MARKER = 'deleted'`
  - `padLineIndex(i: number): string`
  - `linesPrefix(owner: {type,id}, datasetId: string): string` → `data-fair/‹type›-‹id›/‹datasetId›/lines/`
  - `lineRevisionPrefix(owner, datasetId, lineId: string): string` (URI-encodes lineId)
  - `lineRevisionKey(owner, datasetId, lineId, i: number, shaOrDeleted: string): string`
  - `parseLineRevisionKey(key: string): { lineId: string, i: number, sha256?: string, deleted: boolean } | undefined`
  - `cleanedLineBody(line: Record<string, any>): Record<string, any>` (drops every `_`-prefixed key)
  - `lineSha256(line: Record<string, any>): string`
  - `latestLineAnchors(keys: string[]): Map<string, { key: string, i: number, sha256?: string, deleted: boolean }>`
  - `classifyLine(line: { _i?: number } & Record<string, any>, anchor?: { i, sha256?, deleted }): 'ok' | 'edited' | 'inserted'`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/features/integrity/lines-operations.unit.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import * as lops from '../../../api/src/integrity/lines-operations.ts'

const owner = { type: 'organization', id: 'acme' }

test('line revision keys follow the lines layout and URI-encode the line id', () => {
  expect(lops.linesPrefix(owner, 'ds1')).toBe('data-fair/organization-acme/ds1/lines/')
  expect(lops.lineRevisionPrefix(owner, 'ds1', 'a/b')).toBe('data-fair/organization-acme/ds1/lines/a%2Fb/')
  expect(lops.lineRevisionKey(owner, 'ds1', 'l1', 42, 'abc'))
    .toBe('data-fair/organization-acme/ds1/lines/l1/0000000000000042-abc')
})

test('parseLineRevisionKey round-trips, including deleted marker and encoded ids', () => {
  const key = lops.lineRevisionKey(owner, 'ds1', 'a/b', 7, 'deadbeef')
  expect(lops.parseLineRevisionKey(key)).toEqual({ lineId: 'a/b', i: 7, sha256: 'deadbeef', deleted: false })
  const tomb = lops.lineRevisionKey(owner, 'ds1', 'l2', 9, lops.DELETED_MARKER)
  expect(lops.parseLineRevisionKey(tomb)).toEqual({ lineId: 'l2', i: 9, deleted: true })
  expect(lops.parseLineRevisionKey('data-fair/organization-acme/ds1/000000007')).toBeUndefined()
})

test('cleanedLineBody drops every underscore-prefixed field', () => {
  expect(lops.cleanedLineBody({ a: 1, _id: 'x', _i: 2, _hash: 'h', _ext_geo: { lat: 0 }, _updatedBy: 'u' }))
    .toEqual({ a: 1 })
})

test('lineSha256 is stable under key order and blind to internal fields', () => {
  const h1 = lops.lineSha256({ a: 1, b: 'x', _i: 5 })
  const h2 = lops.lineSha256({ b: 'x', a: 1, _i: 999, _needsIndexing: true })
  expect(h1).toBe(h2)
  expect(lops.lineSha256({ a: 2, b: 'x' })).not.toBe(h1)
})

test('latestLineAnchors keeps the highest index per line', () => {
  const keys = [
    lops.lineRevisionKey(owner, 'ds1', 'l1', 1, 'aaa'),
    lops.lineRevisionKey(owner, 'ds1', 'l1', 3, 'bbb'),
    lops.lineRevisionKey(owner, 'ds1', 'l2', 2, lops.DELETED_MARKER)
  ]
  const anchors = lops.latestLineAnchors(keys)
  expect(anchors.get('l1')).toMatchObject({ i: 3, sha256: 'bbb', deleted: false })
  expect(anchors.get('l2')).toMatchObject({ i: 2, deleted: true })
})

test('classifyLine detects the three divergence shapes', () => {
  const line = { a: 1, _i: 3 }
  const sha = lops.lineSha256(line)
  expect(lops.classifyLine(line, { i: 3, sha256: sha, deleted: false })).toBe('ok')
  expect(lops.classifyLine(line, { i: 3, sha256: 'other', deleted: false })).toBe('edited')
  expect(lops.classifyLine(line, { i: 2, sha256: sha, deleted: false })).toBe('edited')
  expect(lops.classifyLine(line, undefined)).toBe('inserted')
  expect(lops.classifyLine(line, { i: 3, deleted: true })).toBe('inserted')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/lines-operations.unit.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module**

Create `api/src/integrity/lines-operations.ts`:

```ts
import { createHash } from 'node:crypto'
import stableStringify from 'fast-json-stable-stringify'

// _i values (timestamp3 mode: hundredths of a second since dataset creation, plus a chunk
// discriminator) far exceed the joint anchor's 9-digit width — 16 digits keeps lexical
// order == numeric order for any realistic value
export const LINE_INDEX_WIDTH = 16
export const DELETED_MARKER = 'deleted'

export const padLineIndex = (i: number): string => String(i).padStart(LINE_INDEX_WIDTH, '0')

export const linesPrefix = (owner: { type: string, id: string }, datasetId: string): string =>
  `data-fair/${owner.type}-${owner.id}/${datasetId}/lines/`

export const lineRevisionPrefix = (owner: { type: string, id: string }, datasetId: string, lineId: string): string =>
  `${linesPrefix(owner, datasetId)}${encodeURIComponent(lineId)}/`

// the sha256 (or the tombstone marker) is embedded in the key so the checker recovers every
// line's latest anchor hash from LIST alone — no per-object GETs
export const lineRevisionKey = (owner: { type: string, id: string }, datasetId: string, lineId: string, i: number, shaOrDeleted: string): string =>
  `${lineRevisionPrefix(owner, datasetId, lineId)}${padLineIndex(i)}-${shaOrDeleted}`

export type ParsedLineKey = { lineId: string, i: number, sha256?: string, deleted: boolean }

export const parseLineRevisionKey = (key: string): ParsedLineKey | undefined => {
  const parts = key.split('/')
  // …/‹datasetId›/lines/‹encodedLineId›/‹paddedI›-‹sha|deleted›
  if (parts.length < 3 || parts[parts.length - 3] !== 'lines') return undefined
  const last = parts[parts.length - 1]
  const dash = last.indexOf('-')
  if (dash === -1) return undefined
  const i = parseInt(last.slice(0, dash), 10)
  if (Number.isNaN(i)) return undefined
  const marker = last.slice(dash + 1)
  const lineId = decodeURIComponent(parts[parts.length - 2])
  if (marker === DELETED_MARKER) return { lineId, i, deleted: true }
  return { lineId, i, sha256: marker, deleted: false }
}

// the covered content of a line is its user-visible body: every `_`-prefixed field is internal
// (bookkeeping, CRC32 _hash, extension outputs `_ext_*` — rebuildable projections, and
// `_updatedBy`/`_updatedByName` — identities that must not enter the WORM store)
export const cleanedLineBody = (line: Record<string, any>): Record<string, any> => {
  const body: Record<string, any> = {}
  for (const key of Object.keys(line)) {
    if (!key.startsWith('_')) body[key] = line[key]
  }
  return body
}

export const lineSha256 = (line: Record<string, any>): string =>
  createHash('sha256').update(stableStringify(cleanedLineBody(line))).digest('hex')

export type LatestLineAnchor = { key: string, i: number, sha256?: string, deleted: boolean }

export const latestLineAnchors = (keys: string[]): Map<string, LatestLineAnchor> => {
  const latest = new Map<string, LatestLineAnchor>()
  for (const key of keys) {
    const parsed = parseLineRevisionKey(key)
    if (!parsed) continue
    const current = latest.get(parsed.lineId)
    if (!current || parsed.i > current.i) {
      latest.set(parsed.lineId, { key, i: parsed.i, sha256: parsed.sha256, deleted: parsed.deleted })
    }
  }
  return latest
}

export type LineVerdict = 'ok' | 'edited' | 'inserted'

// a live line against its latest anchor: no live anchor at all → out-of-band insert;
// content or _i divergence → out-of-band edit. (Anchored-but-vanished lines — out-of-band
// deletes — are the anchors left unvisited after the scan, handled by the caller.)
export const classifyLine = (line: { _i?: number } & Record<string, any>, anchor?: Pick<LatestLineAnchor, 'i' | 'sha256' | 'deleted'>): LineVerdict => {
  if (!anchor || anchor.deleted) return 'inserted'
  if (anchor.sha256 !== lineSha256(line) || anchor.i !== line._i) return 'edited'
  return 'ok'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/integrity/lines-operations.unit.spec.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/lines-operations.ts tests/features/integrity/lines-operations.unit.spec.ts
git commit -m "feat(integrity): pure line-revision operations — keys, cleaned body, sha256, classification"
```

---

### Task 3: Store — line revision body + delimiter listing

**Files:**
- Modify: `api/src/integrity/store.ts`
- Modify: `api/src/integrity/relay.ts:38`, `api/src/integrity/checker.ts:52`, `api/src/datasets/routes/integrity.ts:173` (the three joint-anchor `listRevisions` call sites)
- Test: `tests/features/integrity/lines.api.spec.ts` (new file, store section)

**Interfaces:**
- Produces: `LineRevisionBody` type; `listRevisions(prefix, opts?: { delimiter?: string })`; `writeRevision` accepts `RevisionBody | LineRevisionBody`.

- [ ] **Step 1: Write the failing test**

Create `tests/features/integrity/lines.api.spec.ts`:

```ts
// tests/features/integrity/lines.api.spec.ts
// Target 3: per-line locked revisions for editable (REST) datasets — store layout, write-path
// stamping, relay, enable/gate, check, restore/fix.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { ensureIntegrityBucket, integrityTestStore } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

test('delimiter listing keeps the joint anchor blind to the lines subtree', async () => {
  const store = integrityTestStore
  const prefix = `data-fair/test-delim/${Date.now()}/`
  const retainUntil = new Date(Date.now() + 24 * 3600 * 1000)
  const context = { operation: 'create' as const, origin: 'worker' as const, date: new Date().toISOString() }
  await store.writeRevision(`${prefix}000000000`, { hash: { sha256: 'meta' }, context, dataset: { id: 'ds' } }, retainUntil)
  await store.writeRevision(`${prefix}lines/l1/0000000000000001-abc`, {
    hash: { sha256: 'abc' }, context, dataset: { id: 'ds' }, line: { _id: 'l1', _i: 1 }, payload: { a: 1 }
  }, retainUntil)

  const all = (await store.listRevisions(prefix)).map(r => r.key)
  expect(all).toHaveLength(2)
  const topOnly = (await store.listRevisions(prefix, { delimiter: '/' })).map(r => r.key)
  expect(topOnly).toEqual([`${prefix}000000000`])
  const linesOnly = (await store.listRevisions(`${prefix}lines/`)).map(r => r.key)
  expect(linesOnly).toEqual([`${prefix}lines/l1/0000000000000001-abc`])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: FAIL (delimiter option unknown / type error on `line` property).

- [ ] **Step 3: Implement the store changes**

In `api/src/integrity/store.ts`, add after the `RevisionBody` type:

```ts
// Target 3 (per-line revisions): the revision of a single editable-dataset line. `payload` is the
// cleaned user body (no `_`-prefixed fields — no identities, no extension outputs); absent on
// tombstones. The content sha256 is ALSO embedded in the S3 key so checks work from LIST alone.
export type LineRevisionBody = {
  hash: { sha256?: string }
  context: RevisionContext
  dataset: { id: string, slug?: string }
  line: { _id: string, _i: number, _updatedAt?: string, deleted?: boolean }
  payload?: Record<string, any>
}
```

Change `writeRevision`'s signature:

```ts
  async writeRevision (key: string, body: RevisionBody | LineRevisionBody, retainUntil: Date): Promise<void> {
```

Change `listRevisions` to accept a delimiter (joint-anchor call sites use it to stay blind to the `lines/` subtree):

```ts
  async listRevisions (prefix: string, opts?: { delimiter?: string }): Promise<{ key: string, lastModified?: Date }[]> {
    const revisions: { key: string, lastModified?: Date }[] = []
    let ContinuationToken: string | undefined
    do {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: prefix, Delimiter: opts?.delimiter, ContinuationToken
      }))
      for (const o of res.Contents ?? []) if (o.Key) revisions.push({ key: o.Key, lastModified: o.LastModified })
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (ContinuationToken)
    return revisions
  }
```

- [ ] **Step 4: Pass the delimiter at the three joint-anchor call sites**

In `api/src/integrity/relay.ts` (`anchorDataset`, ~line 38):

```ts
  const keys = (await store.listRevisions(prefix, { delimiter: '/' })).map((r) => r.key)
```

In `api/src/integrity/checker.ts` (`checkDataset`, ~line 52):

```ts
  const latest = ops.latestKey((await store.listRevisions(prefix, { delimiter: '/' })).map((r) => r.key))
```

In `api/src/datasets/routes/integrity.ts` (revisions listing, ~line 173):

```ts
    const keys = (await store.listRevisions(revisionPrefix(dataset.owner, dataset.id), { delimiter: '/' })).map((r) => r.key)
```

- [ ] **Step 5: Run tests, existing suites included**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts tests/features/integrity/core.api.spec.ts`
Expected: all pass (delimiter change is invisible to datasets without lines).

- [ ] **Step 6: Commit**

```bash
git add api/src/integrity tests/features/integrity/lines.api.spec.ts api/src/datasets/routes/integrity.ts
git commit -m "feat(integrity): line revision body type and delimiter-scoped joint-anchor listing"
```

---

### Task 4: Write-path stamping in the transaction pipeline

**Files:**
- Modify: `api/src/datasets/utils/rest.ts` (`applyTransactions` ~line 422, `initDataset` ~line 184, `MarkIndexedStream.flush` ~line 1459, `deleteAllLines` ~line 1088, `bulkLines` drop handling ~line 1109)
- Test: `tests/features/integrity/lines.api.spec.ts` (append)

**Interfaces:**
- Consumes: `HistorizeContextHint` from `#types` mirror (Task 1).
- Produces: `applyTransactions(dataset, sessionState, transacs, validate?, linesOwner?, tmpDataset?, historizeContext?)` — 7th optional param used by restore (Task 8); line docs carry `_needsHistorizing: { context }`; dataset doc carries `_needsHistorizingLines: true` (hint-first); `deleteAllLines` and `bulkLines?drop=true` refuse with 400 while `dataset.integrity.active`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/integrity/lines.api.spec.ts` (note: enabling on REST datasets via the API only lands in Task 6, so these tests flip `integrity.active` raw via `test-env/patch-dataset`, the established pattern in `core.api.spec.ts`):

```ts
import { sendDataset } from '../../support/workers.ts'

const restDataset = async (ax: any, lines: Array<Record<string, any>>) => {
  const res = await ax.post(`${apiUrl}/api/v1/datasets`, {
    isRest: true,
    title: `integrity lines ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }]
  })
  const dataset = res.data
  if (lines.length) await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/_bulk_lines`, lines.map((l, i) => ({ _id: `line${i}`, ...l })))
  return dataset
}

const rawLine = async (ax: any, datasetId: string, lineId: string) =>
  (await ax.get(`${apiUrl}/api/v1/test-env/rest-collection-find-one/${datasetId}`, { params: { filter: JSON.stringify({ _id: lineId }) } })).data

test('line writes stamp _needsHistorizing and the dataset hint when integrity is active', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  // enroll raw (API enable for REST lands in a later task)
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })

  await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/lines`, { _id: 'line0', attr1: 'b', attr2: 2 })
  const line = await rawLine(ax, dataset.id, 'line0')
  expect(line._needsHistorizing?.context?.origin).toBe('superadmin')
  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  expect(raw._needsHistorizingLines).toBe(true)
})

test('line writes do NOT stamp when integrity is inactive', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/lines`, { _id: 'line0', attr1: 'b', attr2: 2 })
  const line = await rawLine(ax, dataset.id, 'line0')
  expect(line._needsHistorizing).toBeUndefined()
})

test('deleteAllLines and drop bulk are refused while integrity is active', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await expect(ax.delete(`${apiUrl}/api/v1/datasets/${dataset.id}/lines`)).rejects.toMatchObject({ status: 400 })
  await expect(ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/_bulk_lines?drop=true`, [{ _id: 'x', attr1: 'c' }]))
    .rejects.toMatchObject({ status: 400 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: the three new tests FAIL (no stamps, no refusals).

- [ ] **Step 3: Implement stamping in `applyTransactions`**

In `api/src/datasets/utils/rest.ts`:

Add the import at the top (with the other `#types` imports): `HistorizeContextHint` is exported from `#types` via the mirror — verify with `grep -n "HistorizeContextHint" api/types/dataset/index.ts`; if it is a non-exported `type`, export it there first.

Change the signature (line ~422):

```ts
export const applyTransactions = async (dataset: RestDataset, sessionState: SessionStateAuthenticated | undefined, transacs: DatasetLineAction[], validate?: ValidateFunction, linesOwner?: Account, tmpDataset?: RestDataset, historizeContext?: HistorizeContextHint) => {
```

Right after `const primaryKeyProjection = getPrimaryKeyProjection(dataset)` add the hint-first stamp:

```ts
  // integrity (target 3): hint-first ordering — mark the dataset as having pending line
  // stamps BEFORE any line stamp is written, so a crash between the two leaves a harmless
  // empty hint (relay clears it), never orphaned stamps. Skipped for tmp-collection writes
  // (drop mode), which are refused on enrolled datasets anyway.
  const historizeLines = !!dataset.integrity?.active && !tmpDataset
  if (historizeLines && transacs.length) {
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true } })
  }
```

In the per-transaction build loop, right after `operation.fullBody._i = getLineIndice(...)` (~line 466) add:

```ts
    if (historizeLines) {
      operation.fullBody._needsHistorizing = {
        context: historizeContext ?? {
          operation: _action === 'delete' ? 'delete' : _action === 'create' ? 'create' : 'update',
          origin: sessionState?.user?.adminMode ? 'superadmin' : sessionState ? 'user' : 'worker'
        }
      }
    }
```

- [ ] **Step 4: Implement the purge guard in `MarkIndexedStream.flush`**

In the flush loop (~line 1464), replace the tombstone branch:

```ts
        if (chunk._deleted) {
          // integrity (target 3): a tombstone awaiting historization must survive until its
          // deletion revision ships — the lines relay purges it once both flags are gone
          bulkOp.find({ _id: chunk._id, _needsHistorizing: { $exists: false } }).deleteOne()
          bulkOp.find({ _id: chunk._id, _needsHistorizing: { $exists: true } }).updateOne({ $unset: { _needsIndexing: '' } })
        } else {
```

- [ ] **Step 5: Implement the refusals and the sparse index**

In `deleteAllLines` (~line 1089), after `const dataset = reqRestDataset(req)` add:

```ts
  // integrity (target 3): dropping the collection would silently destroy the lines the locked
  // anchors still vouch for — deletions must go through the transaction path (tombstones)
  if (dataset.integrity?.active) throw httpError(400, 'suppression de toutes les lignes refusée tant que le suivi d\'intégrité est actif')
```

In `bulkLines` (~line 1109), right after `const drop = req.query.drop === 'true'` add:

```ts
    if (drop && dataset.integrity?.active) throw httpError(400, 'le mode drop est refusé tant que le suivi d\'intégrité est actif')
```

(Match the surrounding error-message language — check neighbors; if surrounding messages are French keep these, otherwise translate to English.)

In `initDataset` (~line 185) add the relay's work index alongside the existing ones:

```ts
    c.createIndex({ _needsHistorizing: 1 }, { sparse: true }),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: all pass. Also run `npx playwright test tests/features/datasets-rest --grep-invert nothing 2>/dev/null || npx playwright test tests/features/ -g "rest"` — locate the main REST-lines suite with `ls tests/features | grep -i rest` and run it to confirm no regression for un-enrolled datasets.

- [ ] **Step 7: Commit**

```bash
git add api/src/datasets/utils/rest.ts tests/features/integrity/lines.api.spec.ts
git commit -m "feat(integrity): per-line outbox stamping in the transaction pipeline"
```

---

### Task 5: Lines relay + worker task

**Files:**
- Create: `api/src/integrity/lines-relay.ts`
- Modify: `api/src/workers/tasks.ts:236` (after the `historize` entry), `api/src/workers/short-processor/index.ts:78`
- Test: `tests/features/integrity/lines.api.spec.ts` (append)

**Interfaces:**
- Consumes: `lines-operations.ts` (Task 2), `LineRevisionBody`/store (Task 3), line stamps (Task 4).
- Produces: `historizeLines(dataset: RestDataset): Promise<void>` and `anchorLine(dataset, line, store, retainUntil, contextHint?): Promise<void>` (reused inline by `_fix`/`_restore` in Task 8); worker task `historizeLines` with filter `{ isRest: true, _needsHistorizingLines: true }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/integrity/lines.api.spec.ts`. First check `tests/support/integrity.ts` for an existing flag-waiting helper (`waitForFlagCleared`) and a generic "wait until" util; mirror its polling style:

```ts
const waitForLinesDrained = async (ax: any, datasetId: string, timeout = 15000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${datasetId}`)).data
    if (!raw._needsHistorizingLines) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('timed out waiting for _needsHistorizingLines to clear')
}

test('the lines relay ships a revision per stamped line and clears the flags', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [])
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/lines`, { _id: 'l1', attr1: 'hello', attr2: 1 })
  await waitForLinesDrained(ax, dataset.id)

  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  const keys = (await integrityTestStore.listRevisions(`data-fair/${raw.owner.type}-${raw.owner.id}/${dataset.id}/lines/`)).map(r => r.key)
  expect(keys).toHaveLength(1)
  const rev = await integrityTestStore.getRevision(keys[0])
  expect((rev as any).payload).toMatchObject({ attr1: 'hello', attr2: 1 })
  expect((rev as any).line._id).toBe('l1')
  const line = await rawLine(ax, dataset.id, 'l1')
  expect(line._needsHistorizing).toBeUndefined()
})

test('a deleted line ships a tombstone revision and the doc is purged after both flags clear', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [])
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/lines`, { _id: 'l1', attr1: 'x', attr2: 1 })
  await waitForLinesDrained(ax, dataset.id)
  await ax.delete(`${apiUrl}/api/v1/datasets/${dataset.id}/lines/l1`)
  await waitForLinesDrained(ax, dataset.id)

  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  const keys = (await integrityTestStore.listRevisions(`data-fair/${raw.owner.type}-${raw.owner.id}/${dataset.id}/lines/`)).map(r => r.key)
  expect(keys.some(k => k.endsWith('-deleted'))).toBe(true)
  // once indexing AND historization both committed, the tombstone doc is purged
  const start = Date.now()
  while (Date.now() - start < 15000) {
    const count = (await ax.get(`${apiUrl}/api/v1/test-env/rest-collection-count/${dataset.id}`, { params: { filter: JSON.stringify({ _id: 'l1' }) } })).data.count
    if (count === 0) break
    await new Promise(r => setTimeout(r, 200))
  }
  const count = (await ax.get(`${apiUrl}/api/v1/test-env/rest-collection-count/${dataset.id}`, { params: { filter: JSON.stringify({ _id: 'l1' }) } })).data.count
  expect(count).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: the two new tests FAIL (flag never clears — no worker task yet).

- [ ] **Step 3: Implement `api/src/integrity/lines-relay.ts`**

```ts
import mongo from '#mongo'
import config from '#config'
import type { RestDataset, DatasetLine } from '#types'
import * as restUtils from '../datasets/utils/rest.ts'
import { integrityStore } from './store-factory.ts'
import type { IntegrityStore } from './store.ts'
import * as lops from './lines-operations.ts'
import type { HistorizeContextHint, RevisionContext } from './operations.ts'

const BATCH = 100

// Write one line's locked revision from its CURRENT Mongo state. Shared by the async relay and
// the synchronous _fix path. The revision index is the line's own _i (unique, monotonic,
// changes on every update): no LIST-before-write, retry-forward re-PUTs are idempotent
// (a same-key PUT adds a version on the locked bucket without touching the locked one).
export const anchorLine = async (dataset: RestDataset, line: DatasetLine, store: IntegrityStore, retainUntil: Date, contextHint?: HistorizeContextHint): Promise<void> => {
  const hint = contextHint ?? line._needsHistorizing?.context
  const deleted = !!line._deleted
  const context: RevisionContext = {
    operation: hint?.operation ?? (deleted ? 'delete' : 'update'),
    origin: hint?.origin ?? 'worker',
    date: new Date().toISOString(),
    ...(hint?.reason ? { reason: hint.reason } : {})
  }
  const lineMeta = { _id: line._id, _i: line._i!, ...(line._updatedAt ? { _updatedAt: new Date(line._updatedAt).toISOString() } : {}) }
  if (deleted) {
    await store.writeRevision(
      lops.lineRevisionKey(dataset.owner, dataset.id, line._id, line._i!, lops.DELETED_MARKER),
      { hash: {}, context, dataset: { id: dataset.id, slug: dataset.slug }, line: { ...lineMeta, deleted: true } },
      retainUntil
    )
  } else {
    const payload = lops.cleanedLineBody(line)
    const sha256 = lops.lineSha256(line)
    await store.writeRevision(
      lops.lineRevisionKey(dataset.owner, dataset.id, line._id, line._i!, sha256),
      { hash: { sha256 }, context, dataset: { id: dataset.id, slug: dataset.slug }, line: lineMeta, payload },
      retainUntil
    )
  }
}

// The per-line relay behind the historizeLines worker task, driven by the per-line
// _needsHistorizing stamps and the dataset-level _needsHistorizingLines hint.
export const historizeLines = async (dataset: RestDataset): Promise<void> => {
  const c = restUtils.collection(dataset)
  const clearHint = () => mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizingLines: '' } })

  // capability or enrollment gone: drop the stamps rather than retry-storming (same posture as
  // the dataset-level relay). A re-enable later re-stamps everything (backfill).
  if (!config.integrity?.active || !dataset.integrity?.active) {
    await c.updateMany({ _needsHistorizing: { $exists: true } }, { $unset: { _needsHistorizing: '' } })
    await clearHint()
    return
  }

  const store = integrityStore()
  const retentionDays = config.integrity.retention?.days ?? 365
  while (true) {
    const lines = await c.find({ _needsHistorizing: { $exists: true } }).limit(BATCH).toArray()
    if (!lines.length) break
    const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
    await Promise.all(lines.map(async (line) => {
      await anchorLine(dataset, line, store, retainUntil)
      // clear conditionally on _i: a legit write interleaved since our read changed _i and
      // re-stamped — that fresh stamp must survive to get its own revision
      await c.updateOne({ _id: line._id, _i: line._i }, { $unset: { _needsHistorizing: '' } })
      // purge a fully-committed tombstone (commitLines defers to us when our flag was still set)
      if (line._deleted) {
        await c.deleteOne({ _id: line._id, _deleted: true, _needsIndexing: { $exists: false }, _needsHistorizing: { $exists: false } })
      }
    }))
  }
  await clearHint()
}
```

- [ ] **Step 4: Register the worker task**

In `api/src/workers/tasks.ts`, after the `historize` entry (~line 239) add:

```ts
}, {
  name: 'historizeLines',
  worker: 'shortProcessor',
  mongoFilter: () => ({ isRest: true, _needsHistorizingLines: true })
```

In `api/src/workers/short-processor/index.ts`, after the `historize` function add:

```ts
export const historizeLines = async function (dataset: RestDataset) {
  await mongo.connect(true)
  const relay = await import('../../integrity/lines-relay.ts')
  await relay.historizeLines(dataset)
}
```

(`RestDataset` is already imported in that file.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add api/src/integrity/lines-relay.ts api/src/workers tests/features/integrity/lines.api.spec.ts
git commit -m "feat(integrity): per-line relay ships stamped lines to the locked store"
```

---

### Task 6: Enable for REST datasets — gate, backfill, lines summary

**Files:**
- Modify: `api/src/datasets/routes/integrity.ts:25-53` (PUT and GET)
- Test: `tests/features/integrity/lines.api.spec.ts` (append)

**Interfaces:**
- Consumes: `restUtils.count`, `restUtils.collection`, `historizeLines` worker (Task 5).
- Produces: `PUT _integrity {active:true}` works on finalized REST datasets, refuses over-gate with 409, stamps all live lines (`enable`/`superadmin` context) and sets `integrity.linesRenewal.retainUntil`; `GET _integrity` returns `lines: { anchored, pending, overGate? }` for enrolled REST datasets.

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/integrity/lines.api.spec.ts`:

```ts
test('enable on a REST dataset backfills every live line and GET reports progress', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }, { attr1: 'b', attr2: 2 }])
  // wait for initial indexing to settle before enabling
  await new Promise(r => setTimeout(r, 1000))
  await ax.put(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForLinesDrained(ax, dataset.id)

  const integrity = (await ax.get(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(integrity.active).toBe(true)
  expect(integrity.lines).toMatchObject({ anchored: 2, pending: 0 })
  const raw = (await ax.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  const keys = (await integrityTestStore.listRevisions(`data-fair/${raw.owner.type}-${raw.owner.id}/${dataset.id}/lines/`)).map(r => r.key)
  expect(keys).toHaveLength(2)
  const rev = await integrityTestStore.getRevision(keys[0])
  expect((rev as any).context.operation).toBe('enable')
})

test('enable is refused above the lines gate', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await new Promise(r => setTimeout(r, 1000))
  await ax.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.lines.maxLines', value: 0 })
  try {
    await expect(ax.put(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity`, { active: true }))
      .rejects.toMatchObject({ status: 409 })
  } finally {
    await ax.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.lines.maxLines', value: 100000 })
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: FAIL — PUT returns 400 (`integrity can only be enabled on a finalized file dataset`).

- [ ] **Step 3: Implement the route changes**

In `api/src/datasets/routes/integrity.ts` add imports:

```ts
import { isFileDataset, isRestDataset } from '#types/dataset/index.ts'
import * as restUtils from '../utils/rest.ts'
import * as lops from '../../integrity/lines-operations.ts'
```

Replace the PUT handler's `if (active) { … }` branch:

```ts
    if (active) {
      if (!config.integrity?.active) throw httpError(400, 'integrity capability is not configured on this deployment')
      const isRest = isRestDataset(dataset)
      if (!isRest && (!isFileDataset(dataset) || !dataset.originalFile?.md5)) {
        throw httpError(400, 'integrity can only be enabled on a finalized file dataset or an editable (rest) dataset')
      }
      if (isRest) {
        // the coverage gate (target 3): per-line anchors mean per-line writes, checks and lock
        // renewals — refuse enrollment where that burden is not tractable
        const maxLines = config.integrity.lines?.maxLines ?? 100000
        const liveLines = await restUtils.count(dataset, { _deleted: { $ne: true } })
        if (liveLines > maxLines) throw httpError(409, `this dataset has ${liveLines} lines, above the integrity gate of ${maxLines}`)
      }
      const retentionDays = config.integrity.retention?.days ?? 365
      const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
      const $set: Record<string, any> = { 'integrity.active': true, updatedAt: new Date().toISOString() }
      // baseline for the per-line renewal cadence: conservative (backfill revisions written by
      // the relay get equal-or-later locks, so renewal triggers no later than needed)
      if (isRest) $set['integrity.linesRenewal'] = { date: new Date().toISOString(), status: 'ok', retainUntil: retainUntil.toISOString() }
      await mongo.datasets.updateOne({ id: dataset.id }, { $set })
      await anchorDataset(dataset, { operation: 'enable', origin: 'superadmin' })
      if (isRest) {
        // async backfill: stamp every line (hint-first) and let the relay drain; GET _integrity
        // reports pending progress and checks stay 'unknown' until drained
        await restUtils.collection(dataset).createIndex({ _needsHistorizing: 1 }, { sparse: true })
        await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true } })
        await restUtils.collection(dataset).updateMany({}, { $set: { _needsHistorizing: { context: { operation: 'enable', origin: 'superadmin' } } } })
      }
    } else {
```

(The `else` branch is unchanged except: also clear the lines state — extend the existing `$unset` with `_needsHistorizingLines: ''`.)

Replace the GET handler:

```ts
  router.get('/:datasetId/_integrity', readDataset({ noCache: true }), permissions.middleware('readIntegrity', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    const integrity = { ...(dataset.integrity ?? { active: false }) }
    if (integrity.active && isRestDataset(dataset)) {
      const c = restUtils.collection(dataset)
      const maxLines = config.integrity?.lines?.maxLines ?? 100000
      const [total, pending] = await Promise.all([
        restUtils.count(dataset, { _deleted: { $ne: true } }),
        c.countDocuments({ _needsHistorizing: { $exists: true } })
      ])
      integrity.lines = { anchored: Math.max(0, total - pending), pending, ...(total > maxLines ? { overGate: true } : {}) }
    }
    res.json(integrity)
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts tests/features/integrity/admin.api.spec.ts`
Expected: all pass (admin suite confirms file-dataset enable is untouched).

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/routes/integrity.ts tests/features/integrity/lines.api.spec.ts
git commit -m "feat(integrity): REST dataset enrollment — gate, async line backfill, lines summary"
```

---

### Task 7: Checker — lines verdict + per-line lock renewal

**Files:**
- Modify: `api/src/integrity/checker.ts`
- Test: `tests/features/integrity/lines.api.spec.ts` (append)

**Interfaces:**
- Consumes: `latestLineAnchors`, `classifyLine`, `lineSha256` (Task 2); `linesPrefix`; store LIST (Task 3).
- Produces: `Check` type gains `'lines'` in `breach` and optional `lines: { checked, diverged, sample }`; exported `compareDatasetLines(dataset, store): Promise<{ checked: number, edited: string[], inserted: string[], missing: string[], anchors: Map<...> }>` (reused by restore/fix in Task 8); renewal pass writing `integrity.linesRenewal`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/integrity/lines.api.spec.ts` — the three tamper shapes:

```ts
const enableAndDrain = async (ax: any, datasetId: string) => {
  await ax.put(`${apiUrl}/api/v1/datasets/${datasetId}/_integrity`, { active: true })
  await waitForLinesDrained(ax, datasetId)
}

test('check reports the three line tamper shapes and heals via the transaction path', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }, { attr1: 'b', attr2: 2 }])
  await new Promise(r => setTimeout(r, 1000))
  await enableAndDrain(ax, dataset.id)

  let check = (await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  // 1. out-of-band content edit (no _hash/_i touch — the silent-edit blind spot the fold had)
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { attr1: 'tampered' } }
  })
  // 2. out-of-band insert
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'ghost' }, update: { $set: { attr1: 'ghost', _i: 1, _updatedAt: new Date().toISOString() } }, upsert: true
  })
  // 3. out-of-band delete
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-delete-one/${dataset.id}`, { filter: { _id: 'line1' } })

  check = (await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  expect(check.breach).toContain('lines')
  expect(check.lines.diverged).toBe(3)
  expect(check.lines.sample.sort()).toEqual(['ghost', 'line0', 'line1'])
})
```

This needs two small test-env additions — in `api/src/misc/routers/test-env.ts`, extend `rest-collection-update-one` and add a delete endpoint:

```ts
// Update one document in a REST dataset MongoDB collection
router.post('/rest-collection-update-one/:datasetId', async (req, res, next) => {
  try {
    const { filter, update, upsert } = req.body
    await mongo.db.collection('dataset-data-' + req.params.datasetId).updateOne(filter, update, { upsert: !!upsert })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Delete one document in a REST dataset MongoDB collection (out-of-band tamper for integrity tests)
router.post('/rest-collection-delete-one/:datasetId', async (req, res, next) => {
  try {
    await mongo.db.collection('dataset-data-' + req.params.datasetId).deleteOne(req.body.filter)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: the new test FAILS — check returns `ok` despite tampers (no lines part yet).

- [ ] **Step 3: Implement the checker lines part**

In `api/src/integrity/checker.ts`:

Add imports:

```ts
import { isFileDataset, isRestDataset } from '#types/dataset/index.ts'
import * as restUtils from '../datasets/utils/rest.ts'
import * as lops from './lines-operations.ts'
```

Extend the `Check` type:

```ts
export type Check = {
  status: 'ok' | 'breach' | 'unknown'
  date?: string
  breach?: Array<'file' | 'metadata' | 'lines'>
  lines?: { checked: number, diverged: number, sample: string[] }
}
```

Add the comparison helper (exported — restore/fix reuse it):

```ts
// Compare live Mongo lines against the latest anchors recovered from LIST alone (the sha256 is
// embedded in each key). Returns the three divergence shapes plus the anchor map (restore/fix
// need the keys to fetch payloads / write tombstones).
export const compareDatasetLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>) => {
  const keys = (await store.listRevisions(lops.linesPrefix(dataset.owner, dataset.id))).map((r) => r.key)
  const anchors = lops.latestLineAnchors(keys)
  const unvisited = new Set(anchors.keys())
  const edited: string[] = []
  const inserted: string[] = []
  let checked = 0
  const c = restUtils.collection(dataset as any)
  for await (const line of c.find({ _deleted: { $ne: true } })) {
    checked++
    unvisited.delete(line._id)
    const verdict = lops.classifyLine(line, anchors.get(line._id))
    if (verdict === 'edited') edited.push(line._id)
    else if (verdict === 'inserted') inserted.push(line._id)
    if (checked % 1000 === 0) await new Promise(resolve => setImmediate(resolve))
  }
  // anchors never visited by a live line: out-of-band deletes (unless their latest is a tombstone)
  const missing = [...unvisited].filter((lineId) => !anchors.get(lineId)!.deleted)
  return { checked, edited, inserted, missing, anchors }
}
```

In `checkDataset`, extend the pending guard (line ~49):

```ts
  if (dataset._needsHistorizing || dataset._needsHistorizingLines) return { status: 'unknown' }
```

After the metadata comparison (line ~74) and before computing `status`, add:

```ts
  let linesResult: { checked: number, diverged: number, sample: string[] } | undefined
  let linesCompare: Awaited<ReturnType<typeof compareDatasetLines>> | undefined
  if (isRestDataset(dataset as any)) {
    linesCompare = await compareDatasetLines(dataset, store)
    const divergedIds = [...linesCompare.edited, ...linesCompare.inserted, ...linesCompare.missing]
    if (divergedIds.length) breach.push('lines')
    linesResult = { checked: linesCompare.checked, diverged: divergedIds.length, sample: divergedIds.slice(0, 20) }
  }
```

Extend the persisted verdict and the return value:

```ts
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.lastCheck': { date, status, ...(breach.length ? { breach } : {}), ...(linesResult ? { lines: linesResult } : {}) } }
  })
```

```ts
  if (status === 'ok') {
    await maybeRenew(dataset, store, latest)
    if (linesCompare) await maybeRenewLines(dataset, store, linesCompare.anchors)
  }
  return { status, date, ...(breach.length ? { breach } : {}), ...(linesResult ? { lines: linesResult } : {}) }
```

Add the renewal function next to `maybeRenew`:

```ts
// Per-line lock renewal (target 3): when the dataset's lines-renewal horizon is due and the
// check passed, extend every live latest anchor in one pass. Exhaustive by necessity (§3.5):
// a missed renewal permanently loses that line's repairability at lock expiry. Tombstone
// anchors are deliberately skipped — a deleted line's history ages out.
const maybeRenewLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, anchors: Map<string, lops.LatestLineAnchor>): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal((dataset.integrity as any)?.linesRenewal?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  let renewed = 0
  let failed = 0
  for (const anchor of anchors.values()) {
    if (anchor.deleted) continue
    try {
      await store.extendRetention(anchor.key, retainUntil)
      renewed++
    } catch (err) {
      internalError('integrity-renew-lines', err)
      failed++
    }
  }
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.linesRenewal': { date, status: failed ? 'failed' : 'ok', renewed, failed, ...(failed ? {} : { retainUntil: retainUntil.toISOString() }) } }
  })
}
```

(`DatasetInternal` now includes `_needsHistorizingLines` from Task 1 — no cast needed in the guard.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts tests/features/integrity/core.api.spec.ts`
Expected: all pass (core suite confirms file/metadata checks are untouched — non-REST datasets skip the lines part).

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/checker.ts api/src/misc/routers/test-env.ts tests/features/integrity/lines.api.spec.ts
git commit -m "feat(integrity): lines verdict in the checker and exhaustive per-line lock renewal"
```

---

### Task 8: Repair — lines restore and fix

**Files:**
- Modify: `api/src/datasets/routes/integrity.ts` (`_fix` handler + new `POST _integrity/lines/_restore`)
- Test: `tests/features/integrity/lines.api.spec.ts` (append)

**Interfaces:**
- Consumes: `compareDatasetLines` (Task 7), `anchorLine`/`historizeLines` (Task 5), `applyTransactions(…, historizeContext)` (Task 4).
- Produces: `POST /datasets/{id}/_integrity/lines/_restore` (superadmin, sync, returns fresh `Check`); `_fix` blesses diverged lines inline.

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/integrity/lines.api.spec.ts`:

```ts
test('lines restore heals all three tamper shapes and returns a fresh ok verdict', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }, { attr1: 'b', attr2: 2 }])
  await new Promise(r => setTimeout(r, 1000))
  await enableAndDrain(ax, dataset.id)

  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { attr1: 'tampered' } }
  })
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'ghost' }, update: { $set: { attr1: 'ghost', _i: 1, _updatedAt: new Date().toISOString() } }, upsert: true
  })
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-delete-one/${dataset.id}`, { filter: { _id: 'line1' } })

  const verdict = (await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity/lines/_restore`, { reason: 'test remediation' })).data
  expect(verdict.status).toBe('ok')
  // hot state healed: content back, ghost gone, deleted line re-inserted
  const line0 = await rawLine(ax, dataset.id, 'line0')
  expect(line0.attr1).toBe('a')
  const ghost = await rawLine(ax, dataset.id, 'ghost')
  expect(ghost).toBeNull()
  const line1 = await rawLine(ax, dataset.id, 'line1')
  expect(line1.attr1).toBe('b')
})

test('_fix blesses the current tampered state as the new anchored truth', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'a', attr2: 1 }])
  await new Promise(r => setTimeout(r, 1000))
  await enableAndDrain(ax, dataset.id)

  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { attr1: 'legitimate-oob-edit' } }
  })
  let check = (await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')

  const verdict = (await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity/_fix`, { reason: 'known migration' })).data
  expect(verdict.status).toBe('ok')
  const line0 = await rawLine(ax, dataset.id, 'line0')
  expect(line0.attr1).toBe('legitimate-oob-edit')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: restore test FAILS with 404 (route missing); fix test FAILS (verdict stays breach — `_fix` ignores lines).

- [ ] **Step 3: Implement the lines restore route**

In `api/src/datasets/routes/integrity.ts` add (after the existing `_restore` route). Note Express route order: register `/:datasetId/_integrity/lines/_restore` BEFORE the generic `/:datasetId/_integrity/revisions*` routes is not required (paths differ), but keep all `lines/` routes grouped:

```ts
  // Target 3: restore every diverged line to its last verified state, through the standard
  // transaction pipeline (the restore itself is a legitimate write and produces fresh
  // revisions). Synchronous: drains the relay inline and responds with the fresh verdict.
  router.post('/:datasetId/_integrity/lines/_restore', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    if (!isRestDataset(dataset)) throw httpError(400, 'lines restore only applies to an editable (rest) dataset')
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
    const store = integrityStore()
    const checker = await import('../../integrity/checker.ts')
    const linesRelay = await import('../../integrity/lines-relay.ts')

    // drain any pending organic stamps first so the comparison sees anchored truth
    await linesRelay.historizeLines(dataset)

    const compare = await checker.compareDatasetLines(dataset, store)
    const transacs: any[] = []
    // edited lines and out-of-band-deleted lines: rewrite from the latest revision's payload
    for (const lineId of [...compare.edited, ...compare.missing]) {
      const anchor = compare.anchors.get(lineId)!
      const rev: any = await store.getRevision(anchor.key)
      if (!rev.payload) continue // defensive: tombstone anchors are never in edited/missing
      transacs.push({ _action: 'createOrUpdate', _id: lineId, ...rev.payload })
    }
    // out-of-band-inserted lines have no verified state: restoring means deleting them
    for (const lineId of compare.inserted) {
      transacs.push({ _action: 'delete', _id: lineId })
    }
    if (transacs.length) {
      await restUtils.applyTransactions(dataset, undefined, transacs, undefined, undefined, undefined,
        { operation: 'restore', origin: 'superadmin', ...(reason ? { reason } : {}) })
      // route the restored lines through extension/indexing like any partial rest update
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _partialRestStatus: 'updated' } })
      const fresh = await mongo.datasets.findOne({ id: dataset.id })
      await linesRelay.historizeLines(fresh as any)
    }
    const freshAfter = await mongo.datasets.findOne({ id: dataset.id })
    res.json(await checker.checkDataset(freshAfter as any))
  })
```

- [ ] **Step 4: Extend `_fix` for lines**

In the `_fix` handler, after the existing `anchorDataset(...)` call and flag clear, add:

```ts
    // Target 3: bless the current line state — fresh revisions for edited/inserted live lines,
    // tombstone revisions for anchored-but-vanished lines, all inline (bounded by the gate)
    if (isRestDataset(dataset)) {
      const store = integrityStore()
      const checkerMod = await import('../../integrity/checker.ts')
      const linesRelay = await import('../../integrity/lines-relay.ts')
      await linesRelay.historizeLines(dataset)
      const compare = await checkerMod.compareDatasetLines(dataset, store)
      const retentionDays = config.integrity!.retention?.days ?? 365
      const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
      const hint = { operation: 'fixIntegrity' as const, origin: 'superadmin' as const, ...(typeof req.body?.reason === 'string' ? { reason: req.body.reason } : {}) }
      const c = restUtils.collection(dataset)
      for (const lineId of [...compare.edited, ...compare.inserted]) {
        const line = await c.findOne({ _id: lineId })
        if (line) await linesRelay.anchorLine(dataset, line, store, retainUntil, hint)
      }
      for (const lineId of compare.missing) {
        const anchor = compare.anchors.get(lineId)!
        // a tombstone revision for a vanished line: continue its sequence past the stale anchor
        await linesRelay.anchorLine(dataset, { _id: lineId, _i: anchor.i + 1, _deleted: true }, store, retainUntil, hint)
      }
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: all pass. If the restore test flakes on ES-related timing, the assertion set only reads Mongo state — investigate rather than adding sleeps (systematic-debugging).

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/routes/integrity.ts tests/features/integrity/lines.api.spec.ts
git commit -m "feat(integrity): lines restore and fix — heal or bless diverged lines synchronously"
```

---

### Task 9: Per-line revision history endpoints

**Files:**
- Modify: `api/src/datasets/routes/integrity.ts`
- Test: `tests/features/integrity/lines.api.spec.ts` (append)

**Interfaces:**
- Produces: `GET /datasets/{id}/_integrity/lines/{lineId}/revisions` → `{ count, results: [{ i, sha256?, deleted?, date, operation, origin, reason?, hasPayload }] }` (newest first, `page`/`size` params); `GET …/revisions/{i}` → `{ i, hash, context, line, payload, current }` where `current` is the live cleaned body for the diff.

- [ ] **Step 1: Write the failing tests**

```ts
test('per-line revision history lists newest-first and serves the payload diff', async () => {
  const ax = await axiosAuth({ email: 'superadmin@test.com', adminMode: true })
  const dataset = await restDataset(ax, [{ attr1: 'v1', attr2: 1 }])
  await new Promise(r => setTimeout(r, 1000))
  await enableAndDrain(ax, dataset.id)
  await ax.post(`${apiUrl}/api/v1/datasets/${dataset.id}/lines`, { _id: 'line0', attr1: 'v2', attr2: 1 })
  await waitForLinesDrained(ax, dataset.id)

  const history = (await ax.get(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity/lines/line0/revisions`)).data
  expect(history.count).toBe(2)
  expect(history.results[0].hasPayload).toBe(true)
  expect(history.results[0].i).toBeGreaterThan(history.results[1].i)

  const detail = (await ax.get(`${apiUrl}/api/v1/datasets/${dataset.id}/_integrity/lines/line0/revisions/${history.results[1].i}`)).data
  expect(detail.payload).toMatchObject({ attr1: 'v1' })
  expect(detail.current).toMatchObject({ attr1: 'v2' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/integrity/lines.api.spec.ts`
Expected: FAIL 404.

- [ ] **Step 3: Implement the endpoints**

In `api/src/datasets/routes/integrity.ts` add:

```ts
  router.get('/:datasetId/_integrity/lines/:lineId/revisions', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    if (!isRestDataset(dataset)) throw httpError(400, 'line revisions only apply to an editable (rest) dataset')
    const store = integrityStore()
    const keys = (await store.listRevisions(lops.lineRevisionPrefix(dataset.owner, dataset.id, req.params.lineId as string)))
      .map((r) => r.key).sort().reverse()
    const count = keys.length
    const size = Math.min(parseInt(String(req.query.size ?? '20'), 10) || 20, 100)
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1
    const results = await Promise.all(keys.slice((page - 1) * size, (page - 1) * size + size).map(async (key) => {
      const parsed = lops.parseLineRevisionKey(key)!
      const rev: any = await store.getRevision(key)
      return {
        i: parsed.i,
        ...(parsed.deleted ? { deleted: true } : { sha256: parsed.sha256 }),
        date: rev.context.date,
        operation: rev.context.operation,
        origin: rev.context.origin,
        ...(rev.context.reason ? { reason: rev.context.reason } : {}),
        hasPayload: !!rev.payload
      }
    }))
    res.json({ count, results })
  })

  router.get('/:datasetId/_integrity/lines/:lineId/revisions/:i', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    if (!isRestDataset(dataset)) throw httpError(400, 'line revisions only apply to an editable (rest) dataset')
    const i = parseInt(req.params.i as string, 10)
    if (Number.isNaN(i) || i < 0) throw httpError(400, 'invalid revision index')
    const store = integrityStore()
    // the key embeds the content hash, unknown to the caller: find it by its padded-index prefix
    const prefix = lops.lineRevisionPrefix(dataset.owner, dataset.id, req.params.lineId as string)
    const keys = (await store.listRevisions(prefix)).map((r) => r.key)
    const key = keys.find((k) => k.startsWith(`${prefix}${lops.padLineIndex(i)}-`))
    if (!key) throw httpError(404, 'unknown revision')
    const rev: any = await store.getRevision(key)
    const currentLine = await restUtils.collection(dataset).findOne({ _id: req.params.lineId as string })
    res.json({ i, hash: rev.hash, context: rev.context, line: rev.line, payload: rev.payload, current: currentLine ? lops.cleanedLineBody(currentLine) : undefined })
  })
```

- [ ] **Step 4: Run tests, then lint and type-check everything so far**

Run: `npx playwright test tests/features/integrity/`
Expected: all integrity suites pass.
Run: `npm run lint` and `bash dev/check-types-ratchet.sh`
Expected: clean / no net-new errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/routes/integrity.ts tests/features/integrity/lines.api.spec.ts
git commit -m "feat(integrity): per-line revision history and diff endpoints"
```

---

### Task 10: Admin UI — lines section in the integrity panel

**Files:**
- Modify: `ui/src/components/dataset/dataset-integrity.vue`

**Interfaces:**
- Consumes: `GET _integrity` `lines` summary (Task 6), `lastCheck.lines` (Task 7), `POST _integrity/lines/_restore` (Task 8), `GET _integrity/lines/{lineId}/revisions[/{i}]` (Task 9).

- [ ] **Step 1: Read the existing component end to end**

Read `ui/src/components/dataset/dataset-integrity.vue` fully before editing — reuse its fetch composables, `useAsyncAction` pattern (integrity4 established it for actions: loading + error toast), alert components and French wording style.

- [ ] **Step 2: Add the lines summary + backfill progress**

For enrolled REST datasets (`dataset.isRest && integrity.active`), under the existing status alerts add a lines block following the component's existing markup idioms:

- a line count summary: `{{ integrity.lines.anchored }} lignes ancrées` and, when `integrity.lines.pending > 0`, a `v-progress-linear` (indeterminate) with `{{ integrity.lines.pending }} lignes en attente d'ancrage` — poll `GET _integrity` every ~2s while pending > 0 (mirror how the component refreshes after actions).
- when `integrity.lines.overGate`, a `type="warning"` alert: `Ce jeu de données dépasse le seuil de lignes recommandé pour le suivi d'intégrité — l'ancrage continue mais les contrôles et renouvellements de verrous sont coûteux.`

- [ ] **Step 3: Add the lines verdict + restore action**

When `integrity.lastCheck?.lines?.diverged > 0`, render an error alert listing `lastCheck.lines.diverged` and the `sample` line ids (chips or a simple list), with two admin-mode buttons wired via `useAsyncAction`:

- `Restaurer les lignes` → `POST /_integrity/lines/_restore` (with an optional reason text field, like the existing fix dialog) — on success replace the local check state with the response.
- the existing `_fix` button already covers "bless" — no new button, but update its help text to mention lines.

Per diverged sample line id, an icon button opens a dialog fetching `GET _integrity/lines/{lineId}/revisions`; selecting a revision fetches `…/revisions/{i}` and renders the `payload` vs `current` diff with the same diff rendering integrity4 added for metadata revisions (reuse that subcomponent/util — locate it inside this same file or its imports).

- [ ] **Step 4: Verify in the running dev stack**

Run `bash dev/status.sh` — if the stack is healthy, exercise manually via the dev UI (the user runs the servers; do NOT start them). Otherwise validate with `npm run build` (UI must compile) and `npm run check-types`.
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/dataset-integrity.vue
git commit -m "feat(integrity): lines section in the admin integrity panel"
```

---

### Task 11: Dev fixtures + documentation

**Files:**
- Modify: the dev fixtures script (locate with `grep -n "dev-fixtures" package.json` → follow to the script file; the two existing datasets are `fixtures-integrite-ok` / `fixtures-integrite-breach`)
- Modify: `docs/architecture/integrity.md`
- Modify: `docs/architecture/testing.md` only if it indexes test files explicitly (check; likely no change)

- [ ] **Step 1: Add the `fixtures-integrite-lignes` fixture**

Following the existing two integrity fixtures' structure (skip-if-exists, seeded in the `dev_fixtures` org), add a REST dataset demonstrating the target-3 flow: create with a small schema, insert ~5 lines, enable integrity (`PUT _integrity {active: true}`), wait for the backfill to drain, apply one legitimate line update (extra revision in the history), then tamper one line's content out-of-band via a raw collection write (the fixtures script has DB access — mirror how the breach fixture tampers) so the check reports `breach: ['lines']`. Comment the restore path (`lines/_restore`) like the breach fixture comments `_fix`, and note the re-tamper-on-each-run caveat if applicable.

- [ ] **Step 2: Run the fixtures**

Run: `npm run dev-fixtures`
Expected: the new dataset seeds without error; the logged check reports `breach` with `lines`.

- [ ] **Step 3: Update `docs/architecture/integrity.md`**

Record the pivot (keep the document authoritative):

- **Header status note**: target 3 delivered as pure level 2 per-line revisions.
- **§5 table**: the editable-dataset row becomes "✅ delivered — per-line locked revisions (detect + repair), gated ~100k lines, opt-in"; the fold-based level-1 row moves to a "possible later level for above-gate datasets" note.
- **§5 body**: replace the "Level 1 = whole-state rolling fingerprint" and "Level 2 = §3.5 mirror" bullets with the delivered design: per-line outbox (`_needsHistorizing` on line docs + `_needsHistorizingLines` hint, hint-first ordering), key layout `…/lines/‹lineId›/‹paddedI›-‹sha256|deleted›` (hash-in-key → check from LIST alone), SHA-256 of the stored snapshot (closing the hash-strength open question — CRC32 `_hash` stays a conflict-detection tool), cleaned-body coverage (`_ext_*` and `_updatedBy*` excluded), tombstone purge coordination, refusals (deleteAllLines / drop-mode bulk), enable gate + backfill, renewal riding the check, restore/fix semantics. State the explicit limits: attachments bytes not covered; above-gate datasets have no lines integrity (the accepted coverage cliff).
- **§10**: mark target 3 ✅ with a summary and a pointer to `docs/plans/2026-07-20-integrity-target3-lines-design.md`; list the follow-ups (attachments md5/copy, fold L1 for the big tail, applications/settings metadata).
- **§12**: close the "editable-dataset hashing / hash strength" open question (decided: snapshot SHA-256; fold abandoned for v1).
- **§4.1**: add the third fixture dataset to the dev-fixtures list.

- [ ] **Step 4: Full integrity suite + gates**

Run: `npx playwright test tests/features/integrity/ && npm run lint && bash dev/check-types-ratchet.sh`
Expected: all pass, no net-new type errors.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/integrity.md <fixtures-script-path>
git commit -m "docs(integrity): record target 3 delivery; seed the lines integrity fixture"
```

---

## Post-plan checks (before handing back to the user)

- Run the three integrity suites plus the main REST-lines suite one final time.
- Do NOT push — the user pushes (harness SIGPIPE) and then opens the PR (which should also mention the merged `feat-integrity4` level-2 work riding this branch).
