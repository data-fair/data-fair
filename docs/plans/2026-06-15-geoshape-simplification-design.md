# `_geoshape` simplification at ingest — design

Date: 2026-06-15
Branch: `fix-large-geom`
Status: design, pending implementation

## Problem

data-fair stores, for every geo-enabled dataset row, a calculated `_geoshape`
field (a cleaned/repaired GeoJSON geometry) derived from the raw geometry column
by `geometry2fields` (`api/src/datasets/utils/geo.js`). Geometries are never
size-bounded anywhere in the pipeline. A real dataset
(`cartham-plateau-du-cap-corse-polygones.csv`) contains single MultiPolygons of
up to **3.9 MB / 97,505 vertices**.

The acute indexing OOM caused by these geometries has already been fixed
separately (commit `6718f2cd4`: brute-force `@turf/kinks` O(n²) self-intersection
detection replaced by the `sweepline-intersections` sweep-line, O((N+K) log N)).

This spec addresses the **remaining, ongoing** cost of multi-MB geometries on the
read path — primarily on-the-fly vector tiles, which reload the full `_geoshape`
and run geojson-vt on it **per request** in a `maxThreads: 1` pool, plus
geojson/wkt payload size and Elasticsearch storage.

## Goal

Optimize the read path by **simplifying the `_geoshape` field at ingest** so it
never holds an absurdly large geometry, while leaving the **raw geometry column
untouched** (full precision preserved for downloads/exports). This realizes the
intent already noted in `api/src/datasets/es/operations.ts:188`
("Do not index geometry, it will be copied and **simplified** in `_geoshape`"),
which was never implemented (see the `// check if simplify is a good idea?` TODO
at `geo.js:189`).

This is a **performance improvement with a fidelity-preserving cap**, not an
aggressive trim: only geometries exceeding the budget are touched.

## Background — how geometries flow (verified)

- `geometry2fields` parses a **copy** of the raw value; the original column is
  stored in ES `_source` as `index:false` (string) / `enabled:false` (object) —
  kept, not indexed (`operations.ts:189`).
- **`_geoshape` (derived, simplified-to-be)** is consumed by: GeoJSON & WKT API
  output (`result2geojson` / `result2wkt`), vector tiles, `geo_shape`
  spatial/bbox queries, aggregations.
- **Raw geometry column (full precision)** is consumed by: indexing input,
  default `/lines` JSON results (`commons.js:195` keeps it in default `_source`),
  file download, and the regenerated "extended/full" export file
  (`data-streams.js` streams `JSON.parse(geometry)` per row).
- Resilient paths (unaffected, already streamed/bounded): file downloads,
  extended-file generation, pre-computed `vtPrepare` tiles at serve-time,
  page-size-bounded exports (`maxPageSize: 10000`, tile 10 MB guard at
  `router.js:878`).

Therefore simplifying `_geoshape` changes tile/geojson/wkt/spatial-query precision
for very large features but **does not** affect downloads, exports, or default
JSON (those use the raw column).

## Design

### Behaviour

Inside `geometry2fields`, after `cleanCoords` and **before** the rewind +
self-intersection repair step and before the `vtPrepare` tiling block, simplify
the geometry down to a vertex budget when (and only when) it exceeds that budget.

Ordering rationale:
```
readGeometry → (reproject) → cleanCoords → ★ simplifyToVertexBudget ★
  → rewind → self-intersection repair (sweepline + unkink) → centroid/bbox
  → _geoshape = geometry → (vtPrepare tiling)
```
- Simplifying first makes every downstream step cheaper (repair runs on
  thousands of vertices, not ~100k; vtPrepare tiles built from the light geometry).
- Douglas–Peucker can introduce or remove self-intersections, so the existing
  repair must run **after** simplification — it already does, since repair stays
  in its current position.

### Vertex budget (calibrated to ~2 MB)

- Config: `config.tiles.simplifyMaxVertices`, default **50000**
  (≈ 2 MB of GeoJSON at ~40 bytes/vertex, measured on the cartham data).
- `-1` disables simplification entirely (matches the `defaultLimits` "-1 =
  unlimited" convention already used across the config).
- Measured by **vertex count** (cheap O(n) traversal, no big-string allocation
  on the small-geometry majority), not serialized bytes.

### Adaptive-tolerance algorithm (pure, config-free helper)

New module `api/src/datasets/utils/geo-simplify.ts`, mirroring the config-free,
unit-tested shape of `geo-self-intersection.ts`:

```ts
// counts coordinate pairs across Point/LineString/Polygon/MultiPolygon/GeometryCollection
export const countVertices = (geometry: Geometry): number => { ... }

// returns the geometry simplified to <= maxVertices, or unchanged if already under
// budget, or unchanged when maxVertices < 0 (disabled).
export const simplifyToVertexBudget = (geometry: Geometry, maxVertices: number): Geometry => {
  if (maxVertices < 0) return geometry
  if (countVertices(geometry) <= maxVertices) return geometry        // common case: untouched
  let tol = BASE_TOLERANCE                                            // e.g. 1e-7 degrees
  let out = geometry
  while (countVertices(out) > maxVertices && tol <= MAX_TOLERANCE) {  // MAX_TOLERANCE e.g. 0.1
    out = simplify(geometry, { tolerance: tol, highQuality: false, mutate: false })
    tol *= 4
  }
  return out
}
```

- Starting from a small tolerance and growing ×4 stops at roughly the **least**
  simplification that meets the budget, preserving maximum fidelity.
- `@turf/simplify` supports LineString/MultiLineString/Polygon/MultiPolygon;
  Points pass through. For `GeometryCollection`, simplify each supported
  sub-geometry (the helper dispatches/recurses). Exact `simplify` invocation
  shape per geometry type is an implementation detail to confirm against
  `@turf/simplify@7.2.0`.
- `geo.js` calls `simplifyToVertexBudget(geometry, config.tiles.simplifyMaxVertices)`.

### Dependency

Add `@turf/simplify` (`^7.2.0`, Douglas–Peucker). Verified cost on the
97,505-vertex geometry: ~20 ms / a few MB — ~2,800× cheaper than the old kinks,
not a new bottleneck. Its runtime deps (`@turf/clean-coords`, `@turf/clone`,
`@turf/helpers`, `@turf/meta`, `tslib`, `@types/geojson`) are already in the tree.
Lockfile must be hand-edited for a minimal diff (committed lockfile drifts ~12k
lines under a full `npm install` — see project memory).

### Config plumbing

- Add `simplifyMaxVertices: 50000` to the `tiles` block in
  `api/config/default.cjs`.
- Mirror in any config schema / type / custom-environment-variables files that
  enumerate `tiles.*` (to confirm during implementation).

## Accepted trade-offs

- `_geoshape`-derived outputs (tiles, geojson, wkt, `geo_shape`/bbox spatial
  queries) become slightly less precise for very large features near their
  boundaries. Raw exports/downloads and default JSON remain exact.
- Per-dataset opt-out is **out of scope** (global config only; YAGNI until a
  precision-critical dataset needs it).
- No hard reject/warn and no separate `vtPrepare` cap — simplification already
  de-risks both.

## Testing

- **Unit** (`tests/features/datasets/geo-simplify.unit.spec.ts`, config-free):
  - geometry under budget returned unchanged (identity);
  - geometry over budget reduced to `<= maxVertices`;
  - `maxVertices = -1` disables (identity even for a huge geometry);
  - non-polygon geometries (Point/LineString) pass through;
  - `countVertices` correct for Polygon, MultiPolygon, GeometryCollection.
  Use a synthetically generated large polygon (e.g. a many-point circle) so the
  test is deterministic and self-contained.
- **Existing API coverage**: `tests/features/datasets/upload/geo-files.api.spec.ts`
  ("Fix some polygons", geojson/wkt/tiles) exercises the full pipeline once the
  dev stack is up; the pre-push hook runs the full suite.

## Out of scope

- Changing the raw geometry column or any download/export path.
- Per-dataset capability flag.
- Hard-cap / reject / warn behaviour for over-size geometries.
- Re-simplifying already-indexed datasets (applies to new ingests; an upgrade
  script/backfill, if wanted, is a separate change).
