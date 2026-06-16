# `_geoshape` Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the calculated `_geoshape` field at ingest to a ~2MB vertex budget, so tiles/geojson/wkt/spatial-query read paths and ES storage stay bounded, while the raw geometry column keeps full precision.

**Architecture:** A new pure, config-free helper `geo-simplify.ts` (Douglas–Peucker via `@turf/simplify`, adaptive tolerance to a vertex budget) is called inside `geometry2fields` after `cleanCoords` and before the self-intersection repair + vtPrepare tiling. A global config knob `config.tiles.simplifyMaxVertices` (default 50000, `-1` disables) controls the budget. Raw geometry, downloads, exports, and default JSON are untouched.

**Tech Stack:** Node.js/TypeScript, `@turf/simplify@^7.2.0`, node-config (`api/config`), Playwright unit tests (`*.unit.spec.ts`).

Spec: `docs/plans/2026-06-15-geoshape-simplification-design.md`.

---

## File Structure

- Create `api/src/datasets/utils/geo-simplify.ts` — pure `countVertices` + `simplifyToVertexBudget` (no config/IO imports, so it is unit-testable in the `unit` Playwright project).
- Create `tests/features/datasets/geo-simplify.unit.spec.ts` — unit tests for the helper.
- Modify `api/package.json` — add `@turf/simplify`.
- Modify `package-lock.json` — add only the `@turf/simplify` node (minimal diff; the committed lockfile drifts ~12k lines under a full `npm install`).
- Modify `api/config/default.cjs` — add `tiles.simplifyMaxVertices`.
- Modify `api/config/type/schema.json` — declare the new config key; regenerate the type with `npm run build-types`.
- Modify `api/src/datasets/utils/geo.js` — import and call the helper in `geometry2fields`.

---

## Task 1: Add the `@turf/simplify` dependency (minimal lockfile diff)

**Files:**
- Modify: `api/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the dependency to `api/package.json`**

In the `dependencies` block, insert the line in alphabetical position between `@turf/rewind` and `@turf/unkink-polygon`:

```json
    "@turf/rewind": "^7.2.0",
    "@turf/simplify": "^7.2.0",
    "@turf/unkink-polygon": "^7.2.0",
```

- [ ] **Step 2: Install physically (lockfile will churn — that is expected)**

Run: `npm install`
Expected: completes; `node_modules/@turf/simplify` now exists. `git diff --stat package-lock.json` will show a large (~12k line) churn — this is pre-existing npm-version drift, not our change.

- [ ] **Step 3: Capture the exact `@turf/simplify` lockfile node npm produced**

Run:
```bash
node -e "const l=require('./package-lock.json'); console.log(JSON.stringify({['node_modules/@turf/simplify']: l.packages['node_modules/@turf/simplify']}, null, 2))"
```
Expected: prints a JSON object like:
```json
{
  "node_modules/@turf/simplify": {
    "version": "7.3.4",
    "resolved": "https://registry.npmjs.org/@turf/simplify/-/simplify-7.3.4.tgz",
    "integrity": "sha512-...",
    "license": "MIT",
    "dependencies": { "@turf/clean-coords": "...", "@turf/clone": "...", "@turf/helpers": "...", "@turf/meta": "...", "@types/geojson": "...", "tslib": "..." },
    "funding": { "url": "https://opencollective.com/turf" }
  }
}
```
Keep this output. (Exact version/integrity depend on the registry; do not hand-write them — use what this prints.)

- [ ] **Step 4: Discard the churned lockfile**

Run: `git checkout package-lock.json`
Expected: `git diff package-lock.json` is empty.

- [ ] **Step 5: Re-apply only the two intended lockfile edits**

Edit `package-lock.json`:

(a) In the `api` workspace `dependencies` block (near the top, after `"@turf/rewind": "^7.2.0",`), add:
```json
        "@turf/rewind": "^7.2.0",
        "@turf/simplify": "^7.2.0",
        "@turf/unkink-polygon": "^7.2.0",
```

(b) In the `packages` map, insert the captured `node_modules/@turf/simplify` node (the value from Step 3, without the wrapping object) in alphabetical position — immediately before the `"node_modules/@turf/square"` entry, or if absent, before `"node_modules/@turf/unkink-polygon"`. Locate the anchor with:
```bash
grep -n '"node_modules/@turf/\(rewind\|simplify\|square\|unkink\)"' package-lock.json
```

- [ ] **Step 6: Verify the lockfile is consistent and minimal**

Run:
```bash
node -e "require('./package-lock.json'); console.log('valid json')"
npm install --package-lock-only --no-audit --no-fund
git diff --stat package-lock.json
```
Expected: "valid json"; npm prints "up to date" with **no** further large rewrite; `git diff --stat` shows only a handful of changed lines. (If npm reports it must add other `@turf/*` transitive nodes, those are legitimate — accept them and re-run the verify; we expect none, since all are already present.)

- [ ] **Step 7: Commit**

```bash
git add api/package.json package-lock.json
git commit -m "build(api): add @turf/simplify dependency"
```

---

## Task 2: Add the `tiles.simplifyMaxVertices` config knob

**Files:**
- Modify: `api/config/default.cjs`
- Modify: `api/config/type/schema.json`
- Regenerate: `api/config/type/.type/` via `npm run build-types`

- [ ] **Step 1: Add the default value**

In `api/config/default.cjs`, change the `tiles` block from:
```js
  tiles: {
    geojsonvtTolerance: 4, // slightly higher simplification than default (3)
    vtPrepareMaxZoom: 10,
    maxThreads: 1
  },
```
to:
```js
  tiles: {
    geojsonvtTolerance: 4, // slightly higher simplification than default (3)
    vtPrepareMaxZoom: 10,
    maxThreads: 1,
    // geometries with more vertices than this are simplified (Douglas-Peucker) before
    // being stored in the calculated _geoshape field (used for tiles/geojson/wkt/spatial
    // queries); the raw geometry column is left at full precision. ~50000 verts ≈ 2MB.
    // -1 disables simplification.
    simplifyMaxVertices: 50000
  },
```

- [ ] **Step 2: Declare the key in the config schema**

In `api/config/type/schema.json`, find `properties.tiles` and add the property + required entry so the block becomes:
```json
    "tiles": {
      "type": "object",
      "required": [
        "geojsonvtTolerance",
        "vtPrepareMaxZoom",
        "maxThreads",
        "simplifyMaxVertices"
      ],
      "properties": {
        "geojsonvtTolerance": { "type": "number" },
        "vtPrepareMaxZoom": { "type": "number" },
        "maxThreads": { "type": "number" },
        "simplifyMaxVertices": { "type": "number" }
      }
    }
```

- [ ] **Step 3: Regenerate the config type**

Run: `npm run build-types`
Expected: completes without error.

- [ ] **Step 4: Verify the generated type includes the new key**

Run: `grep -n "simplifyMaxVertices" api/config/type/.type/index.d.ts`
Expected: one line `simplifyMaxVertices: number;` inside the `tiles` object.

- [ ] **Step 5: Commit**

```bash
git add api/config/default.cjs api/config/type/schema.json api/config/type/.type
git commit -m "feat(api): add tiles.simplifyMaxVertices config (default 50000)"
```

---

## Task 3: Pure `geo-simplify.ts` helper (TDD)

**Files:**
- Test: `tests/features/datasets/geo-simplify.unit.spec.ts` (create)
- Create: `api/src/datasets/utils/geo-simplify.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/features/datasets/geo-simplify.unit.spec.ts`:
```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { countVertices, simplifyToVertexBudget } from '../../../api/src/datasets/utils/geo-simplify.ts'

// deterministic many-vertex polygon (a sampled circle) for large-geometry cases
const circlePolygon = (n: number) => {
  const ring: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    ring.push([Math.cos(a), Math.sin(a)])
  }
  ring.push(ring[0])
  return { type: 'Polygon' as const, coordinates: [ring] }
}

test.describe('countVertices', () => {
  test('counts a Point as 1', () => {
    assert.equal(countVertices({ type: 'Point', coordinates: [1, 2] }), 1)
  })
  test('counts polygon ring vertices', () => {
    assert.equal(countVertices({ type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] }), 3)
  })
  test('sums multipolygon and geometrycollection', () => {
    const mp = { type: 'MultiPolygon', coordinates: [[[[0, 0], [0, 1], [1, 1], [0, 0]]], [[[5, 5], [5, 6], [6, 6], [5, 5]]]] }
    assert.equal(countVertices(mp as any), 6)
    assert.equal(countVertices({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }, mp] } as any), 7)
  })
})

test.describe('simplifyToVertexBudget', () => {
  test('returns the same geometry (identity) when already under budget', () => {
    const g = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] }
    assert.equal(simplifyToVertexBudget(g as any, 50000), g)
  })
  test('reduces an oversized geometry to <= budget', () => {
    const big = circlePolygon(20000)
    assert.ok(countVertices(big) > 5000)
    const out = simplifyToVertexBudget(big, 5000)
    assert.ok(countVertices(out) <= 5000, `expected <=5000 got ${countVertices(out)}`)
    assert.equal(out.type, 'Polygon')
  })
  test('is disabled when budget is -1 (identity even for a huge geometry)', () => {
    const big = circlePolygon(20000)
    assert.equal(simplifyToVertexBudget(big, -1), big)
  })
  test('passes geometries that @turf/simplify cannot handle through unchanged', () => {
    const mpt = { type: 'MultiPoint', coordinates: [[0, 0], [1, 1], [2, 2]] }
    assert.equal(simplifyToVertexBudget(mpt as any, 1), mpt) // over budget but unsupported type -> identity
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/features/datasets/geo-simplify.unit.spec.ts --project=unit`
Expected: FAIL — `Cannot find module '.../geo-simplify.ts'`.

- [ ] **Step 3: Implement the helper**

Create `api/src/datasets/utils/geo-simplify.ts`:
```ts
import type { Geometry } from 'geojson'
import simplify from '@turf/simplify'

// Reduce oversized geometries before they are stored in the calculated _geoshape
// field. _geoshape feeds tiles, geojson/wkt output and geo_shape/bbox queries; the
// raw geometry column is left untouched (full precision for downloads/exports).
//
// Douglas-Peucker via @turf/simplify is ~O(n log n) and ~20ms on a 97k-vertex
// MultiPolygon. Starting from a small tolerance and growing it x4 stops at roughly
// the least simplification that meets the budget, preserving maximum fidelity.

const BASE_TOLERANCE = 1e-7
const MAX_TOLERANCE = 0.1
const SIMPLIFIABLE = ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']

export const countVertices = (geometry: Geometry): number => {
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.reduce((n, g) => n + countVertices(g), 0)
  }
  let n = 0
  const walk = (coords: any): void => {
    if (typeof coords[0] === 'number') { n++; return }
    for (const c of coords) walk(c)
  }
  if ((geometry as any).coordinates) walk((geometry as any).coordinates)
  return n
}

export const simplifyToVertexBudget = (geometry: Geometry, maxVertices: number): Geometry => {
  if (maxVertices < 0) return geometry
  if (countVertices(geometry) <= maxVertices) return geometry
  if (geometry.type === 'GeometryCollection') {
    return { type: 'GeometryCollection', geometries: geometry.geometries.map(g => simplifyToVertexBudget(g, maxVertices)) }
  }
  if (!SIMPLIFIABLE.includes(geometry.type)) return geometry
  let out: Geometry = geometry
  let tol = BASE_TOLERANCE
  while (countVertices(out) > maxVertices && tol <= MAX_TOLERANCE) {
    out = simplify(geometry as any, { tolerance: tol, highQuality: false, mutate: false })
    tol *= 4
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/geo-simplify.unit.spec.ts --project=unit`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint, and verify no new type errors in the new file**

Run:
```bash
npx eslint api/src/datasets/utils/geo-simplify.ts tests/features/datasets/geo-simplify.unit.spec.ts
npm run check-types 2>&1 | grep -c "geo-simplify.ts"
```
Expected: eslint exits 0; the grep prints `0` (no type errors referencing the new file). If the grep is non-zero, inspect those lines and adjust the `simplify(...)` call typing (the `as any` on the argument is intentional to bypass the union-narrowing limitation).

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/utils/geo-simplify.ts tests/features/datasets/geo-simplify.unit.spec.ts
git commit -m "feat(datasets): add geo-simplify helper (vertex-budget Douglas-Peucker)"
```

---

## Task 4: Wire simplification into `geometry2fields`

**Files:**
- Modify: `api/src/datasets/utils/geo.js`

- [ ] **Step 1: Add the import**

In `api/src/datasets/utils/geo.js`, the helper import block already contains
`import { geometrySelfIntersects } from './geo-self-intersection.ts'`. Add next to it:
```js
import { geometrySelfIntersects } from './geo-self-intersection.ts'
import { simplifyToVertexBudget } from './geo-simplify.ts'
```

- [ ] **Step 2: Call the helper after `cleanCoords`, before the repair loop**

In `geometry2fields`, find:
```js
  const feature = { type: 'Feature', geometry }
  // Do the best we can to fix invalid geojson
  try {
    cleanCoords(feature, { mutate: true })
  } catch (err) {
    debug('Failure while applying cleanCoords to geojson', err)
  }
  const geometries = feature.geometry.type === 'GeometryCollection' ? feature.geometry.geometries : [feature.geometry]
```
and insert the simplify call between the `cleanCoords` try/catch and the `const geometries = ...` line:
```js
  const feature = { type: 'Feature', geometry }
  // Do the best we can to fix invalid geojson
  try {
    cleanCoords(feature, { mutate: true })
  } catch (err) {
    debug('Failure while applying cleanCoords to geojson', err)
  }
  // Simplify oversized geometries so _geoshape (and the tiles/geojson/wkt payloads
  // and spatial queries built from it) stay bounded. Runs before the self-intersection
  // repair (so repair operates on the reduced geometry and catches any kinks simplify
  // introduces) and before vtPrepare tiling. The raw geometry column is untouched.
  feature.geometry = simplifyToVertexBudget(feature.geometry, config.tiles.simplifyMaxVertices)
  const geometries = feature.geometry.type === 'GeometryCollection' ? feature.geometry.geometries : [feature.geometry]
```

- [ ] **Step 3: Lint and verify no new type errors**

Run:
```bash
npx eslint api/src/datasets/utils/geo.js
npm run check-types 2>&1 | grep -E "geo\.js" | grep -i "simplif" || echo "no new simplify-related type errors"
```
Expected: eslint exits 0; the second command prints "no new simplify-related type errors" (geo.js has many pre-existing untyped-`.js` errors, but none should mention the new `simplifyToVertexBudget`/`simplif...` usage).

- [ ] **Step 4: Re-run the helper unit test (regression sanity)**

Run: `npx playwright test tests/features/datasets/geo-simplify.unit.spec.ts tests/features/datasets/geo-self-intersection.unit.spec.ts --project=unit`
Expected: PASS (all). (The full geometry pipeline is covered by `tests/features/datasets/upload/geo-files.api.spec.ts`, which needs the dev stack; the pre-push hook runs the full suite.)

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/utils/geo.js
git commit -m "fix(datasets): simplify oversized geometries into _geoshape at ingest"
```

---

## Self-Review

- **Spec coverage:** goal/read-path (Task 4), vertex budget + `-1` disable + default 50000 (Tasks 2 & 3), adaptive-tolerance Douglas–Peucker pure helper (Task 3), ordering before repair/vtPrepare (Task 4), `@turf/simplify` dependency (Task 1), config plumbing incl. schema + generated type (Task 2), unit tests + existing API coverage note (Tasks 3 & 4), raw geometry untouched (Task 4 comment + no raw-path edits). Out-of-scope items (per-dataset opt-out, reject/warn, backfill) intentionally absent. ✔
- **Placeholder scan:** no TBD/“handle edge cases”; all code blocks complete. Lockfile version/integrity deliberately captured at runtime (Step 1.3) rather than hard-coded, since they depend on the registry. ✔
- **Type/name consistency:** `countVertices` and `simplifyToVertexBudget` named identically in helper (Task 3), test (Task 3), and caller (Task 4); config key `tiles.simplifyMaxVertices` identical across default.cjs, schema.json, and the geo.js call. ✔
