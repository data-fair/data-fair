# Integrity lines at 1M scale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the REST lines integrity gate from 100k toward 1M live lines with the exact same guarantee, by replacing the in-memory whole-dataset anchor map with a streamed compare, and by putting synchronous admin actions under a time budget.

**Architecture:** The S3 versions walk emits one "latest anchor" per lineId as soon as its contiguous key group ends; anchors are batch-looked-up in Mongo (`$in`) and classified with the unchanged `classifyLine`; out-of-band inserts are detected by count (live lines vs. lookups that found a line) and named by a fingerprint array only when the count disagrees. Trail anomalies are ack-filtered as they are produced, then capped. Renewal does its own streamed walk and renews per key only when that key's versions are clean. Admin actions answer `202 {status:'running'}` past a budget and finish in-process.

**Tech Stack:** TypeScript (Node, `--experimental-strip-types`), MongoDB driver, AWS SDK v3 S3 (via `IntegrityStore`), Playwright test runner for unit/api tests, Vue 3 + Vuetify for the panel.

**Spec:** [`docs/plans/2026-10-15-integrity-lines-scale-design.md`](2026-10-15-integrity-lines-scale-design.md) — read it first; this plan argues from it.

## Global Constraints

- Same guarantee: the existing integrity suites (`tests/features/integrity/*.api.spec.ts`) must pass **unchanged** — never edit an existing assertion to make it pass.
- No change to the S3 key layout, the relay (`lines-relay.ts`), or the outbox stamps.
- Pure logic goes in `api/src/integrity/operations.ts` / `lines-operations.ts` with IO injected, and is unit-tested there (no Mongo/S3 in unit tests).
- Type ratchet: pushes run `dev/check-types-ratchet.sh` — **no net-new tsc errors** (`npm run check-types` to inspect).
- Never start/stop/restart dev processes (zellij-managed). If the API flaps, wait for 3 consecutive 200s on ping before trusting a failure (`bash dev/status.sh`).
- Config additions go in `api/config/default.cjs`, `api/config/custom-environment-variables.cjs`, `api/config/type/schema.json`, then `npm run build-types`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.
- `integrity.running` is display-only: nothing may gate on it. Admin work is never triggered from a Mongo flag.
- vue-i18n `<i18n>` YAML: never an unquoted ` : ` inside a value (blanks the whole dev SPA).

## Review Focus

1. **A lineId emitted in two groups** (a forged non-canonically-encoded key like `lines/%61/…` decoding to an existing `a`) must not inflate `matched` and hide an out-of-band insert — pinned in Task 3 (`duplicate group cannot hide an insert`).
2. **Acked anomalies exceeding the cap** must not push out an unacked one (false `ok` trail) — pinned in Task 1 (`collector filters acks before capping`).
3. **A key's versions straddling a LIST page boundary**, and a line group straddling pages, must classify as if unpaged — pinned in Tasks 2 and 3 (`straddling` fixtures, `batchSize` 1/2/1000).
4. **Repair applied while the compare is still streaming** (bless/restore writes new anchors for already-emitted lineIds) must not be re-listed or double-processed — covered by the existing `lines/_restore` and `_fix` API tests passing unchanged (Task 5), and argued in Task 5's notes.
5. **A pod dying mid-action** leaves `integrity.running` set: the panel must not poll forever — pinned in Task 6 (`running without a held lock is dropped`).

---

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `api/src/integrity/operations.ts` | trail fold: per-key `clean`, anomaly sink, `newAnomalyCollector` | 1 |
| `api/src/integrity/lines-operations.ts` | line group fold; streamed comparer + fingerprints (IO injected) | 2, 3 |
| `api/src/integrity/checker.ts` | `checkDataset` streaming wiring; `compareDatasetLines` new signature; streamed `maybeRenewLines` | 4 |
| `api/src/integrity/service.ts` | `_fix` / `restoreLines` batch repair; `withAdminBudget`; `getIntegrityState` running cleanup | 5, 6 |
| `api/src/datasets/routes/integrity.ts` | 202 on `running` | 6 |
| `api/types/dataset/schema.js` | `integrity.running` | 6 |
| `api/config/*` | `integrity.adminSyncBudgetMs` | 6 |
| `ui/src/components/dataset/dataset-integrity.vue` | running state + polling | 7 |
| `tests/features/integrity/*.unit.spec.ts` | pure tests | 1, 2, 3 |
| `tests/features/integrity/admin-budget.api.spec.ts` | 202 path | 6 |
| `tests/features/integrity/lines-scale.api.spec.ts` | opt-in measurement | 8 |
| `docs/architecture/integrity.md`, `api/src/integrity/README.md` | docs + invariants | 8 |

Commands:
- unit: `npx playwright test --project unit tests/features/integrity/<file>.unit.spec.ts`
- api: `npx playwright test --project api tests/features/integrity/<file>.api.spec.ts`

---

### Task 1: Trail fold — per-key `clean`, anomaly sink, ack-aware capped collector

**Files:**
- Modify: `api/src/integrity/operations.ts:217-305`
- Test: `tests/features/integrity/operations.unit.spec.ts` (around line 350-425)

**Interfaces:**
- Produces:
  - `CurrentViewEntry = { key: string, versionId?: string, lastModified?: Date, clean: boolean }` — `clean` is false when the key has a delete marker or diverging versions.
  - `newTrailFold(onAnomaly?: (anomaly: TrailAnomaly) => void): TrailFoldAcc` — with a sink, anomalies go to it instead of `acc.anomalies`.
  - `newAnomalyCollector(ackedFingerprints: string[], cap: number): AnomalyCollector` where `AnomalyCollector = { push: (anomaly: TrailAnomaly) => void, kept: TrailAnomaly[], total: () => number }`.
  - `filterAckedAnomalies` is **removed** (only the checker used it; Task 4 switches to the collector).

- [ ] **Step 1: Write the failing tests** — append to `tests/features/integrity/operations.unit.spec.ts` (reuses the file's existing `v()` and `foldAll()` helpers):

```ts
test('trail fold: current view entries carry a per-key clean flag', () => {
  const { current } = foldAll([
    v('p/000000000', 'v1'),
    v('p/000000001', 'shadow', { etag: 'bbb' }), v('p/000000001', 'original'),
    v('p/000000002', 'v3'), { key: 'p/000000002', versionId: 'm1', deleteMarker: true },
    v('p/000000003', 'newer'), v('p/000000003', 'older') // byte-identical retry: clean
  ])
  expect(current.get('p/000000000')!.clean).toBe(true)
  expect(current.get('p/000000001')!.clean).toBe(false)
  expect(current.get('p/000000002')!.clean).toBe(false)
  expect(current.get('p/000000003')!.clean).toBe(true)
})

test('trail fold: an anomaly sink receives anomalies instead of the accumulator', () => {
  const seen: ops.TrailAnomaly[] = []
  const acc = ops.newTrailFold((a) => seen.push(a))
  ops.foldTrailVersions(acc, [v('p/000000000', 'v1'), { key: 'p/000000000', versionId: 'm1', deleteMarker: true }])
  const { anomalies } = ops.finishTrailFold(acc)
  expect(anomalies).toEqual([])
  expect(seen).toHaveLength(1)
  expect(seen[0].kind).toBe('delete-marker')
})

test('collector filters acks before capping: acked anomalies cannot crowd out an unacked one', () => {
  const acked = Array.from({ length: 60 }, (_, n) => ({ kind: 'delete-marker' as const, key: `p/${n}`, confidence: 'confirmed' as const, versionIds: [`m${n}`] }))
  const fresh = { kind: 'version-divergence' as const, key: 'p/zzz', confidence: 'confirmed' as const, versionIds: ['a', 'b'] }
  const collector = ops.newAnomalyCollector(acked.map(ops.anomalyFingerprint), 50)
  for (const a of acked) collector.push(a)
  collector.push(fresh)
  expect(collector.total()).toBe(1)
  expect(collector.kept).toEqual([fresh])
})

test('collector caps kept anomalies but keeps counting', () => {
  const collector = ops.newAnomalyCollector([], 2)
  for (let n = 0; n < 5; n++) collector.push({ kind: 'delete-marker', key: `p/${n}`, confidence: 'confirmed', versionIds: [`m${n}`] })
  expect(collector.kept).toHaveLength(2)
  expect(collector.total()).toBe(5)
})

test('collector: a re-shadowed acked key resurfaces (fingerprint pins the version set)', () => {
  const shadow = { kind: 'version-divergence' as const, key: 'p/1', confidence: 'confirmed' as const, versionIds: ['a', 'b'] }
  const collector = ops.newAnomalyCollector([ops.anomalyFingerprint(shadow)], 50)
  collector.push(shadow)
  collector.push({ ...shadow, versionIds: ['a', 'b', 'c'] })
  expect(collector.total()).toBe(1)
})
```

Also replace the existing test that calls `ops.filterAckedAnomalies` (around line 418-426) by deleting it: its two assertions are now covered by the last test above.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test --project unit tests/features/integrity/operations.unit.spec.ts`
Expected: FAIL — `clean` is undefined, `newAnomalyCollector` is not a function.

- [ ] **Step 3: Implement** in `api/src/integrity/operations.ts`:

```ts
export type CurrentViewEntry = { key: string, versionId?: string, lastModified?: Date, clean: boolean }

export type TrailFoldAcc = {
  current: Map<string, CurrentViewEntry>
  anomalies: TrailAnomaly[]
  // when set, anomalies stream to this sink instead of accumulating (bounded memory, see
  // newAnomalyCollector)
  onAnomaly?: (anomaly: TrailAnomaly) => void
  pendingKey?: string
  pendingEntries: TrailVersionEntry[]
}

export const newTrailFold = (onAnomaly?: (anomaly: TrailAnomaly) => void): TrailFoldAcc =>
  ({ current: new Map(), anomalies: [], pendingEntries: [], onAnomaly })

const pushAnomaly = (acc: TrailFoldAcc, anomaly: TrailAnomaly): void => {
  if (acc.onAnomaly) acc.onAnomaly(anomaly)
  else acc.anomalies.push(anomaly)
}
```

In `flushTrailKey`, replace the two `acc.anomalies.push(...)` calls with `pushAnomaly(acc, ...)` and compute cleanliness:

```ts
const flushTrailKey = (acc: TrailFoldAcc): void => {
  if (!acc.pendingKey || !acc.pendingEntries.length) return
  const key = acc.pendingKey
  const markers = acc.pendingEntries.filter((e) => e.deleteMarker)
  const versions = acc.pendingEntries.filter((e) => !e.deleteMarker)
  let clean = true
  if (markers.length) {
    // no code path of ours issues a versionless DELETE: a marker is attacker-made by definition
    pushAnomaly(acc, { kind: 'delete-marker', key, confidence: 'confirmed', versionIds: markers.map((m) => m.versionId ?? '') })
    clean = false
  }
  if (versions.length) {
    if (versions.length > 1) {
      // legitimate multiplicity (crash-retry re-PUTs) is byte-identical: same size, same
      // md5-based ETag (single PUT, or multipart with fixed deterministic chunking). Anything
      // else is a same-key rewrite — the shadowing attack.
      const shapes = new Set(versions.map((e) => `${e.size ?? ''}|${e.etag ?? ''}`))
      if (shapes.size > 1) {
        pushAnomaly(acc, { kind: 'version-divergence', key, confidence: 'confirmed', versionIds: versions.map((e) => e.versionId ?? '') })
        clean = false
      }
    }
    // versions arrive newest-first within a key (S3 order, preserved by the store's stable page
    // sort): the first one is the current view — resurfaced even when a marker hides it. `clean`
    // lets per-key consumers (lines renewal) refuse to act on a tampered key without holding the
    // anomaly list.
    acc.current.set(key, { key, versionId: versions[0].versionId, lastModified: versions[0].lastModified, clean })
  }
  acc.pendingEntries = []
}
```

Replace `filterAckedAnomalies` with:

```ts
// Ack filtering happens AS anomalies are produced, BEFORE the cap: capping first would let acked
// anomalies fill the cap and push an unacked one out — a false 'ok' trail verdict. `total`
// counts every unacked anomaly, `kept` holds at most `cap` of them (what gets persisted).
export type AnomalyCollector = { push: (anomaly: TrailAnomaly) => void, kept: TrailAnomaly[], total: () => number }

export const newAnomalyCollector = (ackedFingerprints: string[], cap: number): AnomalyCollector => {
  const acked = new Set(ackedFingerprints)
  const kept: TrailAnomaly[] = []
  let total = 0
  return {
    kept,
    total: () => total,
    push: (anomaly) => {
      if (acked.has(anomalyFingerprint(anomaly))) return
      total++
      if (kept.length < cap) kept.push(anomaly)
    }
  }
}
```

`checker.ts` still calls `ops.filterAckedAnomalies` until Task 4 — to keep this task compiling, keep a one-line temporary export at the end of the collector block and delete it in Task 4:

```ts
// removed in Task 4 (checker switches to newAnomalyCollector)
export const filterAckedAnomalies = (anomalies: TrailAnomaly[], ackedFingerprints: string[]): TrailAnomaly[] => {
  const c = newAnomalyCollector(ackedFingerprints, Infinity)
  for (const a of anomalies) c.push(a)
  return c.kept
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test --project unit tests/features/integrity/operations.unit.spec.ts`
Expected: PASS (all, including the pre-existing trail fold tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/operations.ts tests/features/integrity/operations.unit.spec.ts
git commit -m "feat(integrity): per-key clean flag and ack-before-cap anomaly collector

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Line group fold — emit one latest anchor per lineId as its key group ends

**Files:**
- Modify: `api/src/integrity/lines-operations.ts` (after `latestLineAnchors`, ~line 111)
- Test: `tests/features/integrity/lines-operations.unit.spec.ts`

**Interfaces:**
- Consumes: `CurrentViewEntry.clean` (Task 1) — optional here: entries without `clean` count as clean (plain `ListObjectsV2` pages).
- Produces:
  - `LineAnchorGroup = LatestLineAnchor & { lineId: string, clean: boolean }`
  - `LineGroupFold = { open?: LineAnchorGroup }`, `newLineGroupFold(): LineGroupFold`
  - `pushLineGroupKeys(acc: LineGroupFold, entries: Array<{ key: string, clean?: boolean }>): LineAnchorGroup[]` — returns the groups completed by these entries.
  - `finishLineGroupFold(acc: LineGroupFold): LineAnchorGroup[]`

- [ ] **Step 1: Write the failing tests** — append to `tests/features/integrity/lines-operations.unit.spec.ts`:

```ts
const k = (lineId: string, i: number, sha = 'aa') => lops.lineRevisionKey(owner, 'ds1', lineId, i, sha)
const foldGroups = (pages: Array<Array<{ key: string, clean?: boolean }>>) => {
  const acc = lops.newLineGroupFold()
  const out: lops.LineAnchorGroup[] = []
  for (const page of pages) out.push(...lops.pushLineGroupKeys(acc, page))
  out.push(...lops.finishLineGroupFold(acc))
  return out
}

test('line group fold emits one latest anchor per line, equal to latestLineAnchors', () => {
  const keys = [k('a', 1), k('a', 5, 'bb'), k('a', 5, 'bb') + '.who', k('b', 2, lops.DELETED_MARKER), k('c', 3)].sort()
  const groups = foldGroups([keys.map((key) => ({ key }))])
  const reference = lops.latestLineAnchors(keys)
  expect(groups.map((g) => g.lineId).sort()).toEqual([...reference.keys()].sort())
  for (const g of groups) {
    const { key, i, sha256, deleted } = reference.get(g.lineId)!
    expect({ key: g.key, i: g.i, sha256: g.sha256, deleted: g.deleted }).toEqual({ key, i, sha256, deleted })
    expect(g.clean).toBe(true)
  }
})

test('line group fold keeps the lexically-first key on an equal-i tie (same as latestLineAnchors)', () => {
  const keys = [k('a', 5, 'ff'), k('a', 5, '00')].sort()
  const [g] = foldGroups([keys.map((key) => ({ key }))])
  expect(g.key).toBe(lops.latestLineAnchors(keys).get('a')!.key)
})

test('line group fold handles a group straddling pages and prefix-related ids', () => {
  // 'a-b' sorts BEFORE 'a' in S3 key order ('-' < '/'), the reverse of their raw order
  const keys = [k('a', 1), k('a', 2), k('a-b', 1), k('a/b', 4), k('é', 1)].sort()
  const pages = [keys.slice(0, 2), keys.slice(2, 3), keys.slice(3)].map((p) => p.map((key) => ({ key })))
  const groups = foldGroups(pages)
  expect(groups.map((g) => g.lineId).sort()).toEqual(['a', 'a-b', 'a/b', 'é'].sort())
  expect(groups.find((g) => g.lineId === 'a')!.i).toBe(2)
})

test('line group fold carries the clean flag of the chosen latest key', () => {
  const groups = foldGroups([[{ key: k('a', 1), clean: true }, { key: k('a', 2), clean: false }, { key: k('b', 1), clean: false }, { key: k('b', 2), clean: true }]])
  expect(groups.find((g) => g.lineId === 'a')!.clean).toBe(false)
  expect(groups.find((g) => g.lineId === 'b')!.clean).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test --project unit tests/features/integrity/lines-operations.unit.spec.ts`
Expected: FAIL — `newLineGroupFold is not a function`.

- [ ] **Step 3: Implement** in `api/src/integrity/lines-operations.ts`, after `latestLineAnchors`:

```ts
// A line's latest anchor, emitted once its whole key group has been seen (streamed compare).
export type LineAnchorGroup = LatestLineAnchor & { lineId: string, clean: boolean }
export type LineGroupFold = { open?: LineAnchorGroup }

export const newLineGroupFold = (): LineGroupFold => ({})

// Keys must arrive in listing order. Every key of a lineId shares the `lines/‹enc›/` prefix, so
// the group is contiguous in that order and complete as soon as a key of another lineId arrives —
// memory O(1) instead of O(distinct lines). Same latest-anchor rule as foldLatestLineAnchors
// (strict >: the lexically-first key wins an equal-i tie) and the same sibling blindness
// (parseLineRevisionKey drops `.who`).
export const pushLineGroupKeys = (acc: LineGroupFold, entries: Array<{ key: string, clean?: boolean }>): LineAnchorGroup[] => {
  const done: LineAnchorGroup[] = []
  for (const entry of entries) {
    const parsed = parseLineRevisionKey(entry.key)
    if (!parsed) continue
    if (acc.open && acc.open.lineId !== parsed.lineId) {
      done.push(acc.open)
      acc.open = undefined
    }
    if (!acc.open || parsed.i > acc.open.i) {
      acc.open = { lineId: parsed.lineId, key: entry.key, i: parsed.i, sha256: parsed.sha256, deleted: parsed.deleted, clean: entry.clean ?? true }
    }
  }
  return done
}

export const finishLineGroupFold = (acc: LineGroupFold): LineAnchorGroup[] => {
  const done = acc.open ? [acc.open] : []
  acc.open = undefined
  return done
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test --project unit tests/features/integrity/lines-operations.unit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/lines-operations.ts tests/features/integrity/lines-operations.unit.spec.ts
git commit -m "feat(integrity): streamed line group fold (one latest anchor per contiguous key group)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Streamed line comparer (IO injected) + differential test

**Files:**
- Modify: `api/src/integrity/lines-operations.ts` (after Task 2's code)
- Create: `tests/features/integrity/lines-compare.unit.spec.ts`

**Interfaces:**
- Consumes: `LineAnchorGroup`, `newLineGroupFold`, `pushLineGroupKeys`, `finishLineGroupFold` (Task 2); existing `classifyLine`, `lineSha256`.
- Produces:
  - `LiveLine = { _id: string, _i?: number } & Record<string, any>`
  - `LineDivergence = { lineId: string, kind: 'edited' | 'inserted' | 'missing', anchor?: { key: string, i: number } }` (`anchor` absent only for an insert with no anchor at all)
  - `LineCompareIO = { lookupLive: (ids: string[]) => Promise<LiveLine[]>, countLive: () => Promise<number>, iterateLiveIds: () => AsyncIterable<string> }` — `lookupLive` returns only non-`_deleted` lines.
  - `LineCompareResult = { checked: number, diverged: number }`
  - `createLineComparer(io: LineCompareIO, opts: { onDiverged: (batch: LineDivergence[]) => Promise<void>, excluded?: Set<string>, batchSize?: number }): { push: (group: LineAnchorGroup) => Promise<void>, finish: () => Promise<LineCompareResult> }`
  - `lineIdFingerprint(lineId: string): bigint`

- [ ] **Step 1: Write the failing tests** — create `tests/features/integrity/lines-compare.unit.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import * as lops from '../../../api/src/integrity/lines-operations.ts'

const owner = { type: 'organization', id: 'acme' }
const key = (lineId: string, i: number, shaOrDeleted: string) => lops.lineRevisionKey(owner, 'ds1', lineId, i, shaOrDeleted)
const anchorOf = (line: lops.LiveLine) => key(line._id, line._i!, lops.lineSha256(line))
const tomb = (lineId: string, i: number) => key(lineId, i, lops.DELETED_MARKER)

// the pre-streaming algorithm, verbatim in spirit (checker.ts compareDatasetLines before this change)
const referenceCompare = (keys: string[], lines: lops.LiveLine[]) => {
  const anchors = lops.latestLineAnchors(keys)
  const unvisited = new Set(anchors.keys())
  const edited: string[] = []
  const inserted: string[] = []
  for (const line of lines) {
    unvisited.delete(line._id)
    const verdict = lops.classifyLine(line, anchors.get(line._id))
    if (verdict === 'edited') edited.push(line._id)
    else if (verdict === 'inserted') inserted.push(line._id)
  }
  const missing = [...unvisited].filter((id) => !anchors.get(id)!.deleted)
  return { checked: lines.length, diverged: edited.length + inserted.length + missing.length, edited: edited.sort(), inserted: inserted.sort(), missing: missing.sort() }
}

const streamedCompare = async (keys: string[], lines: lops.LiveLine[], batchSize: number, pageSize: number) => {
  const byId = new Map(lines.map((l) => [l._id, l]))
  const io: lops.LineCompareIO = {
    lookupLive: async (ids) => ids.map((id) => byId.get(id)).filter((l): l is lops.LiveLine => !!l),
    countLive: async () => lines.length,
    iterateLiveIds: async function * () { for (const l of lines) yield l._id }
  }
  const found: lops.LineDivergence[] = []
  const comparer = lops.createLineComparer(io, { batchSize, onDiverged: async (batch) => { found.push(...batch) } })
  const fold = lops.newLineGroupFold()
  const sorted = [...keys].sort()
  for (let n = 0; n < sorted.length; n += pageSize) {
    for (const g of lops.pushLineGroupKeys(fold, sorted.slice(n, n + pageSize).map((k) => ({ key: k })))) await comparer.push(g)
  }
  for (const g of lops.finishLineGroupFold(fold)) await comparer.push(g)
  const result = await comparer.finish()
  const ids = (kind: string) => found.filter((d) => d.kind === kind).map((d) => d.lineId).sort()
  return { ...result, edited: ids('edited'), inserted: ids('inserted'), missing: ids('missing'), found }
}

const line = (_id: string, _i: number, attr: string): lops.LiveLine => ({ _id, _i, attr })

// every divergence shape the checker distinguishes, plus ordering traps
const fixture = () => {
  const ok = line('ok', 10, 'x')
  const edited = line('edited', 11, 'tampered')
  const rewound = line('rewound', 3, 'y') // _i rewind: anchor at 12
  const inserted = line('inserted', 13, 'z')
  const tombLive = line('tomb-live', 14, 'w')
  const prefixA = line('a', 15, 'p')
  const prefixAB = line('a-b', 16, 'q')
  const unsafe = line('a/b é', 17, 'r')
  const lines = [ok, edited, rewound, inserted, tombLive, prefixA, prefixAB, unsafe]
  const keys = [
    key('ok', 2, 'old'), anchorOf(ok), anchorOf(ok) + '.who',
    key('edited', 11, lops.lineSha256({ _id: 'edited', attr: 'original' })),
    key('rewound', 12, lops.lineSha256(rewound)),
    key('missing', 20, 'gone'),
    tomb('tomb-dead', 21),
    tomb('tomb-live', 22),
    anchorOf(prefixA), anchorOf(prefixAB), anchorOf(unsafe)
  ]
  return { keys, lines }
}

for (const batchSize of [1, 2, 1000]) {
  for (const pageSize of [1, 3, 1000]) {
    test(`streamed compare equals the reference (batch ${batchSize}, page ${pageSize})`, async () => {
      const { keys, lines } = fixture()
      const expected = referenceCompare(keys, lines)
      const actual = await streamedCompare(keys, lines, batchSize, pageSize)
      expect({ checked: actual.checked, diverged: actual.diverged, edited: actual.edited, inserted: actual.inserted, missing: actual.missing })
        .toEqual({ checked: expected.checked, diverged: expected.diverged, edited: expected.edited, inserted: expected.inserted, missing: expected.missing })
    })
  }
}

test('delete X then insert Y out-of-band: both reported', async () => {
  const x = line('x', 1, 'a')
  const y = line('y', 2, 'b')
  const actual = await streamedCompare([anchorOf(x)], [y], 1000, 1000)
  expect(actual.missing).toEqual(['x'])
  expect(actual.inserted).toEqual(['y'])
  expect(actual.diverged).toBe(2)
})

test('divergences carry the anchor key and index needed by the repairs', async () => {
  const { keys, lines } = fixture()
  const actual = await streamedCompare(keys, lines, 1000, 1000)
  const missing = actual.found.find((d) => d.lineId === 'missing')!
  expect(missing.anchor).toEqual({ key: key('missing', 20, 'gone'), i: 20 })
  const insertedNoAnchor = actual.found.find((d) => d.lineId === 'inserted')!
  expect(insertedNoAnchor.anchor).toBeUndefined()
  const tombLive = actual.found.find((d) => d.lineId === 'tomb-live')!
  expect(tombLive).toMatchObject({ kind: 'inserted', anchor: { key: tomb('tomb-live', 22), i: 22 } })
})

test('duplicate group cannot hide an insert (forged non-canonical key decoding to an existing id)', async () => {
  const a = line('a', 5, 'v')
  const zero = line('0', 7, 'u')
  const y = line('y', 6, 'w')
  // `%61` decodes to 'a' but sorts before `0/` and `a/` ('%' < '0' < 'a'): with line '0' in
  // between, the group fold emits 'a' twice (non-adjacent groups)
  const forged = `${lops.linesPrefix(owner, 'ds1')}%61/${lops.padLineIndex(5)}-${lops.lineSha256(a)}`
  const actual = await streamedCompare([anchorOf(a), forged, anchorOf(zero)], [a, zero, y], 1000, 1000)
  expect(actual.found.filter((d) => d.lineId === 'a')).toEqual([]) // both 'a' groups classify ok
  expect(actual.inserted).toEqual(['y'])
  expect(actual.diverged).toBeGreaterThanOrEqual(1)
})

test('no live lines and only tombstones: clean', async () => {
  const actual = await streamedCompare([tomb('t1', 1), tomb('t2', 2)], [], 2, 2)
  expect(actual).toMatchObject({ checked: 0, diverged: 0 })
})

test('lineIdFingerprint is stable and 64-bit', () => {
  expect(lops.lineIdFingerprint('abc')).toBe(lops.lineIdFingerprint('abc'))
  expect(lops.lineIdFingerprint('abc')).not.toBe(lops.lineIdFingerprint('abd'))
  expect(lops.lineIdFingerprint('abc') < 2n ** 64n).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test --project unit tests/features/integrity/lines-compare.unit.spec.ts`
Expected: FAIL — `createLineComparer is not a function`.

- [ ] **Step 3: Implement** in `api/src/integrity/lines-operations.ts` (add `createHash` is already imported):

```ts
export type LiveLine = { _id: string, _i?: number } & Record<string, any>
export type LineDivergence = { lineId: string, kind: 'edited' | 'inserted' | 'missing', anchor?: { key: string, i: number } }
export type LineCompareIO = {
  // live (non-_deleted) lines among `ids`
  lookupLive: (ids: string[]) => Promise<LiveLine[]>
  countLive: () => Promise<number>
  iterateLiveIds: () => AsyncIterable<string>
}
export type LineCompareResult = { checked: number, diverged: number }

// 8 bytes of sha256: only used to NAME inserted lines once the count proved some exist — a
// collision can drop one id from the sample, never change the verdict or the diverged count
export const lineIdFingerprint = (lineId: string): bigint =>
  createHash('sha256').update(lineId).digest().readBigUInt64BE(0)

// growable typed array: ~8 bytes per accounted line instead of a Set of strings
class FingerprintSet {
  private values = new BigUint64Array(1024)
  private size = 0
  add (fp: bigint) {
    if (this.size === this.values.length) {
      const grown = new BigUint64Array(this.values.length * 2)
      grown.set(this.values)
      this.values = grown
    }
    this.values[this.size++] = fp
  }

  // sorts in place, removes duplicates, returns how many were removed
  seal (): number {
    const sorted = this.values.subarray(0, this.size).sort()
    let unique = 0
    for (let n = 0; n < sorted.length; n++) {
      if (n === 0 || sorted[n] !== sorted[unique - 1]) sorted[unique++] = sorted[n]
    }
    const removed = this.size - unique
    this.values = sorted.slice(0, unique)
    this.size = unique
    return removed
  }

  has (fp: bigint): boolean {
    let lo = 0
    let hi = this.size - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const v = this.values[mid]
      if (v === fp) return true
      if (v < fp) lo = mid + 1
      else hi = mid - 1
    }
    return false
  }
}

// Streamed lines compare (design 2026-10-15 §3). Pass A: anchors arrive one per line (group
// fold), are looked up in Mongo in batches and classified with classifyLine — edited / inserted
// (tombstone latest) / missing. Pass B: `_id` is unique, so every live line holding an anchor is
// found exactly once in pass A — out-of-band inserts exist iff the live count exceeds the lines
// pass A found (counted DISTINCT: a forged non-canonical key can emit one lineId twice, and must
// not inflate the count to hide an insert). Only then are live ids streamed to name them.
export const createLineComparer = (io: LineCompareIO, opts: { onDiverged: (batch: LineDivergence[]) => Promise<void>, excluded?: Set<string>, batchSize?: number }) => {
  const batchSize = opts.batchSize ?? 1000
  const accounted = new FingerprintSet()
  let pending: LineAnchorGroup[] = []
  let diverged = 0

  const flush = async () => {
    if (!pending.length) return
    const groups = pending
    pending = []
    const live = new Map((await io.lookupLive(groups.map((g) => g.lineId))).map((l) => [l._id, l]))
    const batch: LineDivergence[] = []
    for (const g of groups) {
      const line = live.get(g.lineId)
      if (!line) {
        // a tombstone with no live line is a legitimately deleted line
        if (!g.deleted) batch.push({ lineId: g.lineId, kind: 'missing', anchor: { key: g.key, i: g.i } })
        continue
      }
      accounted.add(lineIdFingerprint(g.lineId))
      const verdict = classifyLine(line, g, opts.excluded)
      if (verdict !== 'ok') batch.push({ lineId: g.lineId, kind: verdict, anchor: { key: g.key, i: g.i } })
    }
    if (batch.length) {
      diverged += batch.length
      await opts.onDiverged(batch)
    }
  }

  return {
    push: async (group: LineAnchorGroup): Promise<void> => {
      pending.push(group)
      if (pending.length >= batchSize) await flush()
    },
    finish: async (): Promise<LineCompareResult> => {
      await flush()
      accounted.seal()
      const checked = await io.countLive()
      const unaccounted = checked - accounted.sizeOf()
      if (unaccounted > 0) {
        // exact even if a fingerprint collision leaves one insert unnamed below
        diverged += unaccounted
        let batch: LineDivergence[] = []
        for await (const id of io.iterateLiveIds()) {
          if (accounted.has(lineIdFingerprint(id))) continue
          batch.push({ lineId: id, kind: 'inserted' })
          if (batch.length >= batchSize) { await opts.onDiverged(batch); batch = [] }
        }
        if (batch.length) await opts.onDiverged(batch)
      }
      return { checked, diverged }
    }
  }
}
```

Add the accessor used above to `FingerprintSet`:

```ts
  sizeOf (): number { return this.size }
```

Note on duplicates: a lineId emitted twice is classified twice (it may report `edited` twice in the same breach); the count uses distinct fingerprints, so `unaccounted` stays exact. The forged-key shape is attacker activity on the store, which today's map-based compare does not detect better.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test --project unit tests/features/integrity/lines-compare.unit.spec.ts tests/features/integrity/lines-operations.unit.spec.ts`
Expected: PASS (9 differential combinations + the targeted tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/lines-operations.ts tests/features/integrity/lines-compare.unit.spec.ts
git commit -m "feat(integrity): streamed line comparer with insert-by-count, differential-tested

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire the streamed compare and renewal into the checker

**Files:**
- Modify: `api/src/integrity/checker.ts` (whole lines part: `compareDatasetLines` ~44-73, `maybeRenewLines` ~109-140, `checkDataset` ~142-339)
- Modify: `api/src/integrity/operations.ts` (delete the temporary `filterAckedAnomalies`)
- Test: existing `tests/features/integrity/lines.api.spec.ts`, `trail.api.spec.ts`, `core.api.spec.ts`, `index.api.spec.ts`, `hardening.api.spec.ts` — unchanged.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (used by Task 5):
  - `compareDatasetLines(dataset: DatasetInternal, store: IntegrityStore, onDiverged: (batch: lops.LineDivergence[]) => Promise<void>): Promise<lops.LineCompareResult>`
  - `checkDataset` signature and `Check` type unchanged.

- [ ] **Step 1: Run the existing suites on master behavior as the baseline**

Run: `npx playwright test --project api tests/features/integrity/lines.api.spec.ts tests/features/integrity/trail.api.spec.ts`
Expected: PASS (if not, stop and report — the baseline must be green before refactoring).

- [ ] **Step 2: Replace `compareDatasetLines`** with a streamed version and add the IO adapter:

```ts
// Mongo side of the streamed compare (lines-operations.ts createLineComparer)
const liveLinesIO = (dataset: DatasetInternal): lops.LineCompareIO => {
  const c = restUtils.collection(dataset as any)
  return {
    lookupLive: async (ids) => await c.find({ _id: { $in: ids }, _deleted: { $ne: true } }).toArray() as lops.LiveLine[],
    countLive: async () => await c.countDocuments({ _deleted: { $ne: true } }),
    iterateLiveIds: async function * () {
      for await (const line of c.find({ _deleted: { $ne: true } }).project<{ _id: string }>({ _id: 1 })) yield line._id
    }
  }
}

// Compare live Mongo lines against the latest anchors recovered from LIST alone (the sha256 is
// embedded in each key), streamed: memory is one lookup batch plus ~8 bytes per live line, never
// the whole anchor set. Repairs (fix/restore) walk the current view — they target data, not the
// trail — and act on each divergence batch as it is reported.
export const compareDatasetLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, onDiverged: (batch: lops.LineDivergence[]) => Promise<void>): Promise<lops.LineCompareResult> => {
  const comparer = lops.createLineComparer(liveLinesIO(dataset), { excluded: lops.extensionOwnedKeys(dataset.extensions), onDiverged })
  const fold = lops.newLineGroupFold()
  for await (const page of store.iterateRevisionPages(lops.linesPrefix(dataset.owner, dataset.id))) {
    for (const group of lops.pushLineGroupKeys(fold, page)) await comparer.push(group)
  }
  for (const group of lops.finishLineGroupFold(fold)) await comparer.push(group)
  return await comparer.finish()
}
```

- [ ] **Step 3: Replace `maybeRenewLines`** with its own streamed, per-key-verified walk:

```ts
// Per-line lock renewal (target 3), streamed (design 2026-10-15 §3.5): runs only after a fully
// clean check, then walks the lines versions itself and extends each line's latest live anchor —
// ONLY if that key's own versions are clean. PutObjectRetention carries no version id: a shadow
// version slipped in after the check would otherwise get the attacker's version extended. An
// unclean key counts as a failure (loud). Exhaustive by necessity (§3.5); tombstones age out.
const maybeRenewLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal(dataset.integrity?.linesRenewal?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  let renewed = 0
  let failed = 0
  let queue: lops.LineAnchorGroup[] = []
  const renewQueue = async () => {
    await Promise.all(queue.map(async (anchor) => {
      try {
        await store.extendRetention(anchor.key, retainUntil)
        renewed++
      } catch (err) {
        internalError('integrity-renew-lines', err)
        failed++
      }
    }))
    queue = []
  }
  const take = async (groups: lops.LineAnchorGroup[]) => {
    for (const group of groups) {
      if (group.deleted) continue
      if (!group.clean) {
        internalError('integrity-renew-lines', new Error(`refusing to renew tampered key ${group.key}`))
        failed++
        continue
      }
      queue.push(group)
      if (queue.length >= RENEW_CONCURRENCY) await renewQueue()
    }
  }
  // anomalies are not collected here: per-key cleanliness is read from the current view
  const acc = ops.newTrailFold(() => {})
  const fold = lops.newLineGroupFold()
  for await (const page of store.iterateVersionPages(lops.linesPrefix(dataset.owner, dataset.id))) {
    ops.foldTrailVersions(acc, page)
    await take(lops.pushLineGroupKeys(fold, [...acc.current.values()]))
    acc.current.clear()
  }
  ops.finishTrailFold(acc)
  await take(lops.pushLineGroupKeys(fold, [...acc.current.values()]))
  await take(lops.finishLineGroupFold(fold))
  await renewQueue()
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.linesRenewal': { date, status: failed ? 'failed' : 'ok', renewed, failed, ...(failed ? {} : { retainUntil: retainUntil.toISOString() }) } }
  })
  // same posture as the dataset-level renewal, separate dedup cadence (see alerts.ts)
  await maybeAlert(dataset, 'integrity-renewal-failed', failed > 0, 'lines-renewal-failed')
}
```

- [ ] **Step 4: Rewire `checkDataset`.** Add the ack reader near the top of the file:

```ts
// the latest ackTrail revision's fingerprints, read from the LOCKED body (Mongo trailAck is only
// a pointer — a forged pointer to a non-ack revision yields nothing). Read BEFORE the walk so the
// collector filters acks before capping (design 2026-10-15 §3.4).
const readAckedFingerprints = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>): Promise<string[]> => {
  const trailAck = dataset.integrity?.trailAck
  if (!trailAck || !Number.isInteger(trailAck.i)) return []
  try {
    const ackRev = await store.getRevision(ops.revisionKey(dataset.owner, dataset.id, trailAck.i))
    if (ackRev.context.operation === 'ackTrail' && ackRev.ack?.fingerprints) return ackRev.ack.fingerprints
  } catch (err) {
    internalError('integrity-trail-ack-read', err)
  }
  return []
}
```

In `checkDataset`, replace the block from `const datasetAcc = ops.newTrailFold()` through `const trailAnomalies = [...datasetView.anomalies, ...linesView.anomalies]` with:

```ts
  // ONE versions walk over the whole scope serves both verdicts: it reconstructs the current
  // view (marker-hidden keys resurface into the data compare) and yields the trail anomalies
  // the current view cannot show (shadow versions, markers). Line keys are grouped per lineId as
  // they stream and compared in batches (design 2026-10-15): memory no longer grows with the
  // number of lines. Anomalies are ack-filtered as produced, then capped.
  const collector = ops.newAnomalyCollector(await readAckedFingerprints(dataset, store), TRAIL_ANOMALY_CAP)
  const datasetAcc = ops.newTrailFold(collector.push)
  const linesAcc = ops.newTrailFold(collector.push)
  const groupFold = lops.newLineGroupFold()
  const linesSample: string[] = []
  const comparer = isRestDataset(dataset as any)
    ? lops.createLineComparer(liveLinesIO(dataset), {
      excluded: lops.extensionOwnedKeys(dataset.extensions),
      onDiverged: async (batch) => { for (const d of batch) if (linesSample.length < 20) linesSample.push(d.lineId) }
    })
    : undefined
  const drainLineKeys = async (groups: lops.LineAnchorGroup[]) => {
    if (comparer) for (const group of groups) await comparer.push(group)
  }
  const drainCurrentLineKeys = async () => {
    if (!linesAcc.current.size) return
    const groups = lops.pushLineGroupKeys(groupFold, [...linesAcc.current.values()])
    linesAcc.current.clear()
    await drainLineKeys(groups)
  }
  for await (const page of store.iterateVersionPages(prefix)) {
    const datasetEntries: ops.TrailVersionEntry[] = []
    const lineEntries: ops.TrailVersionEntry[] = []
    for (const entry of page) (entry.key.startsWith(linesPrefix) ? lineEntries : datasetEntries).push(entry)
    if (datasetEntries.length) ops.foldTrailVersions(datasetAcc, datasetEntries)
    if (lineEntries.length) { ops.foldTrailVersions(linesAcc, lineEntries); await drainCurrentLineKeys() }
  }
  const datasetView = ops.finishTrailFold(datasetAcc)
  ops.finishTrailFold(linesAcc)
  await drainCurrentLineKeys()
  await drainLineKeys(lops.finishLineGroupFold(groupFold))
```

Then replace every later `trailAnomalies.push(...)` with `collector.push(...)` (sequence gaps: `for (const a of ops.sequenceGapAnomalies(prefix, seqIndexes)) collector.push(a)`), delete the whole `let anomalies = trailAnomalies … filterAckedAnomalies …` block, and build the verdict from the collector:

```ts
  const trail: TrailVerdict = collector.total()
    ? { status: 'altered', anomalies: collector.kept }
    : { status: 'ok' }
```

Replace the lines part:

```ts
  let linesResult: { checked: number, diverged: number, sample: string[] } | undefined
  if (comparer) {
    const linesCompare = await comparer.finish()
    if (linesCompare.diverged) breach.push('lines')
    linesResult = { checked: linesCompare.checked, diverged: linesCompare.diverged, sample: linesSample }
  }
```

And the renewal call at the end:

```ts
  if (status === 'ok' && trail.status === 'ok') {
    await maybeRenew(dataset, store, latest, latestRevision)
    if (isRestDataset(dataset as any)) await maybeRenewLines(dataset, store)
  }
```

Delete the temporary `filterAckedAnomalies` from `operations.ts`. Remove now-unused imports/variables (`linesCompare` type alias, `lineAnchors`); run `npm run lint` to catch leftovers.

- [ ] **Step 5: Run the integrity API suites**

Run: `npx playwright test --project api tests/features/integrity/lines.api.spec.ts tests/features/integrity/trail.api.spec.ts tests/features/integrity/core.api.spec.ts tests/features/integrity/hardening.api.spec.ts tests/features/integrity/index.api.spec.ts`
Expected: PASS, with **no edited assertions**. If a test depends on anomaly *order* (walk order now interleaves dataset/line keys before gaps/skew), report it before touching anything — order is not part of the guarantee, but the test change must be explicit.

- [ ] **Step 6: Run unit tests and type check**

Run: `npm run test-unit && bash dev/check-types-ratchet.sh`
Expected: PASS, ratchet not increased.

- [ ] **Step 7: Commit**

```bash
git add api/src/integrity/checker.ts api/src/integrity/operations.ts
git commit -m "feat(integrity): streamed lines check and per-key verified renewal walk

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Batch repairs in `_fix` and `lines/_restore`

**Files:**
- Modify: `api/src/integrity/service.ts:209-341` (`fixIntegrityUnlocked`, `restoreLinesUnlocked`)
- Test: existing `tests/features/integrity/lines.api.spec.ts` tests at lines 406-523, `attribution.api.spec.ts` (`_fix` bless `.who`) — unchanged.

**Interfaces:**
- Consumes: `compareDatasetLines(dataset, store, onDiverged)` (Task 4), `LineDivergence` (Task 3).

Why repairing during the stream is safe: every divergence handed to `onDiverged` comes from a completed key group (or from pass B, after the listing ended). New anchors the repair writes (bless/restore revisions, tombstones) live under those lineIds' own prefixes, which sort **before** the listing cursor, so the paginated LIST never returns them; the dataset lock keeps other anchorers out. The final `checkDataset` re-verifies convergence, so any missed shape stays a visible breach.

- [ ] **Step 1: Rewrite `_fix`'s lines block** (replace from `const compare = await compareDatasetLines(dataset, store)` through the end of the `_i`-wedge loop's `if (corrected) {...}`):

```ts
    const hint: HistorizeContextHint = { operation: 'fixIntegrity', origin: 'superadmin', ...(reason ? { reason } : {}), ...(who ? { who } : {}) }
    const excluded = lops.extensionOwnedKeys(dataset.extensions)
    const retainUntil = retentionWindow()
    // bless the current state batch by batch as the streamed compare reports divergences (see
    // the pipeline rationale below — unchanged from the map-based version)
    await compareDatasetLines(dataset, store, async (batch) => {
      // edited + inserted lines: bless the CURRENT content as the new legitimate truth by
      // re-writing it through the standard transaction pipeline (the same mechanism
      // lines/_restore uses) rather than anchoring directly at the line's current `_i`.
      // A direct anchor there is nondeterministic/broken: an equal-`_i` tie against the
      // still-live stale anchor can lose, an `_i`-rewind tamper can never outrank the stale
      // anchor, and an out-of-band-inserted line can be shadowed by a higher-i tombstone. The
      // pipeline always mints a fresh `_i` strictly greater than any prior anchor's.
      const blessIds = batch.filter((d) => d.kind !== 'missing').map((d) => d.lineId)
      if (blessIds.length) {
        const liveLines = await restUtils.collection(dataset).find({ _id: { $in: blessIds } }).toArray()
        const transacs = liveLines.map((line) => ({ _action: 'createOrUpdate' as const, _id: line._id, ...lops.cleanedLineBody(line, excluded) }))
        await rewriteLinesThroughPipeline(dataset, transacs, hint)
      }
      // tombstone revisions for vanished lines: continue each sequence past its stale anchor
      const missing = batch.filter((d) => d.kind === 'missing' && d.anchor)
      for (let offset = 0; offset < missing.length; offset += LINE_IO_CONCURRENCY) {
        await Promise.all(missing.slice(offset, offset + LINE_IO_CONCURRENCY).map((d) =>
          anchorLine(dataset, { _id: d.lineId, _i: d.anchor!.i + 1, _deleted: true }, store, retainUntil, hint)))
      }
    })
    // Adversarial _i inflation (§S4): the bless above mints a time-derived _i — a forged anchor
    // index above any clock-derived value can therefore never be outranked by it, wedging the
    // remediation. Detect the non-convergent shape (still 'edited' with live _i below the anchor
    // index) and correct the line's _i explicitly past the stale anchor — stamped and reindexed
    // in the same single-document write — then drain again so the final verdict proves convergence.
    let corrected = false
    await compareDatasetLines(dataset, store, async (batch) => {
      const edited = batch.filter((d) => d.kind === 'edited' && d.anchor)
      if (!edited.length) return
      const anchorI = new Map(edited.map((d) => [d.lineId, d.anchor!.i]))
      const stillEdited = await restUtils.collection(dataset).find({ _id: { $in: [...anchorI.keys()] } }).toArray()
      for (const line of stillEdited) {
        const staleI = anchorI.get(line._id)!
        if ((line._i ?? 0) >= staleI) continue // not the wedge shape
        let targetI = staleI + 1
        if (!lops.lineIndexInRange(targetI)) continue // unfixable without corrupting the key layout — stays a breach, loudly
        if (!corrected) {
          // hint FIRST (outbox ordering), like every lines writer
          await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true } })
          corrected = true
        }
        while (true) {
          try {
            await restUtils.collection(dataset).updateOne(
              { _id: line._id },
              { $set: { _i: targetI, _hash: null, _needsIndexing: true, _needsHistorizing: { context: hint } } }
            )
            break
          } catch (err: any) {
            if (err.code === 11000 && lops.lineIndexInRange(targetI + 1)) { targetI++; continue } // another line holds this _i
            throw err
          }
        }
      }
    })
    if (corrected) {
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _partialRestStatus: 'updated' } })
      const freshAfterCorrection = await mongo.datasets.findOne({ id: dataset.id })
      await historizeLines(freshAfterCorrection as unknown as RestDataset)
    }
```

Keep the preceding lines (`const store = integrityStore()`, `await historizeLines(dataset)`); the old explanatory comments are carried into the block above. Remove the old `compare`/`recompare`/`stillEdited` variables.

- [ ] **Step 2: Rewrite `restoreLinesUnlocked`**:

```ts
const restoreLinesUnlocked = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<Check> => {
  requireActive(dataset)
  if (!isRestDataset(dataset)) throw httpError(400, 'lines restore only applies to an editable (rest) dataset')
  const store = integrityStore()
  // drain any pending organic stamps first so the comparison sees anchored truth
  await historizeLines(dataset)
  const hint: HistorizeContextHint = { operation: 'restore', origin: 'superadmin', ...(reason ? { reason } : {}), ...(who ? { who } : {}) }
  // repaired batch by batch as the streamed compare reports divergences
  await compareDatasetLines(dataset, store, async (batch) => {
    const transacs: any[] = []
    // edited lines and out-of-band-deleted lines: rewrite from the latest revision's payload
    const fetch = batch.filter((d) => (d.kind === 'edited' || d.kind === 'missing') && d.anchor)
    for (let offset = 0; offset < fetch.length; offset += LINE_IO_CONCURRENCY) {
      await Promise.all(fetch.slice(offset, offset + LINE_IO_CONCURRENCY).map(async (d) => {
        const rev: any = await store.getRevision(d.anchor!.key)
        if (!rev.payload) return // defensive: tombstone anchors are never edited/missing
        transacs.push({ _action: 'createOrUpdate', _id: d.lineId, ...rev.payload })
      }))
    }
    // out-of-band-inserted lines have no verified state: restoring means deleting them
    for (const d of batch) if (d.kind === 'inserted') transacs.push({ _action: 'delete', _id: d.lineId })
    await rewriteLinesThroughPipeline(dataset, transacs, hint)
  })
  const freshAfter = await mongo.datasets.findOne({ id: dataset.id })
  return await checkDataset(freshAfter as unknown as DatasetInternal)
}
```

- [ ] **Step 3: Run the repair tests**

Run: `npx playwright test --project api tests/features/integrity/lines.api.spec.ts -g "restore|_fix|tamper" && npx playwright test --project api tests/features/integrity/attribution.api.spec.ts`
Expected: PASS, unchanged.

- [ ] **Step 4: Full integrity API suite + ratchet**

Run: `npx playwright test --project api tests/features/integrity/ && bash dev/check-types-ratchet.sh`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/integrity/service.ts
git commit -m "feat(integrity): stream _fix and lines restore repairs batch by batch

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Admin time budget — `202 {status:'running'}` and `integrity.running`

**Files:**
- Modify: `api/config/default.cjs` (integrity block), `api/config/custom-environment-variables.cjs`, `api/config/type/schema.json`
- Modify: `api/src/integrity/service.ts` (new `withAdminBudget`, `getIntegrityState`)
- Modify: `api/src/datasets/routes/integrity.ts`
- Modify: `api/types/dataset/schema.js` (integrity properties, after `trailAck`)
- Create: `tests/features/integrity/admin-budget.api.spec.ts`

**Interfaces:**
- Produces:
  - `withAdminBudget<T>(datasetId: string, action: AdminAction, work: () => Promise<T>): Promise<T | { status: 'running' }>` with `AdminAction = 'check' | 'fix' | 'restore' | 'lines-restore' | 'ack'`
  - Dataset field `integrity.running?: { action: string, startedAt: string }` (display-only), returned by `GET _integrity` only while the dataset lock is actually held.

- [ ] **Step 1: Write the failing API test** — create `tests/features/integrity/admin-budget.api.spec.ts`:

```ts
// Synchronous admin actions past their budget answer 202 {status:'running'} and finish in-process
// (design 2026-10-15 §4). integrity.running is display-only and dropped once the lock is gone.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, anonymousAx, clean } from '../../support/axios.ts'
import { ensureIntegrityBucket, waitForLinesDrained } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })
test.afterEach(async () => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.adminSyncBudgetMs', value: 20000 })
})

const enrolledRest = async (ax: any) => {
  const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: `budget ${Date.now()}`, schema: [{ key: 'attr1', type: 'string' }] })).data
  await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ _id: 'l1', attr1: 'a' }, { _id: 'l2', attr1: 'b' }])
  await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForLinesDrained(dataset.id)
  return dataset
}

const waitNotRunning = async (ax: any, datasetId: string, since: string, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = (await ax.get(`/api/v1/datasets/${datasetId}/_integrity`)).data
    if (!state.running && state.lastCheck?.date && state.lastCheck.date > since) return state
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error('admin action did not converge')
}

test('a check past its budget answers 202 running, then converges', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRest(ax)
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.adminSyncBudgetMs', value: 1 })
  const since = new Date().toISOString()
  const res = await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)
  expect(res.status).toBe(202)
  expect(res.data).toEqual({ status: 'running' })
  const state = await waitNotRunning(ax, dataset.id, since)
  expect(state.lastCheck.status).toBe('ok')
})

test('a check within budget still answers 200 with the verdict', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRest(ax)
  const res = await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)
  expect(res.status).toBe(200)
  expect(res.data.status).toBe('ok')
})

test('running without a held lock is dropped (pod died mid-action)', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await enrolledRest(ax)
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.running': { action: 'fix', startedAt: new Date().toISOString() } })
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  const state = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.running).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test --project api tests/features/integrity/admin-budget.api.spec.ts`
Expected: FAIL — first test gets 200 (no budget yet), third returns `running`.

- [ ] **Step 3: Config.** In `api/config/default.cjs`, after `lockWaitMs: 10000,`:

```js
    // synchronous admin actions (check / fix / restores / ack) answer with the fresh verdict when
    // they finish within this budget; past it they answer 202 {status:'running'} and finish
    // in-process under the dataset lock (a full check on a 1M-line dataset takes minutes)
    adminSyncBudgetMs: 20000,
```

In `api/config/custom-environment-variables.cjs`, after the `lockWaitMs` entry:

```js
    adminSyncBudgetMs: {
      __name: 'INTEGRITY_ADMIN_SYNC_BUDGET_MS',
      __format: 'json'
    },
```

In `api/config/type/schema.json`, after `"lockWaitMs": { "type": "number" },`:

```json
        "adminSyncBudgetMs": { "type": "number" },
```

Run: `npm run build-types`

- [ ] **Step 4: Dataset schema.** In `api/types/dataset/schema.js`, after the `trailAck` property:

```js
      // display-only: a synchronous admin action exceeded its budget and is finishing in-process.
      // Nothing gates on it; GET _integrity drops it when the dataset lock is no longer held.
      running: {
        type: 'object',
        required: ['action', 'startedAt'],
        properties: {
          action: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' }
        }
      },
```

Run: `npm run build-types`

- [ ] **Step 5: `withAdminBudget` and state cleanup** in `api/src/integrity/service.ts` (after `withDatasetLock`; `internalError` from `@data-fair/lib-node/observer.js`, `locks` is already imported):

```ts
export type AdminAction = 'check' | 'fix' | 'restore' | 'lines-restore' | 'ack'

// Time budget for synchronous admin actions (design 2026-10-15 §4). The work is started exactly as
// before (it acquires the dataset lock itself, so a busy 409 still surfaces within the budget);
// past the budget the route answers {status:'running'} and the work finishes in THIS process.
// Deliberately not a worker task triggered by a Mongo flag: a Mongo-writing adversary could set
// that flag and have a worker bless their own tampering. `integrity.running` is display-only.
export const withAdminBudget = async <T>(datasetId: string, action: AdminAction, work: () => Promise<T>): Promise<T | { status: 'running' }> => {
  const running = work()
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), config.integrity?.adminSyncBudgetMs ?? 20000) })
  const first = await Promise.race([running, budget]).finally(() => clearTimeout(timer))
  if (first !== 'timeout') return first as T
  await mongo.datasets.updateOne({ id: datasetId }, { $set: { 'integrity.running': { action, startedAt: new Date().toISOString() } } })
  // attached after the $set: if the work already settled, this cleanup still runs after it
  running
    .catch((err) => internalError('integrity-admin-background', err))
    .finally(() => mongo.datasets.updateOne({ id: datasetId }, { $unset: { 'integrity.running': '' } })
      .catch((err) => internalError('integrity-admin-background', err)))
  return { status: 'running' }
}
```

In `getIntegrityState`, after `const integrity = { ... }`:

```ts
  // display-only marker: real only while the dataset lock is held (a pod that died mid-action
  // releases its lock by TTL but never reaches the $unset) — drop it otherwise
  if (integrity.running && !(await locks.collection.findOne({ _id: `datasets:${dataset.id}` } as any))) {
    delete integrity.running
    await mongo.datasets.updateOne({ id: dataset.id }, { $unset: { 'integrity.running': '' } })
  }
```

- [ ] **Step 6: Routes.** In `api/src/datasets/routes/integrity.ts` add a helper and wrap the five actions:

```ts
// 202 when the action outlived its budget and finishes in the background (design 2026-10-15 §4)
const sendAdminResult = (res: Response, result: any) => {
  res.status(result?.status === 'running' ? 202 : 200).json(result)
}
```

(import `type Response` from `express` alongside `Router`/`Request`). Then:

```ts
  router.post('/:datasetId/_integrity/_fix', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset = reqDataset(req)
    sendAdminResult(res, await integrityService.withAdminBudget(dataset.id, 'fix', () => integrityService.fixIntegrity(dataset, reqReason(req), whoFromReq(req))))
  })
```

Same shape for `_restore` (`'restore'`, wrapping `restoreRevision(...)`), `lines/_restore` (`'lines-restore'`), `trail/_ack` (`'ack'`), and `_check` (`'check'`, wrapping `integrityService.withDatasetLock(dataset.id, () => checkDataset(dataset, { deep: req.query.deep === 'true', seed }))`). Keep each route's existing comments.

- [ ] **Step 7: Run tests**

Run: `npx playwright test --project api tests/features/integrity/admin-budget.api.spec.ts tests/features/integrity/admin.api.spec.ts tests/features/integrity/lines.api.spec.ts`
Expected: PASS.

- [ ] **Step 8: Ratchet + commit**

Run: `bash dev/check-types-ratchet.sh` — expected not increased.

```bash
git add api/config api/types/dataset api/src/integrity/service.ts api/src/datasets/routes/integrity.ts tests/features/integrity/admin-budget.api.spec.ts
git commit -m "feat(integrity): time budget for synchronous admin actions (202 running)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Panel — running state and polling

**Files:**
- Modify: `ui/src/components/dataset/dataset-integrity.vue` (script ~1002-1230, template near the refresh button ~293, `<i18n>` fr ~775 and en ~884)

**Interfaces:**
- Consumes: `202 { status: 'running' }` responses and `GET _integrity` → `running?: { action, startedAt }` (Task 6).

- [ ] **Step 1: Type + poller.** Extend `IntegrityState` (line ~986):

```ts
type IntegrityState = NonNullable<Dataset['integrity']> & { lines?: { anchored: number, pending: number, overGate?: boolean }, running?: { action: string, startedAt: string } }
```

Add after `onUnmounted(stopLinesPoll)`:

```ts
// An admin action that outlived its server-side budget answers {status:'running'} and finishes in
// the background (large lines datasets): poll the state until the marker clears, then reload.
// Also resumes on load when another session left an action running.
let runningTimer: ReturnType<typeof setTimeout> | undefined
const stopRunningPoll = () => {
  if (runningTimer) {
    clearTimeout(runningTimer)
    runningTimer = undefined
  }
}
const pollRunning = async () => {
  if (!dataset.value) return
  const fresh = await $fetch<IntegrityState>(`datasets/${dataset.value.id}/_integrity`)
  if (fresh.running) {
    if (state.value) state.value.running = fresh.running
    runningTimer = setTimeout(pollRunning, 3000)
    return
  }
  stopRunningPoll()
  await load.execute()
  datasetStore.datasetFetch.refresh() // the breach badge and tab color derive from the dataset doc
}
const startRunningPoll = () => {
  stopRunningPoll()
  sendUiNotif({ type: 'info', msg: t('runningInBackground') })
  runningTimer = setTimeout(pollRunning, 3000)
}
watch(() => state.value?.running, (running) => { if (running && !runningTimer) runningTimer = setTimeout(pollRunning, 3000) }, { immediate: true })
onUnmounted(stopRunningPoll)
```

(`sendUiNotif` is declared further down with `useUiNotif()`; move the `const { sendUiNotif } = useUiNotif()` line above this block.)

- [ ] **Step 2: Handle `running` in each action.** In `check`, `fix`, `ackTrail`, `restore`, `linesRestore`, capture the response and return early:

```ts
const check = useAsyncAction(async () => {
  const res = await $fetch<{ status: string, date?: string }>(`datasets/${dataset.value!.id}/_integrity/_check`, { method: 'POST' })
  if (res.status === 'running') return startRunningPoll()
  await load.execute()
  ...unchanged...
})
```

For `fix` and `ackTrail` (no response captured today): `const res = await $fetch<{ status?: string }>(…)`, close the dialog and reset the reason as today, then `if (res.status === 'running') return startRunningPoll()` before `load.execute()`. Because their `useAsyncAction` has a `success` toast, the "running" path would also show "fix ok": change their options to no `success` and send the success toast manually at the end of the non-running path: `sendUiNotif({ type: 'success', msg: t('fixOk') })` / `t('ackOk')`. Same for `linesRestore` (`t('linesRestoreOk')`). For `restore`, add `if (res.status === 'running') { restoreTarget.value = null; startRunningPoll(); return res }` before `load.execute()`.

- [ ] **Step 3: Template.** Next to the refresh button (~line 293), show progress while running:

```vue
        <v-chip
          v-if="state?.running"
          size="small"
          color="info"
          variant="tonal"
          class="ml-2"
        >
          <v-progress-circular
            indeterminate
            size="14"
            width="2"
            class="mr-2"
          />
          {{ t('running') }}
        </v-chip>
```

- [ ] **Step 4: i18n.** fr block:

```yaml
  running: Action en cours
  runningInBackground: L'action continue en arrière-plan sur ce jeu volumineux, l'état se mettra à jour à la fin.
```

en block:

```yaml
  running: Action in progress
  runningInBackground: The action continues in the background on this large dataset, the status will update when it ends.
```

(No ` : ` inside values.)

- [ ] **Step 5: Lint + manual check**

Run: `npm -w ui run lint && npm run check-types` (ratchet: `bash dev/check-types-ratchet.sh`).
Manual: on the dev stack, `curl -X POST localhost:$PORT/data-fair/api/v1/test-env/set-config -H 'content-type: application/json' -d '{"path":"integrity.adminSyncBudgetMs","value":1}'` (port from `.env`), open an enrolled REST dataset's integrity tab, click "Check": the info toast and the "Action in progress" chip appear, then the verdict refreshes. Reset the value to 20000 afterwards.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/dataset/dataset-integrity.vue
git commit -m "feat(ui): integrity panel follows admin actions running in the background

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Measurement, docs, and the gate default

**Files:**
- Create: `tests/features/integrity/lines-scale.api.spec.ts` (opt-in, skipped by default)
- Modify: `api/src/integrity/checker.ts` (one `debug` metrics line)
- Modify: `docs/architecture/integrity.md` (§3.3, §5 lines bullets, §10, §14), `api/src/integrity/README.md`
- Modify (conditional, Step 5): `api/config/default.cjs` `lines.maxLines`, `tests/features/integrity/lines.api.spec.ts:250` reset value

- [ ] **Step 1: Metrics debug line** — in `checkDataset`, record `const startedAt = Date.now()` at entry and a peak heap sampled in `drainCurrentLineKeys` (`peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)`); before the final `return`:

```ts
  debug('check done', { datasetId: dataset.id, durationMs: Date.now() - startedAt, lines: linesResult?.checked, peakHeapMB: Math.round(peakHeap / 1e6) })
```

- [ ] **Step 2: Opt-in scale spec** — create `tests/features/integrity/lines-scale.api.spec.ts`:

```ts
// Opt-in measurement for the lines gate (design 2026-10-15 §6) — NOT part of the normal suite.
// Run: INTEGRITY_SCALE_LINES=1000000 INTEGRITY_SCALE_API_PID=<dev-api node pid> \
//   npx playwright test --project api tests/features/integrity/lines-scale.api.spec.ts
// Records wall times and the API process peak RSS (sampled from /proc). Request counts follow
// from the sizes: LIST pages ≈ versions/1000, $in lookups ≈ lines/1000.
import { test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { axiosAuth, apiUrl, anonymousAx } from '../../support/axios.ts'
import { ensureIntegrityBucket, waitForLinesDrained } from '../../support/integrity.ts'

const LINES = Number(process.env.INTEGRITY_SCALE_LINES ?? 0)
const PID = process.env.INTEGRITY_SCALE_API_PID
test.skip(!LINES, 'set INTEGRITY_SCALE_LINES to run the integrity scale measurement')

const rssMB = async () => {
  if (!PID) return NaN
  const status = await readFile(`/proc/${PID}/status`, 'utf8')
  return Math.round(Number(/VmRSS:\s+(\d+)/.exec(status)![1]) / 1024)
}
const measure = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  let peak = await rssMB()
  const base = peak
  const sampler = setInterval(async () => { peak = Math.max(peak, await rssMB()) }, 500)
  const t0 = Date.now()
  try { return await fn() } finally {
    clearInterval(sampler)
    console.log(JSON.stringify({ label, lines: LINES, seconds: Math.round((Date.now() - t0) / 1000), rssBaseMB: base, rssPeakMB: peak }))
  }
}
const waitCheckAfter = async (ax: any, id: string, since: string) => {
  while (true) {
    const state = (await ax.get(`/api/v1/datasets/${id}/_integrity`)).data
    if (!state.running && state.lastCheck?.date > since) return state
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

test('lines integrity at scale', async () => {
  test.setTimeout(6 * 3600 * 1000)
  await ensureIntegrityBucket()
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.lines.maxLines', value: LINES })
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: `integrity scale ${LINES}`, schema: [{ key: 'label', type: 'string' }, { key: 'n', type: 'integer' }] })).data
  await measure('seed', async () => {
    for (let offset = 0; offset < LINES; offset += 10000) {
      const chunk = Array.from({ length: Math.min(10000, LINES - offset) }, (_, n) => ({ label: `line ${offset + n}`, n: offset + n }))
      await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, chunk)
    }
  })
  await measure('enable+backfill', async () => {
    await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
    await waitForLinesDrained(dataset.id, 6 * 3600 * 1000)
  })
  // churn: a second revision on 10% of the lines
  await measure('churn', async () => {
    const ids = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { size: 10000, select: '_id' } })).data.results.map((r: any) => r._id)
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, ids.map((_id: string) => ({ _action: 'patch', _id, label: 'churned' })))
    await waitForLinesDrained(dataset.id, 3600 * 1000)
  })
  for (const label of ['check', 'check (renewal due)']) {
    if (label === 'check (renewal due)') {
      await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.linesRenewal.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString() })
      await anonymousAx.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
    }
    await measure(label, async () => {
      const since = new Date().toISOString()
      const res = await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)
      const state = res.status === 202 ? await waitCheckAfter(ax, dataset.id, since) : res.data
      console.log(JSON.stringify({ label, verdict: state.lastCheck?.status ?? state.status, linesRenewal: state.linesRenewal }))
    })
  }
  // the other daily walks over the same data (design §5): O(objects) time, constant memory
  await measure('storage measurement', () => anonymousAx.post(`${apiUrl}/api/v1/test-env/integrity-storage/run`))
  await measure('purge', () => anonymousAx.post(`${apiUrl}/api/v1/test-env/integrity-purge/run`))
  // one tampered line, then _fix through the 202 path
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, { filter: { n: 42 }, update: { $set: { label: 'tampered' } } })
  await measure('_fix one line', async () => {
    const since = new Date().toISOString()
    const res = await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
    const state = res.status === 202 ? await waitCheckAfter(ax, dataset.id, since) : res.data
    console.log(JSON.stringify({ label: '_fix one line', verdict: state.lastCheck?.status ?? state.status }))
  })
})
```

The `test-env` routes used here already exist (`rest-collection-update-one`, `integrity-storage/run`, `integrity-purge/run`, `patch-dataset`, `set-config`); no router change is needed. The integrity storage/purge walks are bucket-wide, so on a shared dev bucket their figures include other test data — note that alongside the numbers.

- [ ] **Step 3: Run at 100k, then 1M** (dev stack must be healthy: `bash dev/status.sh`; ES and MinIO are memory-capped, see `docs/architecture/dev-resources.md`). Find the API pid with `pgrep -f "api/src/server"` (or ask the user). Run in the background and keep the console output:

```bash
INTEGRITY_SCALE_LINES=100000 INTEGRITY_SCALE_API_PID=<pid> npx playwright test --project api tests/features/integrity/lines-scale.api.spec.ts 2>&1 | tee /tmp/claude-scale-100k.log
INTEGRITY_SCALE_LINES=1000000 INTEGRITY_SCALE_API_PID=<pid> npx playwright test --project api tests/features/integrity/lines-scale.api.spec.ts 2>&1 | tee /tmp/claude-scale-1m.log
```

Report the JSON lines to the user. Expected shape: check peak RSS roughly flat between 100k and 1M (bounded memory); durations ~linear.

- [ ] **Step 4: Docs.**
  - `docs/architecture/integrity.md` — also record the storage/purge timings (§9 storage accounting, §3.5 purge) next to the gate figures. §5 lines "Check and renewal" bullet: replace the "folded page by page … O(distinct lines within the retention window)" sentence with the streamed compare (group fold, batched `$in`, insert-by-count, fingerprints only to name), renewal as its own per-key verified walk; "Enable, gate" bullet: the gate value and the measured figures from Step 3; "Repair" bullet: batch repairs; §3.3: the admin time budget (202, `integrity.running` display-only, why not a Mongo-flag worker) and the accepted nightly lock-hold cost; §10: link this design; §14: sampled windows + monthly full streamed pass as the >1M direction.
  - `api/src/integrity/README.md`, append under "Verdicts and alerts":

```md
17. **Ack filtering happens before capping** (`newAnomalyCollector`): capping first lets acked
    anomalies crowd out an unacked one — a false `ok` trail verdict.
18. **Lines renewal re-verifies each key** in its own walk (`clean` on the current view) and
    renews only clean latest anchors: `PutObjectRetention` carries no version id.
19. **The lines compare counts DISTINCT accounted lines**: a lineId emitted twice (forged
    non-canonical key) must not inflate the count and hide an insert.
20. **Admin work is never triggered from a Mongo flag**, and `integrity.running` is display-only
    (design 2026-10-15 §4): a flag-driven worker would let a Mongo writer bless their own tamper.
```

- [ ] **Step 5: Gate default (conditional — ask the user first).** Show the Step 3 figures and ask whether to move the default. Only on a yes: `api/config/default.cjs` `lines: { maxLines: 1000000 }`, and in `tests/features/integrity/lines.api.spec.ts:250` change the reset `value: 100000` to `value: 1000000`.

- [ ] **Step 6: Full verification**

Run: `npm run lint && npm run test-unit && npx playwright test --project api tests/features/integrity/ && bash dev/check-types-ratchet.sh`
Expected: all PASS; the scale spec reports as skipped.

- [ ] **Step 7: Commit**

```bash
git add tests/features/integrity/lines-scale.api.spec.ts api/src/integrity/checker.ts docs/architecture/integrity.md api/src/integrity/README.md api/config/default.cjs tests/features/integrity/lines.api.spec.ts
git commit -m "docs(integrity): streamed lines check at scale, measurement and invariants

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
