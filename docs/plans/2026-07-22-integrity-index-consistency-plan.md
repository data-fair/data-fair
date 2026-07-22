# Integrity A1 — ES index consistency verdict: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify that what users read through ES (`/lines`, via the alias) is consistent with the verified source of truth, surfaced as a fourth breach member `'index'` with a panel reindex remedy.

**Architecture:** One uniform mechanism for REST and file datasets: a count check plus seeded-random sampled `_i` windows every nightly check, exhaustive compare only via the existing `?deep=true`. A new `api/src/integrity/index-check.ts` engine holds the compare; pure window/compare logic lives in `api/src/integrity/index-operations.ts`; `checkDataset` calls the engine as its third verdict. Spec: `docs/plans/2026-07-22-integrity-index-consistency-design.md`.

**Tech Stack:** TypeScript (Node 24, `#config`/`#mongo`/`#es` import aliases), Elasticsearch JS client, MongoDB, Playwright API tests.

## Global Constraints

- **Never start/stop dev processes** — zellij/docker are user-managed (AGENTS.md).
- Husky pre-commit runs **lint** — every commit must pass `npm run lint`.
- Type ratchet: `bash dev/check-types-ratchet.sh` must show **no net-new tsc errors** (full `check-types` is historically broken; the ratchet is the gate).
- Run **only the related test files** while iterating (`npx playwright test tests/features/integrity/<file>`); the full suite runs on push.
- Code conventions (docs/architecture/code-conventions.md): routes thin, orchestration in service/engine modules, **pure logic in `*-operations.ts`** files with unit tests.
- Every ES access in the new check goes **through the alias** (`aliasName(dataset)`), never a physical index name.
- The sampling seed is **never persisted before use** (crypto-random per run); an explicit seed is accepted only from the superadmin `_check` route (test determinism).
- Match surrounding comment style: comments state constraints/invariants, not narration.

**Key pre-verified facts (do not re-derive):**
- REST ES docs use the Mongo line `_id` as ES `_id` (`api/src/datasets/es/index-stream.ts:84`); file rows get throwaway nanoids but carry a dense 1-based `_i` (`api/src/datasets/utils/data-streams.ts:86-87` — empty CSV lines consume an `_i`, so gaps are possible and max `_i` may exceed `dataset.count`).
- REST `_i` is sparse (time-derived); unique index exists (`rest.ts:190`).
- File `dataset.count` = rows read from the file by the indexer (`index-lines.ts:222`), NOT an ES count → count check is non-circular; REST authoritative count = `restUtils.count(dataset, { _deleted: { $ne: true } })`.
  > **Correction (delivery):** the spec (§3.1) additionally claimed `dataset.count` "is covered by
  > the metadata hash, so an adversary cannot silently adjust it" — that part is **wrong**: `count`
  > is on the metadata hash *denylist* (`EXCLUDED_TOP_LEVEL`, indexer-churn field). The
  > non-circularity point above stays true; the file-side count check is a tripwire, hint-grade,
  > grounded for real by the sampled windows / `?deep=true` re-reading the (hash-covered) file. See
  > the design doc's own §3.1 correction.
- Enrollment refuses datasets with attachment fields (`service.ts:85-87`) → `_file_raw`/`_file` never occur on enrolled datasets. The only index-time non-derivable field is **`_rand`** (`Math.random()` at index time, `extensions.ts:726`) → exclusion set is `{'_rand'}`.
- The indexer projection to mirror = `stripTransientLineFlags` + delete `_hash`/`_deleted`/`_id` + `prepareCalculations(dataset)` (see `index-stream.ts:27-32,66-92`); for file datasets the read path is `readStreams(dataset, false, extended, false)` from `data-streams.ts:257` with `extended = dataset.extensions?.some(e => e.active)` (mirrors `index-lines.ts:114-116`).
- Mongo line docs hold `Date` objects (`_updatedAt`); ES `_source` holds their JSON serialization → expected docs must be JSON-round-tripped before compare.
- `journals.log(resourceType, resource, event)` accepts arbitrary `event.type` strings (`api/src/misc/utils/journals.ts:8`).
- `checkDataset` runs under the per-dataset worker lock (sweep + `_check` route both hold it), so file-pipeline/index-task races are excluded; only direct REST line writes can land mid-check, and they set `_needsIndexing` → the engine re-checks pending flags before reporting a divergence.

---

### Task 1: Pure sampling & compare operations

**Files:**
- Create: `api/src/integrity/index-operations.ts`
- Test: `tests/features/integrity/index-operations.unit.spec.ts`

**Interfaces:**
- Produces (used by Tasks 4-6):
  - `type DivergedEntry = { key: string, kind: 'edited' | 'missing' | 'surplus', expected?: string, actual?: string }`
  - `type WindowDoc = { join: string, i: number, doc: Record<string, any> }`
  - `PROJECTION_EXCLUDED_KEYS: Set<string>`
  - `samplePivots(seed: string, windows: number, minI: number, maxI: number): number[]`
  - `normalizeProjectedDoc(doc: Record<string, any>): Record<string, any>`
  - `docEvidence(doc: Record<string, any>, cap?: number): string`
  - `compareWindowDocs(source: WindowDoc[], es: WindowDoc[], bounds: { sourceExhausted: boolean, esExhausted: boolean }): { checked: number, diverged: DivergedEntry[] }`
- Produces (used by tests, Task 4+): the module is imported directly by `tests/support/integrity.ts` (same pattern as `IntegrityStore`).

- [ ] **Step 1: Write the failing unit tests**

```ts
// tests/features/integrity/index-operations.unit.spec.ts
// Pure window sampling & projected-doc compare for the index-consistency verdict (A1).
import { test, expect } from '@playwright/test'
import { samplePivots, normalizeProjectedDoc, compareWindowDocs, docEvidence, PROJECTION_EXCLUDED_KEYS } from '../../api/src/integrity/index-operations.ts'

test('samplePivots is deterministic for a seed, spread over the domain, sorted and deduped', () => {
  const a = samplePivots('seed-1', 8, 1, 1000000)
  const b = samplePivots('seed-1', 8, 1, 1000000)
  expect(a).toEqual(b)
  expect(a.length).toBeGreaterThan(0)
  expect(a.length).toBeLessThanOrEqual(8)
  expect([...a].sort((x, y) => x - y)).toEqual(a)
  for (const p of a) { expect(p).toBeGreaterThanOrEqual(1); expect(p).toBeLessThanOrEqual(1000000) }
  expect(samplePivots('seed-2', 8, 1, 1000000)).not.toEqual(a)
})

test('samplePivots handles degenerate domains', () => {
  expect(samplePivots('s', 4, 5, 5)).toEqual([5])
  expect(samplePivots('s', 4, 10, 5)).toEqual([])
})

test('normalizeProjectedDoc round-trips dates and strips excluded keys', () => {
  expect(PROJECTION_EXCLUDED_KEYS.has('_rand')).toBe(true)
  const d = new Date('2026-07-22T10:00:00.000Z')
  const doc = normalizeProjectedDoc({ a: 1, _updatedAt: d, _rand: 42 })
  expect(doc).toEqual({ a: 1, _updatedAt: '2026-07-22T10:00:00.000Z' })
})

test('compareWindowDocs finds edited, missing and surplus docs within the common span', () => {
  const src = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 2 } },
    { join: 'l3', i: 3, doc: { a: 3 } }
  ]
  const es = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 'tampered' } },
    { join: 'lX', i: 3, doc: { a: 99 } }
  ]
  const { checked, diverged } = compareWindowDocs(src, es, { sourceExhausted: true, esExhausted: true })
  expect(checked).toBe(3)
  expect(diverged.map(d => `${d.kind}:${d.key}`).sort()).toEqual(['edited:l2', 'missing:l3', 'surplus:lX'])
  const edited = diverged.find(d => d.kind === 'edited')!
  expect(edited.expected).toContain('"a":2')
  expect(edited.actual).toContain('"tampered"')
})

test('compareWindowDocs cuts at the shorter unexhausted side (span intersection)', () => {
  // es window filled up at i=2 (not exhausted): docs beyond i=2 on the source side are outside
  // the comparable span and must NOT read as missing
  const src = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 2 } },
    { join: 'l3', i: 3, doc: { a: 3 } }
  ]
  const es = [
    { join: 'l1', i: 1, doc: { a: 1 } },
    { join: 'l2', i: 2, doc: { a: 2 } }
  ]
  const { checked, diverged } = compareWindowDocs(src, es, { sourceExhausted: true, esExhausted: false })
  expect(checked).toBe(2)
  expect(diverged).toEqual([])
})

test('docEvidence caps the serialized excerpt', () => {
  const s = docEvidence({ big: 'x'.repeat(5000) }, 100)
  expect(s.length).toBeLessThanOrEqual(101)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/index-operations.unit.spec.ts`
Expected: FAIL (module `index-operations.ts` does not exist).

- [ ] **Step 3: Implement the module**

```ts
// api/src/integrity/index-operations.ts
// Pure functions for the index-consistency verdict (A1): seeded window sampling and
// projected-doc comparison. No es/mongo/config imports (unit-tested directly).
import crypto from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export type DivergedEntry = { key: string, kind: 'edited' | 'missing' | 'surplus', expected?: string, actual?: string }
export type WindowDoc = { join: string, i: number, doc: Record<string, any> }

// index-time fields that cannot be re-derived from the source: _rand is Math.random() at index
// time (extensions.ts). _file/_file_raw cannot occur: enrollment refuses attachment datasets.
export const PROJECTION_EXCLUDED_KEYS = new Set(['_rand'])

// W pivots derived from the seed by hashing — deterministic per seed (test aiming), uniform over
// [minI, maxI]. The nightly caller draws a fresh crypto-random seed per run and never persists it
// before use, so an adversary cannot know which rows tonight's windows will visit.
export const samplePivots = (seed: string, windows: number, minI: number, maxI: number): number[] => {
  if (maxI < minI) return []
  const span = BigInt(maxI - minI + 1)
  const pivots = new Set<number>()
  for (let n = 0; n < windows; n++) {
    const h = crypto.createHash('sha256').update(`${seed}:${n}`).digest()
    pivots.add(minI + Number(h.readBigUInt64BE(0) % span))
  }
  return [...pivots].sort((a, b) => a - b)
}

// JSON round-trip (Dates → ISO strings, undefined dropped — exactly what the bulk indexer's
// serialization produced) + strip the non-derivable keys from either side of the compare
export const normalizeProjectedDoc = (doc: Record<string, any>): Record<string, any> => {
  const out = JSON.parse(JSON.stringify(doc))
  for (const k of PROJECTION_EXCLUDED_KEYS) delete out[k]
  return out
}

export const docEvidence = (doc: Record<string, any>, cap = 800): string => {
  const s = JSON.stringify(doc)
  return s.length > cap ? s.slice(0, cap) + '…' : s
}

// Compare two _i-ordered window slices over their common span. A side that filled its window
// (not exhausted) bounds the span at its last _i: rows beyond it on the other side are outside
// the comparable range, not divergences.
export const compareWindowDocs = (source: WindowDoc[], es: WindowDoc[], bounds: { sourceExhausted: boolean, esExhausted: boolean }): { checked: number, diverged: DivergedEntry[] } => {
  let spanEnd = Infinity
  if (!bounds.sourceExhausted && source.length) spanEnd = Math.min(spanEnd, source[source.length - 1].i)
  if (!bounds.esExhausted && es.length) spanEnd = Math.min(spanEnd, es[es.length - 1].i)
  const s = source.filter(d => d.i <= spanEnd)
  const esByJoin = new Map(es.filter(d => d.i <= spanEnd).map(d => [d.join, d]))
  const diverged: DivergedEntry[] = []
  for (const d of s) {
    const match = esByJoin.get(d.join)
    if (!match) { diverged.push({ key: d.join, kind: 'missing', expected: docEvidence(d.doc) }); continue }
    esByJoin.delete(d.join)
    if (!isDeepStrictEqual(d.doc, match.doc)) {
      diverged.push({ key: d.join, kind: 'edited', expected: docEvidence(d.doc), actual: docEvidence(match.doc) })
    }
  }
  for (const [join, d] of esByJoin) diverged.push({ key: join, kind: 'surplus', actual: docEvidence(d.doc) })
  return { checked: s.length, diverged }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/integrity/index-operations.unit.spec.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/index-operations.ts tests/features/integrity/index-operations.unit.spec.ts
git commit -m "feat(integrity): pure window sampling and projected-doc compare (A1)"
```

---

### Task 2: Types, dataset schema and config plumbing

**Files:**
- Modify: `api/src/integrity/checker.ts` (Check type only)
- Modify: `api/types/dataset/schema.js` (~line 449: breach enum + index block)
- Modify: `api/config/default.cjs` (integrity block, after `lines: { maxLines: 100000 },`)
- Modify: `api/config/type/schema.json` (integrity properties — mirror the existing `lines` entry shape)
- Modify: `api/config/custom-environment-variables.cjs` (mirror the existing integrity entries pattern)

**Interfaces:**
- Produces (used by Tasks 4-8):
  - `Check` gains `index?: IndexCheckResult` and `breach?: Array<'file' | 'metadata' | 'lines' | 'index'>`
  - `type IndexCheckResult = { status: 'ok' | 'diverged' | 'unknown', checked?: number, diverged?: number, sample?: DivergedEntry[], count?: { expected: number, actual: number } }` — declared in `api/src/integrity/index-check.ts` in Task 4; in THIS task declare it inline in checker.ts as a placeholder import-free type and move it in Task 4? **No** — to avoid churn, declare it in this task in a new minimal `api/src/integrity/index-check.ts` containing only the type export; Task 4 fills the implementation.
  - Config keys: `config.integrity.index = { windows: 8, windowSize: 128, sampleCap: 5 }`

- [ ] **Step 1: Create the type-only engine module**

```ts
// api/src/integrity/index-check.ts
// Index-consistency verdict (A1): is what users read through the ES alias consistent with the
// verified source of truth? Engine implementation lands with the REST/file adapters; the result
// type is shared with the checker and the dataset schema.
import type { DivergedEntry } from './index-operations.ts'

export type IndexCheckResult = {
  status: 'ok' | 'diverged' | 'unknown'
  checked?: number
  diverged?: number
  sample?: DivergedEntry[]
  count?: { expected: number, actual: number }
}
```

- [ ] **Step 2: Extend the Check type in checker.ts**

In `api/src/integrity/checker.ts`, add the import and extend `Check` (lines 29-36):

```ts
import type { IndexCheckResult } from './index-check.ts'
```

```ts
export type Check = {
  status: 'ok' | 'breach' | 'unknown'
  date?: string
  breach?: Array<'file' | 'metadata' | 'lines' | 'index'>
  lines?: { checked: number, diverged: number, sample: string[] }
  // verdict 3 (A1): the ES projection users actually read is consistent with the source
  index?: IndexCheckResult
  // verdict 2 (round 3): the trail itself is the one we wrote — absent on 'unknown' early returns
  trail?: TrailVerdict
}
```

Also widen the local breach array at line 255: `const breach: Array<'file' | 'metadata' | 'lines' | 'index'> = []`.

- [ ] **Step 3: Extend the dataset schema**

In `api/types/dataset/schema.js` (~line 450): add `'index'` to the breach enum and add the `index` block after the `lines` block:

```js
          breach: { type: 'array', items: { type: 'string', enum: ['file', 'metadata', 'lines', 'index'] } },
```

```js
          // verdict 3 (A1): sampled consistency of the ES projection (read through the alias)
          // against the verified source; sample entries persist tamper EVIDENCE (capped
          // expected/actual excerpts) because the reindex remedy destroys the live divergence
          index: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['ok', 'diverged', 'unknown'] },
              checked: { type: 'number' },
              diverged: { type: 'number' },
              count: {
                type: 'object',
                properties: { expected: { type: 'number' }, actual: { type: 'number' } }
              },
              sample: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['key', 'kind'],
                  properties: {
                    key: { type: 'string' },
                    kind: { type: 'string', enum: ['edited', 'missing', 'surplus'] },
                    expected: { type: 'string' },
                    actual: { type: 'string' }
                  }
                }
              }
            }
          },
```

After editing, rebuild types if the repo requires it: `npm run build-types` (check `git status` — if generated files changed, include them in the commit).

- [ ] **Step 4: Add config keys**

`api/config/default.cjs`, inside the `integrity` block after `lines: { maxLines: 100000 },`:

```js
    // index-consistency verdict (A1): nightly sampled compare of the ES projection vs the
    // source — windows × windowSize rows per run; sampleCap bounds persisted evidence entries
    index: { windows: 8, windowSize: 128, sampleCap: 5 },
```

`api/config/type/schema.json`: add to the integrity object's properties (mirror the shape of the existing `lines` entry exactly):

```json
"index": {
  "type": "object",
  "properties": {
    "windows": { "type": "integer" },
    "windowSize": { "type": "integer" },
    "sampleCap": { "type": "integer" }
  }
}
```

`api/config/custom-environment-variables.cjs`: inside the integrity block, following the exact `__format` pattern used by the neighboring integrity entries (e.g. `retention.days` / `lines.maxLines` — copy their idiom):

```js
    index: {
      windows: { __name: 'INTEGRITY_INDEX_WINDOWS', __format: 'json' },
      windowSize: { __name: 'INTEGRITY_INDEX_WINDOW_SIZE', __format: 'json' },
      sampleCap: { __name: 'INTEGRITY_INDEX_SAMPLE_CAP', __format: 'json' },
    },
```

- [ ] **Step 5: Verify types and existing tests**

Run: `bash dev/check-types-ratchet.sh`
Expected: no net-new errors.
Run: `npx playwright test tests/features/integrity/operations.unit.spec.ts tests/features/integrity/index-operations.unit.spec.ts`
Expected: PASS (no behavior change yet).

- [ ] **Step 6: Commit**

```bash
git add api/src/integrity/index-check.ts api/src/integrity/checker.ts api/types/dataset/schema.js api/config/default.cjs api/config/type/schema.json api/config/custom-environment-variables.cjs
git commit -m "feat(integrity): index verdict types, schema and config plumbing (A1)"
```

---

### Task 3: Test-env ES tamper routes

**Files:**
- Modify: `api/src/misc/routers/test-env.ts` (add after `tamper-dataset-file`, ~line 278)
- Modify: `tests/support/integrity.ts` (seed-aiming helpers)

**Interfaces:**
- Produces (used by Tasks 4-7 tests):
  - `POST /api/v1/test-env/es-tamper/:datasetId` — body `{ query, script?, params?, delete?, insert? }`: out-of-band ES write through the dataset's alias, always `refresh: true`
  - `POST /api/v1/test-env/es-refresh/:datasetId` — refresh the dataset's alias (tests call it before `_check` so ES near-real-time lag can't flake counts)
  - `aimSeedAt(targetI, minI, maxI, windows)` / `aimSeedAway(targetI, minI, maxI, windows)` in `tests/support/integrity.ts`

- [ ] **Step 1: Add the test-env routes**

```ts
// Out-of-band ES tamper through the dataset's alias (integrity index-verdict tests). The alias
// resolves to exactly one index so writes through it are accepted by ES.
router.post('/es-tamper/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const es = (await import('#es')).default
    const { aliasName } = await import('../../datasets/es/commons.ts')
    const alias = aliasName(dataset)
    if (req.body?.delete) {
      await es.client.deleteByQuery({ index: alias, body: { query: req.body.query }, refresh: true })
    } else if (req.body?.insert) {
      await es.client.index({ index: alias, document: req.body.insert, refresh: true })
    } else {
      await es.client.updateByQuery({
        index: alias,
        body: { query: req.body.query, script: { source: req.body.script, ...(req.body.params ? { params: req.body.params } : {}) } },
        refresh: true
      })
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Force a refresh of the dataset's alias so tests read a settled index before checking
router.post('/es-refresh/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const es = (await import('#es')).default
    const { aliasName } = await import('../../datasets/es/commons.ts')
    await es.client.indices.refresh({ index: aliasName(dataset) })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 2: Add the seed-aiming helpers to tests/support/integrity.ts**

```ts
import { samplePivots } from '../../api/src/integrity/index-operations.ts'

// --- A1 (index verdict) helpers ---------------------------------------------------------------

// Brute-force a seed whose sampled windows DO cover a target _i (pivot ≤ target ⇒ the window
// "next K rows from pivot" includes it, window sizes in tests exceed the dataset size).
export const aimSeedAt = (targetI: number, minI: number, maxI: number, windows: number): string => {
  for (let n = 0; n < 100000; n++) {
    const seed = `aim-${n}`
    if (samplePivots(seed, windows, minI, maxI).some((p) => p <= targetI)) return seed
  }
  throw new Error('no seed aims a window at the target line')
}

// ...and one whose windows all start ABOVE the target (the sampled pass must miss it)
export const aimSeedAway = (targetI: number, minI: number, maxI: number, windows: number): string => {
  for (let n = 0; n < 100000; n++) {
    const seed = `away-${n}`
    if (samplePivots(seed, windows, minI, maxI).every((p) => p > targetI)) return seed
  }
  throw new Error('no seed avoids the target line')
}
```

- [ ] **Step 3: Lint & commit**

Run: `npm run lint`
Expected: clean.

```bash
git add api/src/misc/routers/test-env.ts tests/support/integrity.ts
git commit -m "test(integrity): es tamper/refresh test-env routes and seed-aiming helpers (A1)"
```

---

### Task 4: Engine core + REST adapter + checker wiring

**Files:**
- Modify: `api/src/integrity/index-check.ts` (implementation)
- Modify: `api/src/integrity/checker.ts` (call the engine; persist/return `index`; `opts.seed`)
- Modify: `api/src/datasets/routes/integrity.ts` (`_check` accepts `body.seed`)
- Test: `tests/features/integrity/index.api.spec.ts`

**Interfaces:**
- Consumes: Task 1 ops, Task 2 types/config, Task 3 routes/helpers.
- Produces (used by Tasks 5-6): `checkIndexConsistency(dataset: DatasetInternal, opts?: { deep?: boolean, seed?: string }): Promise<IndexCheckResult>`; internal helpers `projectRestLine`, `esWindow`, `finishResult` reused by the file adapter and deep mode.
- `checkDataset(dataset, opts?: { deep?: boolean, seed?: string })` — seed flows only from the superadmin `_check` route.

- [ ] **Step 1: Write the failing API tests (REST)**

```ts
// tests/features/integrity/index.api.spec.ts
// A1: index-consistency verdict — the ES projection users read (through the alias) is compared
// against the verified source. REST datasets here; file datasets in the same file, Task 5.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'
import { ensureIntegrityBucket, waitForLinesDrained, waitForFlagCleared, aimSeedAt, aimSeedAway } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

const WINDOWS = 8 // config.integrity.index.windows default

// enrolled REST dataset with 3 lines, relay drained, indexed and refreshed — ready to check
const enrolledRestDataset = async (ax: any) => {
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity index ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }]
  })
  const dataset = res.data
  await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
    { _id: 'line0', attr1: 'a', attr2: 1 },
    { _id: 'line1', attr1: 'b', attr2: 2 },
    { _id: 'line2', attr1: 'c', attr2: 3 }
  ])
  await waitForFinalize(ax, dataset.id)
  await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForLinesDrained(ax, dataset.id)
  await waitForFlagCleared(dataset.id)
  await waitForFinalize(ax, dataset.id).catch(() => {}) // backfill may re-run indexing
  await ax.post(`${apiUrl}/api/v1/test-env/es-refresh/${dataset.id}`)
  return dataset
}

const lineI = async (ax: any, datasetId: string, lineId: string): Promise<number> => {
  const line = (await ax.get(`${apiUrl}/api/v1/test-env/rest-collection-find-one/${datasetId}`,
    { params: { filter: JSON.stringify({ _id: lineId }) } })).data
  return line._i
}

const lineIBounds = async (ax: any, datasetId: string, ids: string[]): Promise<{ min: number, max: number }> => {
  const is = await Promise.all(ids.map(id => lineI(ax, datasetId, id)))
  return { min: Math.min(...is), max: Math.max(...is) }
}

test('clean REST dataset gets an ok index verdict with matching counts', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
  expect(check.index?.status).toBe('ok')
  expect(check.index?.count).toEqual({ expected: 3, actual: 3 })
  expect(check.index?.checked).toBeGreaterThan(0)
})

test('an out-of-band ES edit inside a sampled window is a breach with evidence', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, script: "ctx._source.attr1 = 'es-tampered'"
  })
  const target = await lineI(ax, dataset.id, 'line0')
  const { min, max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  const seed = aimSeedAt(target, min, max, WINDOWS)
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(check.status).toBe('breach')
  expect(check.breach).toContain('index')
  expect(check.index?.status).toBe('diverged')
  const edited = check.index!.sample.find((s: any) => s.kind === 'edited')
  expect(edited?.key).toBe('line0')
  expect(edited?.actual).toContain('es-tampered')
  expect(edited?.expected).toContain('"attr1":"a"')
  // evidence is persisted on the dataset doc BEFORE any repair (the reindex destroys it live)
  const state = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.lastCheck?.index?.sample?.[0]?.kind).toBeTruthy()
})

test('an ES delete outside every sampled window is still caught by the count check', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, delete: true
  })
  const target = await lineI(ax, dataset.id, 'line0')
  const { min, max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  const seed = aimSeedAway(target, min, max, WINDOWS)
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(check.breach).toContain('index')
  expect(check.index?.status).toBe('diverged')
  expect(check.index?.count).toEqual({ expected: 3, actual: 2 })
})

test('a surplus ES doc is flagged (count + window intersection)', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  const { max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    insert: { _i: max + 1000, attr1: 'ghost', attr2: 99 }
  })
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.breach).toContain('index')
  expect(check.index?.count).toEqual({ expected: 3, actual: 4 })
})

test('pending indexing downgrades the index verdict to unknown, other verdicts unaffected', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  // simulate a line awaiting the index task (out-of-band flag: no relay hint, no real write)
  await ax.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' }, update: { $set: { _needsIndexing: true } }
  })
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.index?.status).toBe('unknown')
  expect(check.breach ?? []).not.toContain('index')
})
```

Note: `rest-collection-update-one` exists in test-env (used by lines.api.spec.ts); confirm its exact route name there and reuse verbatim. **Warning (lines verdict interplay):** setting `_needsIndexing` alone does not touch `_needsHistorizing`, so the lines verdict still runs — that is the point of the last test (index unknown, overall check still definitive).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/integrity/index.api.spec.ts`
Expected: FAIL — `check.index` is undefined (engine not wired).

- [ ] **Step 3: Implement the engine (REST + shared parts)**

Replace `api/src/integrity/index-check.ts` with:

```ts
// api/src/integrity/index-check.ts
// Index-consistency verdict (A1): compare what users read through the ES ALIAS (never a physical
// index — a diverted alias is an in-scope attack) against the verified source of truth.
// One uniform mechanism for both dataset families: count check + seeded-random sampled _i
// windows; only the source adapter differs. Exhaustive compare rides ?deep=true (deep mode).
import crypto from 'node:crypto'
import config from '#config'
import mongo from '#mongo'
import es from '#es'
import type { DatasetInternal, Dataset } from '#types'
import { isRestDataset } from '#types/dataset/index.ts'
import { aliasName } from '../datasets/es/commons.ts'
import * as restUtils from '../datasets/utils/rest.ts'
import { prepareCalculations } from '../datasets/utils/extensions.ts'
import { stripTransientLineFlags } from '../datasets/utils/line-flags.ts'
import * as iops from './index-operations.ts'

export type IndexCheckResult = {
  status: 'ok' | 'diverged' | 'unknown'
  checked?: number
  diverged?: number
  sample?: iops.DivergedEntry[]
  count?: { expected: number, actual: number }
}

// cap accumulated evidence entries in memory (deep mode can diverge massively); the count keeps
// counting past the cap, only the retained entries stop growing
const EVIDENCE_CAP = 1000

const indexConfig = () => ({
  windows: config.integrity?.index?.windows ?? 8,
  windowSize: config.integrity?.index?.windowSize ?? 128,
  sampleCap: config.integrity?.index?.sampleCap ?? 5
})

// mirror of the indexer's REST projection (index-stream cleanItem + _id extraction + calculations)
const projectRestLine = async (line: Record<string, any>, applyCalculations: (item: any) => Promise<string | null>): Promise<iops.WindowDoc> => {
  const doc: Record<string, any> = { ...line }
  doc._i = doc._i || (doc._updatedAt as Date)?.getTime()
  stripTransientLineFlags(doc)
  delete doc._hash
  delete doc._deleted
  const join = String(doc._id)
  delete doc._id
  await applyCalculations(doc)
  return { join, i: doc._i, doc: iops.normalizeProjectedDoc(doc) }
}

const esWindow = async (alias: string, pivot: number, size: number, joinByI: boolean): Promise<{ docs: iops.WindowDoc[], exhausted: boolean }> => {
  const res: any = await es.client.search({
    index: alias,
    body: { query: { range: { _i: { gte: pivot } } }, sort: [{ _i: 'asc' }], size }
  })
  const hits: any[] = res.hits.hits
  return {
    docs: hits.map((h) => ({
      join: joinByI ? String(h._source._i) : String(h._id),
      i: h._source._i,
      doc: iops.normalizeProjectedDoc(h._source)
    })),
    exhausted: hits.length < size
  }
}

const restWindows = async (dataset: DatasetInternal, pivots: number[], windowSize: number): Promise<{ windows: iops.WindowDoc[][], exhausted: boolean[] }> => {
  const applyCalculations = prepareCalculations(dataset as unknown as Dataset)
  const c = restUtils.collection(dataset as any)
  const windows: iops.WindowDoc[][] = []
  const exhausted: boolean[] = []
  for (const pivot of pivots) {
    const lines = await c.find({ _deleted: { $ne: true }, _i: { $gte: pivot } }).sort({ _i: 1 }).limit(windowSize).toArray()
    const docs: iops.WindowDoc[] = []
    for (const line of lines) docs.push(await projectRestLine(line, applyCalculations))
    windows.push(docs)
    exhausted.push(lines.length < windowSize)
  }
  return { windows, exhausted }
}

// pending projection states: the index legitimately lags the source — verdict must not lie
const pendingState = async (dataset: DatasetInternal): Promise<boolean> => {
  if (dataset._partialRestStatus) return true
  if (isRestDataset(dataset as any)) {
    const pending = await restUtils.collection(dataset as any).findOne({ _needsIndexing: true }, { projection: { _id: 1 } })
    if (pending) return true
    // _partialRestStatus may have been set by a write racing this check — re-read the hint doc
    const fresh = await mongo.datasets.findOne({ id: dataset.id }, { projection: { _partialRestStatus: 1 } })
    return !!fresh?._partialRestStatus
  }
  return dataset.status !== 'finalized'
}

export const checkIndexConsistency = async (dataset: DatasetInternal, opts?: { deep?: boolean, seed?: string }): Promise<IndexCheckResult> => {
  const cfg = indexConfig()
  const isRest = isRestDataset(dataset as any)
  if (await pendingState(dataset)) return { status: 'unknown' }
  const alias = aliasName(dataset)
  let actualCount: number
  try {
    actualCount = (await es.client.count({ index: alias })).count
  } catch (err: any) {
    // missing alias/index while a (re)index is in flight: pending, not a breach
    if (err?.meta?.statusCode === 404 || err?.statusCode === 404) return { status: 'unknown' }
    throw err
  }
  const expectedCount = isRest
    ? await restUtils.count(dataset as any, { _deleted: { $ne: true } })
    : (dataset.count ?? 0)
  const count = { expected: expectedCount, actual: actualCount }

  let checked = 0
  let divergedCount = 0
  const evidence: iops.DivergedEntry[] = []
  const record = (entries: iops.DivergedEntry[]) => {
    divergedCount += entries.length
    for (const e of entries) if (evidence.length < EVIDENCE_CAP) evidence.push(e)
  }

  if (expectedCount > 0) {
    // Task 6 replaces this branch condition with the deep lockstep compare
    const seed = opts?.seed ?? crypto.randomUUID()
    let minI: number | undefined, maxI: number | undefined
    if (isRest) {
      const c = restUtils.collection(dataset as any)
      const first = await c.find({ _deleted: { $ne: true } }).sort({ _i: 1 }).limit(1).toArray()
      const last = await c.find({ _deleted: { $ne: true } }).sort({ _i: -1 }).limit(1).toArray()
      if (first.length && last.length) { minI = first[0]._i; maxI = last[0]._i }
    } else {
      // file _i is a dense 1-based row counter; dataset.count (metadata-denylisted, hint-grade —
      // not hash-covered) only bounds the pivot range; the windows read below re-derive rows
      // from the file, whose bytes are what the file hash actually covers
      minI = 1
      maxI = dataset.count ?? 1
    }
    if (minI !== undefined && maxI !== undefined) {
      const pivots = iops.samplePivots(seed, cfg.windows, minI, maxI)
      const source = isRest
        ? await restWindows(dataset, pivots, cfg.windowSize)
        : await fileWindows(dataset, pivots, cfg.windowSize) // Task 5
      for (let w = 0; w < pivots.length; w++) {
        const esw = await esWindow(alias, pivots[w], cfg.windowSize, !isRest)
        const cmp = iops.compareWindowDocs(source.windows[w], esw.docs, { sourceExhausted: source.exhausted[w], esExhausted: esw.exhausted })
        checked += cmp.checked
        record(cmp.diverged)
      }
    }
  }

  // dedupe entries surfaced by overlapping windows
  const seen = new Set<string>()
  const sample = evidence.filter((d) => {
    const k = `${d.kind}:${d.key}`
    if (seen.has(k)) { divergedCount--; return false }
    seen.add(k)
    return true
  })

  const divergent = divergedCount > 0 || count.expected !== count.actual
  if (divergent && await pendingState(dataset)) {
    // a legitimate write landed while we compared (line writes don't hold the worker lock):
    // its projection legitimately lags — report unknown, never a false breach
    return { status: 'unknown' }
  }
  return {
    status: divergent ? 'diverged' : 'ok',
    checked,
    diverged: divergedCount,
    sample: sample.slice(0, cfg.sampleCap),
    count
  }
}
```

For Task 4, stub the file adapter so the module compiles (Task 5 implements it):

```ts
const fileWindows = async (dataset: DatasetInternal, pivots: number[], windowSize: number): Promise<{ windows: iops.WindowDoc[][], exhausted: boolean[] }> => {
  // implemented in Task 5 (file source adapter); returning empty exhausted windows means a file
  // dataset's sampled pass compares nothing yet — the count check still runs
  return { windows: pivots.map(() => []), exhausted: pivots.map(() => true) }
}
```

**Careful — dedupe bug to avoid:** the `divergedCount--` in the sample filter above only corrects entries that made it into `evidence`; if `divergedCount` exceeded `EVIDENCE_CAP`, duplicates past the cap are not corrected. Acceptable (count is an upper bound in pathological overlap), but add this comment inline.

- [ ] **Step 4: Wire the checker**

In `api/src/integrity/checker.ts`:

1. Import: `import { checkIndexConsistency, type IndexCheckResult } from './index-check.ts'` (replacing the type-only import from Task 2).
2. Extend opts: `export const checkDataset = async (dataset: DatasetInternal, opts?: { deep?: boolean, seed?: string }): Promise<Check> => {`
3. After the `linesResult` block (after line 284), before the `if (breach.length)` false-breach net:

```ts
  // verdict 3 (A1): the projection users actually read. ES unavailability degrades to
  // 'unknown' (fail-open on availability — check-stale bounds accumulation), never a crash
  // that would abort the whole check.
  let indexResult: IndexCheckResult
  try {
    indexResult = await checkIndexConsistency(dataset, { deep: opts?.deep, seed: opts?.seed })
  } catch (err) {
    internalError('integrity-index-check', err)
    indexResult = { status: 'unknown' }
  }
  if (indexResult.status === 'diverged') breach.push('index')
```

4. Persist + return: in the `$set` at line 302-309 add `index: indexResult` inside the `integrity.lastCheck` object (alongside `trail`), and add `index: indexResult` to the returned object at line 320.

- [ ] **Step 5: Accept the seed on the _check route**

In `api/src/datasets/routes/integrity.ts` line 80:

```ts
    // body.seed (superadmin-only route) pins the sampled windows for deterministic tests;
    // nightly runs never pass one — the engine draws a fresh crypto-random seed per run
    const seed = typeof req.body?.seed === 'string' ? req.body.seed : undefined
    res.json(await integrityService.withDatasetLock(dataset.id, () => checkDataset(dataset, { deep: req.query.deep === 'true', seed })))
```

- [ ] **Step 6: Run the tests**

Run: `npx playwright test tests/features/integrity/index.api.spec.ts`
Expected: the 5 REST tests PASS. If the clean-verdict test flakes on count, the `es-refresh` call in the helper is missing or the backfill re-index hasn't settled — investigate with `getRawDataset` before touching the engine (systematic-debugging).
Run: `npx playwright test tests/features/integrity/core.api.spec.ts tests/features/integrity/lines.api.spec.ts`
Expected: PASS — existing verdict flows keep working with the new member present.

- [ ] **Step 7: Ratchet, lint, commit**

Run: `bash dev/check-types-ratchet.sh` — no net-new errors.

```bash
git add api/src/integrity/index-check.ts api/src/integrity/checker.ts api/src/datasets/routes/integrity.ts tests/features/integrity/index.api.spec.ts
git commit -m "feat(integrity): index-consistency verdict — engine core, REST adapter, checker wiring (A1)"
```

---

### Task 5: File-dataset source adapter

**Files:**
- Modify: `api/src/integrity/index-check.ts` (replace the `fileWindows` stub)
- Test: `tests/features/integrity/index.api.spec.ts` (append)

**Interfaces:**
- Consumes: `readStreams` (`api/src/datasets/utils/data-streams.ts:257`), `prepareCalculations`.
- Produces: real `fileWindows(dataset, pivots, windowSize)` — one streaming parse serves all windows, early-destroyed once every window is full.

- [ ] **Step 1: Write the failing tests (append to index.api.spec.ts)**

```ts
import { sendDataset } from '../../support/workers.ts'

const enrolledFileDataset = async (ax: any) => {
  const dataset = await sendDataset('datasets/dataset1.csv', ax)
  await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)
  await ax.post(`${apiUrl}/api/v1/test-env/es-refresh/${dataset.id}`)
  return (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
}

test('clean file dataset gets an ok index verdict', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledFileDataset(ax)
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
  expect(check.index?.status).toBe('ok')
  expect(check.index?.count?.expected).toBe(dataset.count)
  expect(check.index?.checked).toBeGreaterThan(0)
})

test('an out-of-band ES edit on a file dataset row is a breach (window aimed by _i)', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledFileDataset(ax)
  // tamper the first row (_i is the join key for file datasets)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _i: 1 } }, script: "ctx._source.id = 'es-tampered'"
  })
  const seed = aimSeedAt(1, 1, dataset.count, WINDOWS) // pivot ≤ 1 ⇒ covers row 1
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(check.breach).toContain('index')
  const edited = check.index!.sample.find((s: any) => s.kind === 'edited')
  expect(edited?.key).toBe('1')
  expect(edited?.actual).toContain('es-tampered')
})
```

**Note:** `datasets/dataset1.csv` columns — check the fixture (`tests/resources/datasets/dataset1.csv`) and use a real column key in the tamper script (the `id` key above is a guess; replace with the fixture's first schema key, visible via `dataset.schema` in a debug run or by reading the CSV header).

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/features/integrity/index.api.spec.ts`
Expected: the two new tests FAIL (`checked` is 0 / no divergence found — the stub compares nothing).

- [ ] **Step 3: Implement fileWindows**

Replace the stub in `index-check.ts`:

```ts
import { Readable, compose } from 'node:stream'
import { readStreams as datasetReadStreams } from '../datasets/utils/data-streams.ts'
```

```ts
// One streaming parse serves every window of the run: rows are projected once and appended to
// each still-hungry window whose pivot they reach; the stream is destroyed as soon as all
// windows are full, so the nightly cost is bounded by one partial file parse, no ES writes.
const fileWindows = async (dataset: DatasetInternal, pivots: number[], windowSize: number): Promise<{ windows: iops.WindowDoc[][], exhausted: boolean[] }> => {
  const applyCalculations = prepareCalculations(dataset as unknown as Dataset)
  // mirror the indexer exactly (index-lines.ts): extended file when extensions are active
  const extended = !!(dataset.extensions && dataset.extensions.some((e: any) => e.active))
  const streams = await datasetReadStreams(dataset as any, false, extended, false)
  const windows: iops.WindowDoc[][] = pivots.map(() => [])
  const composed = compose(...streams) as unknown as Readable
  try {
    for await (const row of composed) {
      const i = row._i
      let projected: iops.WindowDoc | undefined
      let allFull = true
      for (let w = 0; w < pivots.length; w++) {
        if (windows[w].length >= windowSize) continue
        if (i >= pivots[w]) {
          if (!projected) {
            const doc = { ...row }
            await applyCalculations(doc)
            projected = { join: String(i), i, doc: iops.normalizeProjectedDoc(doc) }
          }
          windows[w].push(projected)
        }
        allFull = allFull && windows[w].length >= windowSize
      }
      if (allFull) break
    }
  } finally {
    composed.destroy()
  }
  return { windows, exhausted: windows.map((w) => w.length < windowSize) }
}
```

**Careful:** `compose` from `node:stream` accepts the stream array spread; if the repo's node version complains, fall back to `const { pipeline } = 'node:stream/promises'` into a Writable collector with an abort flag — but try compose first, it is available on node 24.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test tests/features/integrity/index.api.spec.ts`
Expected: all PASS (REST + file).

- [ ] **Step 5: Ratchet, commit**

Run: `bash dev/check-types-ratchet.sh` — no net-new errors.

```bash
git add api/src/integrity/index-check.ts tests/features/integrity/index.api.spec.ts
git commit -m "feat(integrity): file-dataset source adapter for the index verdict (A1)"
```

---

### Task 6: Deep mode + alias-diversion coverage

**Files:**
- Modify: `api/src/integrity/index-check.ts` (deep lockstep compare)
- Modify: `api/src/misc/routers/test-env.ts` (`es-divert-alias` route)
- Test: `tests/features/integrity/index.api.spec.ts` (append)

**Interfaces:**
- Consumes: `compareWindowDocs` (span-cut with both sides marked exhausted per chunk), `projectRestLine`, engine internals.
- Produces: `?deep=true` on `POST /_check` runs the exhaustive compare for both families (same engine, one parameterization).

- [ ] **Step 1: Write the failing tests (append)**

```ts
test('deep=true catches a tamper the sampled windows miss', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, script: "ctx._source.attr1 = 'deep-tampered'"
  })
  const target = await lineI(ax, dataset.id, 'line0')
  const { min, max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  const away = aimSeedAway(target, min, max, WINDOWS)
  // sampled pass with an away seed: the edit is invisible (count unchanged by an edit)
  const sampled = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed: away })).data
  expect(sampled.index?.status).toBe('ok')
  // deep pass: exhaustive lockstep — no seed can hide it
  const deep = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check?deep=true`)).data
  expect(deep.breach).toContain('index')
  expect(deep.index!.sample.find((s: any) => s.kind === 'edited')?.key).toBe('line0')
})

test('a diverted alias pointing at a doctored index copy is a breach', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-divert-alias/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, script: "ctx._source.attr1 = 'diverted'"
  })
  const check = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check?deep=true`)).data
  expect(check.breach).toContain('index')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/features/integrity/index.api.spec.ts -g "deep=true|diverted"`
Expected: FAIL — deep currently runs the sampled path (first test's deep assertion fails) and the divert route 404s.

- [ ] **Step 3: Implement deep mode**

In `index-check.ts`, add the iterators and the lockstep compare, then branch on `opts?.deep` in `checkIndexConsistency` (replacing the sampled block when deep):

```ts
const DEEP_BATCH = 1000

async function * esIterate (alias: string, joinByI: boolean): AsyncGenerator<iops.WindowDoc> {
  let searchAfter: any[] | undefined
  while (true) {
    const res: any = await es.client.search({
      index: alias,
      body: {
        query: { match_all: {} },
        // _doc tiebreak keeps search_after stable when an adversary inserted duplicate _i values
        sort: [{ _i: 'asc' }, { _doc: 'asc' }],
        size: DEEP_BATCH,
        ...(searchAfter ? { search_after: searchAfter } : {})
      }
    })
    const hits: any[] = res.hits.hits
    for (const h of hits) yield { join: joinByI ? String(h._source._i) : String(h._id), i: h._source._i, doc: iops.normalizeProjectedDoc(h._source) }
    if (hits.length < DEEP_BATCH) return
    searchAfter = hits[hits.length - 1].sort
  }
}

async function * restIterate (dataset: DatasetInternal): AsyncGenerator<iops.WindowDoc> {
  const applyCalculations = prepareCalculations(dataset as unknown as Dataset)
  const c = restUtils.collection(dataset as any)
  for await (const line of c.find({ _deleted: { $ne: true } }).sort({ _i: 1 })) {
    yield await projectRestLine(line, applyCalculations)
  }
}

async function * fileIterate (dataset: DatasetInternal): AsyncGenerator<iops.WindowDoc> {
  const applyCalculations = prepareCalculations(dataset as unknown as Dataset)
  const extended = !!(dataset.extensions && dataset.extensions.some((e: any) => e.active))
  const streams = await datasetReadStreams(dataset as any, false, extended, false)
  const composed = compose(...streams) as unknown as Readable
  try {
    for await (const row of composed) {
      const doc = { ...row }
      await applyCalculations(doc)
      yield { join: String(row._i), i: row._i, doc: iops.normalizeProjectedDoc(doc) }
    }
  } finally {
    composed.destroy()
  }
}

// exhaustive compare: pull both _i-ordered sides in batches, cut each round at the smaller
// side's frontier, compare the slice with compareWindowDocs (both marked exhausted: the span
// cut already happened here), and carry the uncompared tail into the next round
const deepCompare = async (source: AsyncGenerator<iops.WindowDoc>, esSide: AsyncGenerator<iops.WindowDoc>, record: (entries: iops.DivergedEntry[]) => void): Promise<number> => {
  let checked = 0
  let sBuf: iops.WindowDoc[] = []
  let eBuf: iops.WindowDoc[] = []
  let sDone = false
  let eDone = false
  const fill = async (gen: AsyncGenerator<iops.WindowDoc>, buf: iops.WindowDoc[], done: boolean): Promise<boolean> => {
    while (buf.length < DEEP_BATCH && !done) {
      const n = await gen.next()
      if (n.done) done = true
      else buf.push(n.value)
    }
    return done
  }
  while (true) {
    sDone = await fill(source, sBuf, sDone)
    eDone = await fill(esSide, eBuf, eDone)
    if (!sBuf.length && !eBuf.length) break
    let spanEnd = Infinity
    if (!sDone && sBuf.length) spanEnd = Math.min(spanEnd, sBuf[sBuf.length - 1].i)
    if (!eDone && eBuf.length) spanEnd = Math.min(spanEnd, eBuf[eBuf.length - 1].i)
    const sSlice = sBuf.filter(d => d.i <= spanEnd)
    const eSlice = eBuf.filter(d => d.i <= spanEnd)
    sBuf = sBuf.filter(d => d.i > spanEnd)
    eBuf = eBuf.filter(d => d.i > spanEnd)
    const cmp = iops.compareWindowDocs(sSlice, eSlice, { sourceExhausted: true, esExhausted: true })
    checked += cmp.checked
    record(cmp.diverged)
  }
  return checked
}
```

In `checkIndexConsistency`, replace `if (expectedCount > 0) {` block's interior with a branch:

```ts
  if (opts?.deep) {
    const source = isRest ? restIterate(dataset) : fileIterate(dataset)
    checked = await deepCompare(source, esIterate(alias, !isRest), record)
  } else if (expectedCount > 0) {
    // ... existing sampled block unchanged ...
  }
```

**Deadlock guard:** if a round's `spanEnd` cut removes nothing from non-empty buffers (possible only if a done-side buffer is entirely above the other frontier), the loop still terminates because the other side keeps refilling toward its own exhaustion; when both are done, `spanEnd` stays `Infinity` and everything drains. Reason through this before committing — add a unit test in `index-operations.unit.spec.ts` only if you end up moving `deepCompare` into the pure module (it is engine-side because of the async generators; keep it there).

- [ ] **Step 4: Add the es-divert-alias test-env route**

```ts
// Divert a dataset's alias to a doctored copy of its index (in-scope attack: the check must
// verify through the alias, never the physical index). The copy uses dynamic mapping — enough
// for the compare, which reads _source. The orphan copy is cleaned by nothing: test-env only.
router.post('/es-divert-alias/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const es = (await import('#es')).default
    const { aliasName } = await import('../../datasets/es/commons.ts')
    const alias = aliasName(dataset)
    const current = Object.keys(await es.client.indices.getAlias({ name: alias }))[0]
    const doctored = `${current}-doctored-${Date.now()}`
    await es.client.reindex({ body: { source: { index: current }, dest: { index: doctored } }, refresh: true, wait_for_completion: true })
    await es.client.updateByQuery({
      index: doctored,
      body: { query: req.body.query, script: { source: req.body.script } },
      refresh: true
    })
    await es.client.indices.updateAliases({ body: { actions: [{ remove: { alias, index: current } }, { add: { alias, index: doctored } }] } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 5: Run the tests**

Run: `npx playwright test tests/features/integrity/index.api.spec.ts`
Expected: all PASS.

- [ ] **Step 6: Ratchet, commit**

```bash
git add api/src/integrity/index-check.ts api/src/misc/routers/test-env.ts tests/features/integrity/index.api.spec.ts
git commit -m "feat(integrity): deep exhaustive index compare and alias-diversion coverage (A1)"
```

---

### Task 7: Panel reindex repair action

**Files:**
- Modify: `api/src/integrity/service.ts` (reindex action + journal evidence)
- Modify: `api/src/datasets/routes/integrity.ts` (route)
- Test: `tests/features/integrity/index.api.spec.ts` (append)

**Interfaces:**
- Consumes: `datasetUtils.reindex(db, dataset)` (`api/src/datasets/utils/index.ts:54` — sets status `stored`/`analyzed`, the standard superadmin reindex), `journals.log`.
- Produces: `POST /:datasetId/_integrity/index/_reindex` (superadmin) → `{ ok: true }`; journal event `type: 'integrity-index-repair'` carrying the evidence.

- [ ] **Step 1: Write the failing test (append)**

```ts
test('index reindex action journals the evidence, repairs, and the next check is ok', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRestDataset(ax)
  await ax.post(`${apiUrl}/api/v1/test-env/es-tamper/${dataset.id}`, {
    query: { term: { _id: 'line0' } }, script: "ctx._source.attr1 = 'repair-me'"
  })
  const target = await lineI(ax, dataset.id, 'line0')
  const { min, max } = await lineIBounds(ax, dataset.id, ['line0', 'line1', 'line2'])
  const seed = aimSeedAt(target, min, max, WINDOWS)
  const breach = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(breach.breach).toContain('index')

  await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/index/_reindex`, { reason: 'test repair' })
  // the evidence survives the repair in the journal
  const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
  const evt = journal.find((e: any) => e.type === 'integrity-index-repair')
  expect(evt).toBeTruthy()
  expect(evt.data).toContain('repair-me')
  expect(evt.data).toContain('test repair')

  await waitForFinalize(ax, dataset.id)
  await ax.post(`${apiUrl}/api/v1/test-env/es-refresh/${dataset.id}`)
  const recheck = (await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`, { seed })).data
  expect(recheck.index?.status).toBe('ok')
  expect(recheck.status).toBe('ok')
})
```

**Note:** the journal endpoint path — verify against an existing test using the journal (`grep -rn "journal" tests/features/ | head`) and adjust (`/api/v1/datasets/{id}/journal` is the expected shape).

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/features/integrity/index.api.spec.ts -g "reindex action"`
Expected: FAIL 404 on the new route.

- [ ] **Step 3: Implement the service action**

In `api/src/integrity/service.ts` (add near `restoreLines`, import `* as journals from '../misc/utils/journals.ts'` and `reindex as reindexDataset` — check the exact export: `import * as datasetUtils from '../datasets/utils/index.ts'` may already be imported; reuse it):

```ts
// Repair for an 'index' breach: rebuild the projection from the verified source through the
// standard reindex path. The divergence evidence lives in integrity.lastCheck.index, which the
// post-reindex check will overwrite — journal it FIRST so what was served remains auditable
// after the repair destroys the live divergence (design: no silent auto-repair).
export const reindexForIntegrity = async (dataset: DatasetInternal, reason?: string): Promise<{ ok: true }> =>
  await withDatasetLock(dataset.id, () => reindexForIntegrityUnlocked(dataset, reason))

const reindexForIntegrityUnlocked = async (dataset: DatasetInternal, reason?: string): Promise<{ ok: true }> => {
  if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
  const lastIndex = (dataset.integrity as any)?.lastCheck?.index
  await journals.log('datasets', dataset as any, {
    type: 'integrity-index-repair',
    data: JSON.stringify({
      reason,
      count: lastIndex?.count,
      diverged: lastIndex?.diverged,
      sample: lastIndex?.sample
    })
  } as any)
  await datasetUtils.reindex(mongo.db, dataset as any)
  return { ok: true }
}
```

- [ ] **Step 4: Add the route**

In `api/src/datasets/routes/integrity.ts`, after the `lines/_restore` route:

```ts
  router.post('/:datasetId/_integrity/index/_reindex', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    res.json(await integrityService.reindexForIntegrity(reqDataset(req), reqReason(req)))
  })
```

- [ ] **Step 5: Run the tests**

Run: `npx playwright test tests/features/integrity/index.api.spec.ts`
Expected: all PASS.

- [ ] **Step 6: Ratchet, commit**

```bash
git add api/src/integrity/service.ts api/src/datasets/routes/integrity.ts tests/features/integrity/index.api.spec.ts
git commit -m "feat(integrity): panel reindex repair — evidence journaled before the projection rebuild (A1)"
```

---

### Task 8: UI — index section in the integrity panel

**Files:**
- Modify: `ui/src/components/dataset/dataset-integrity.vue` (template after the lines section ~line 170; script; `<i18n>` block at ~line 594, fr keys near line 653, en near line 736)

**Interfaces:**
- Consumes: `state.lastCheck.index` (flows through the existing `GET /_integrity` → `getIntegrityState`, which returns the whole `integrity` object — no API change needed), `POST /_integrity/index/_reindex`.

- [ ] **Step 1: Add the template section**

After the lines `</template>` (~line 170), mirroring the lines-diverged alert pattern:

```vue
      <template v-if="state.active && state.lastCheck?.index">
        <v-divider class="my-4" />
        <div class="text-body-2">
          {{ t('indexVerdictTitle') }} :
          <v-chip
            size="small"
            label
            :color="state.lastCheck.index.status === 'ok' ? 'success' : (state.lastCheck.index.status === 'diverged' ? 'error' : 'warning')"
          >
            {{ t('indexStatus.' + state.lastCheck.index.status) }}
          </v-chip>
        </div>
        <v-alert
          v-if="state.lastCheck.index.status === 'diverged'"
          type="error"
          variant="outlined"
          density="compact"
          class="mt-2"
          :title="t('indexDivergedTitle', { diverged: state.lastCheck.index.diverged ?? 0 })"
        >
          <div
            v-if="state.lastCheck.index.count && state.lastCheck.index.count.expected !== state.lastCheck.index.count.actual"
            class="text-caption"
          >
            {{ t('indexCountMismatch', { expected: state.lastCheck.index.count.expected, actual: state.lastCheck.index.count.actual }) }}
          </div>
          <div
            v-for="entry of state.lastCheck.index.sample ?? []"
            :key="entry.kind + entry.key"
            class="mt-2"
          >
            <v-chip
              size="small"
              label
            >
              {{ t('indexKind.' + entry.kind) }} — {{ entry.key }}
            </v-chip>
            <pre
              v-if="entry.expected || entry.actual"
              class="text-caption mt-1"
              style="white-space: pre-wrap; overflow-x: auto;"
            >{{ entry.expected ? t('indexExpected') + ' ' + entry.expected + '\n' : '' }}{{ entry.actual ? t('indexActual') + ' ' + entry.actual : '' }}</pre>
          </div>
          <div
            v-if="adminMode"
            class="mt-2"
          >
            <v-btn
              :prepend-icon="mdiDatabaseRefresh"
              color="warning"
              variant="text"
              size="small"
              @click="indexReindexDialog = true"
            >
              {{ t('indexReindex') }}
            </v-btn>
          </div>
        </v-alert>
      </template>
```

- [ ] **Step 2: Add the reindex confirmation dialog**

Copy the structure of the existing lines-restore dialog (`linesRestoreDialog`, ~line 340+) — title `t('indexReindexTitle')`, explanatory text `t('indexReindexText')`, a reason `v-text-field`, confirm button calling the action. Script additions (match the component's existing composition-API style and its `useAsyncAction`-based actions — copy the lines-restore action's shape):

```ts
const indexReindexDialog = ref(false)
const indexReindexReason = ref('')
const indexReindex = useAsyncAction(async () => {
  await axios.post(`/api/v1/datasets/${props.dataset?.id}/_integrity/index/_reindex`, { reason: indexReindexReason.value || undefined })
  indexReindexDialog.value = false
  await fetchState.refresh()
})
```

**Adapt names** (`axios` wrapper, `fetchState.refresh()`) to what the component actually uses for the lines restore action — copy that action verbatim and change the URL/refs. Import `mdiDatabaseRefresh` alongside the existing mdi imports.

- [ ] **Step 3: Add the i18n keys (both fr and en blocks)**

fr:

```yaml
  indexVerdictTitle: Index de recherche (données servies)
  indexStatus:
    ok: cohérent
    diverged: divergent
    unknown: en attente
  indexDivergedTitle: "{diverged} divergence(s) entre l'index servi et la source vérifiée"
  indexCountMismatch: "nombre de lignes : {expected} attendues, {actual} servies"
  indexKind:
    edited: modifiée
    missing: absente de l'index
    surplus: excédentaire dans l'index
  indexExpected: "attendu :"
  indexActual: "servi :"
  indexReindex: Réindexer depuis la source vérifiée
  indexReindexTitle: Réindexer le jeu de données
  indexReindexText: Les preuves de divergence sont consignées dans le journal, puis l'index est reconstruit depuis la source vérifiée. La prochaine vérification confirmera la cohérence.
```

en:

```yaml
  indexVerdictTitle: Search index (served data)
  indexStatus:
    ok: consistent
    diverged: diverged
    unknown: pending
  indexDivergedTitle: "{diverged} divergence(s) between the served index and the verified source"
  indexCountMismatch: "line count: {expected} expected, {actual} served"
  indexKind:
    edited: edited
    missing: missing from the index
    surplus: surplus in the index
  indexExpected: "expected:"
  indexActual: "served:"
  indexReindex: Reindex from the verified source
  indexReindexTitle: Reindex the dataset
  indexReindexText: The divergence evidence is recorded in the journal, then the index is rebuilt from the verified source. The next check will confirm consistency.
```

- [ ] **Step 4: Verify**

Run: `npm run lint`
Expected: clean (the SFC i18n YAML is lint-checked; quote strings containing `:` as above — see memory: unquoted i18n colons broke YAML parsing before).
Manual check: if the dev stack is up (`bash dev/status.sh`), view a dataset's integrity panel; otherwise rely on lint + the API tests (the panel renders from `state.lastCheck.index` which Task 4 persists).

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/dataset-integrity.vue
git commit -m "feat(integrity): index verdict section and reindex action in the admin panel (A1)"
```

---

### Task 9: Documentation — deliver the guarantee honestly

**Files:**
- Modify: `docs/architecture/integrity.md` (new index-verdict section; update the "ES is not covered" statements at ~lines 536, 594-597; §10/§14 delivery state)
- Modify: `docs/presentation-integrite-fr/04-perimetre.md` (remove the honesty limit at lines ~29-31; state the new coverage)
- Modify: `docs/presentation-integrite-fr/02-garanties.md` (served-data row in the adversary table)
- Modify: `api/src/integrity/README.md` (invariants)

- [ ] **Step 1: Architecture doc**

Locate the existing statements (`grep -n "rebuildable projection" docs/architecture/integrity.md`). Update:
- The coverage table row `Editable dataset — **ES index** (derived)` (~line 536): detection column becomes "✅ **delivered (A1)** — count + seeded sampled windows nightly, exhaustive on `?deep=true`, through the alias"; repair column: "reindex from the verified source (panel action, evidence journaled first)".
- The §-level "ES is not a historization target" passage (~594-597): keep the historization argument, add that *consistency* is now verified — the check chain is locked store → source verdicts → index verdict → served data.
- Add a subsection (near the lines-verdict section) describing: uniform mechanism, seed never persisted before use, alias-only access, pending→unknown posture, evidence-before-repair, config keys. Keep it short — the design doc (`docs/plans/2026-07-22-integrity-index-consistency-design.md`) holds the full rationale; link it.

- [ ] **Step 2: Presentation fr**

- `04-perimetre.md` lines ~29-31: remove the explicit-limit bullet about the index not being covered; in its place (or in the §13 wording) state: « l'index de recherche par lequel les données sont servies est désormais vérifié : comptage systématique et fenêtres d'échantillonnage aléatoires chaque nuit, comparaison exhaustive à la demande, toujours via l'alias effectivement lu ».
- `02-garanties.md`: locate the adversary/guarantee table and add or amend the row about "données servies" — a direct write into l'index de recherche is now detected (nightly probabilistic + count, exhaustive on demand) and repaired by reindexation.

- [ ] **Step 3: README invariants**

Append to `api/src/integrity/README.md`:

```markdown
## Index verdict (A1) invariants

- Every ES access in the index check goes through the dataset ALIAS (`aliasName`), never a
  physical index name: a diverted alias is an in-scope attack and must be caught, not bypassed.
- The sampling seed is drawn crypto-random per run and NEVER persisted before use; an explicit
  seed is accepted only from the superadmin `_check` route (test determinism).
- Divergence evidence (capped expected/actual excerpts) is persisted in the verdict at
  detection time, and journaled by the reindex action BEFORE the reindex runs: the repair
  destroys the live divergence, the journal entry survives.
- Pending projection states (`_needsIndexing`, `_partialRestStatus`, non-finalized, missing
  alias) downgrade the index verdict to `unknown` — never a false breach; re-checked after a
  divergence is found (line writes do not hold the worker lock).
- `_rand` is the only excluded compare key (index-time Math.random). `_file*` cannot occur:
  enrollment refuses attachment datasets.
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/integrity.md docs/presentation-integrite-fr/04-perimetre.md docs/presentation-integrite-fr/02-garanties.md api/src/integrity/README.md
git commit -m "docs(integrity): index verdict delivered — remove the ES honesty limits, record invariants (A1)"
```

---

### Task 10: Full gate

- [ ] **Step 1: Full integrity suite**

Run: `npx playwright test tests/features/integrity/`
Expected: ALL PASS (was 137 green before this branch; now more).

- [ ] **Step 2: Lint + types**

Run: `npm run lint` — clean.
Run: `bash dev/check-types-ratchet.sh` — no net-new errors.

- [ ] **Step 3: Adjacent surfaces**

Run: `npx playwright test tests/features/datasets/rest.api.spec.ts` (or the closest REST-dataset spec — `ls tests/features/datasets/ | head` to pick the rest + file dataset core specs)
Expected: PASS — the checker/schema changes must not disturb dataset flows.

- [ ] **Step 4: Report**

Do NOT push (pre-push runs the very long full suite; the user pushes). Summarize: verdict shape, test counts, config defaults, and the doc updates for the user's review.

---

## Self-review notes (already applied)

- Spec §3.1 count sources ↔ Task 4 engine (`restUtils.count` / `dataset.count`): consistent.
- Spec §3.2 pivots-not-ranges for sparse REST `_i` ↔ `samplePivots` + "next K rows from pivot": consistent.
- Spec §3.4 pending→unknown ↔ `pendingState` + post-divergence recheck: consistent; the whole-check `unknown` early-returns (relay pending) already short-circuit before the engine runs.
- Spec §5 evidence-before-repair ↔ Task 7 journals before `datasetUtils.reindex`: consistent.
- Spec §7 test list ↔ Tasks 4-7 tests: alias diversion (T6), out-of-window delete caught by count (T4), deep catches missed edit (T6), pending unknown (T4), file family (T5), repair convergence (T7), pure unit tests (T1). All covered.
- `'index'` breach member flows through `maybeAlert('integrity-breach', …)` untouched — no new alert machinery (spec §4), verified against checker.ts:311.
