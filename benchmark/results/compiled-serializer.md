# Compiled fused `(hit) → jsonString` serializer vs `flatten + prepareResultItem + JSON.stringify`

Measurement + de-risked prototype for the `/lines` **json** output hot path. Does baking a
`new Function('hit', …)` that emits the JSON string directly (for the PLAIN query fast-path) beat the
current generic per-row path of `flatten(source)` → `prepareResultItem` mutations → `JSON.stringify(obj)`?

- Bench: `benchmark/src/compiled-serializer/bench.ts`
- Node v24.16.0, `--expose-gc --max-semi-space-size=256` (self-re-exec, uniform young gen so GC does not
  distort ms), release build, strip-types (no native build).
- Imports the **real** `getFlattenNoCache`, `prepareResultItem`, `prepareResultContext` (config pointed at
  `api/config`). No production file under `api/src/` was modified.
- 10000 deterministic hits (mulberry32 PRNG, no `Math.random`/`Date.now`) over an ~18-column schema mixing
  strings, integer/number, booleans, a date + date-time string, ONE nested key (`a.b`), ONE separator
  (multivalued) field (`tags`), plus a markdown `body` and description `note` so the RICH query has real work.
- **Equivalence gate FIRST, timing second.** For every one of the 10000 + 8 adversarial hits, the compiled
  string must be byte-identical (`===`) to `JSON.stringify(prepareResultItem(...))`. DISQUALIFY (throw) on any
  diff. Both compiled encoders passed for all 10008 hits.
- `prepareResultItem` mutates `hit._source` in place, so every timed run gets a **fresh `structuredClone`**
  of the input set (cloning is OUTSIDE the timed region), identically for every substrate.
- Median of 9 timed runs, 3 warmup; `[min-max]` spread shown. Two independent clean runs (no CPU contention).

## Per-substrate median ms / 10000-row serialize

| Substrate | run 2 | run 3 | spread (run 2) |
|---|--:|--:|---|
| flatten-only | 7.84 | 8.29 | 7.69–8.41 |
| flatten + prepareResultItem (transform, no stringify) | 8.51 | 8.70 | 8.31–9.62 |
| **BASELINE-plain** (transform + `JSON.stringify`) | **26.02** | **26.82** | 25.88–27.93 |
| **COMPILED-plain** (json-encode: `JSON.stringify` per value) | **18.49** | **18.80** | 17.90–19.42 |
| COMPILED-plain (typed-encode: inline ternary) | 19.22 | 19.35 | 18.63–19.50 |
| BASELINE-rich (`html=true` + `truncate=20`) | 1080.8 | 1093.3 | 1070.9–1107.0 |

## Win factor (baseline-plain / compiled-plain)

| Encoder | run 2 | run 3 |
|---|--:|--:|
| COMPILED json-encode (`JSON.stringify` per value) | **1.41×** | **1.43×** |
| COMPILED typed-encode (inline typed ternary) | 1.35× | 1.39× |

The fused compile removes ~7.5 ms per 10000 rows (26.0 → 18.5 ms). The **typed** encoder is consistently
**slower** than just calling `JSON.stringify` per value, because V8's `JSON.stringify` on a single primitive
is already extremely well optimized and the value width here is string-dominated (strings still go through
`JSON.stringify` for escaping under both encoders), so the typed ternary only adds branch overhead. **Recommend
the json-encode approach** (`JSON.stringify(value)` per value) — it is both simpler and faster.

## Breakdown of the plain baseline (where the 26 ms goes)

| Stage | ms | share |
|---|--:|--:|
| flatten-only | 7.84 | 30% |
| flatten + prepareResultItem (full transform) | 8.51 | 33% |
| generic `JSON.stringify` of the transformed object | 17.52 | **67%** |

Two thirds of the plain-path cost is the **generic `JSON.stringify`** of the intermediate object, only one
third is the flatten + transform. The fused serializer wins by fusing the transform with a bespoke stringify
(baking constant `"key":` prefixes, resolving values straight off `hit._source`, no intermediate object
materialized) — but it still pays `JSON.stringify` **per string value** for escaping, which is why the win is
~1.4× and not larger. It does not, and cannot cheaply, beat V8's native full-object stringify by a wide margin.

## Rich query cost (fast path can't apply)

BASELINE-rich (`html=true` + `truncate=20`) = **1080.8 ms** vs plain 26.0 ms → **~41.5× per row**. When the
query toggles html/markdown (marked + sanitize-html per markdown/description field) the per-row cost is
dominated entirely by markdown rendering; the serializer is noise there. So the fused fast path only matters
for **plain** queries (no html/thumbnail/highlight/truncate/wkt/geo_distance) — which is the common
`/lines` case (table browsing, data export, app data fetches). For rich queries the compile must fall back to
the existing `prepareResultItem` path.

## Verdict — is the fused compile worth it?

**Marginal-to-modest. ~1.41× (−29% ms) on the plain-query serialize step only, and DONE_WITH_CONCERNS.**

- The win (7.5 ms / 10000 rows ≈ 0.75 µs/row) is real and repeatable, but it is only the **serialize** slice.
  In the full `/lines` request, ES query + search-stream parse + network dominate; this optimization shaves a
  fraction of CPU on the response-building tail. It is worth doing **only** if `/lines` serialize CPU is shown
  to be a hot spot in a real profile (large pages, wide rows, high QPS). It is not a headline win.
- It adds a **second JIT-compiled, memoized code generator** parallel to `flatten.ts`, with a hard byte-identity
  contract against `prepareResultItem`. That is real maintenance surface and a correctness risk (see below).
- Recommendation: keep it **behind the plain-query fast path**, memoized on `(datasetId, finalizedAt, select,
  arrays)` exactly like `flatten`, and **fall back** to the current path for any rich query. Use the
  **json-encode** (JSON.stringify-per-value) variant. Do not ship the typed encoder — it is slower and
  strictly riskier on number formatting.

## Byte-identity risks the production impl MUST respect

The gate proved these are handled by this prototype; a production port must preserve every one:

1. **Key order.** `JSON.stringify` emits own-enumerable keys in insertion order. `flatten` appends flattened
   nested keys (`a.b`) at the END (after deleting the parent `a`), then `prepareResultItem` appends `_score`
   then `_id`. The compiler derives the exact order by running the REAL `flatten` on a fully-populated probe
   once at compile time — do NOT hand-order from the schema.
2. **Undefined vs null.** A key whose resolved value is `undefined` must be **omitted** (matches
   `JSON.stringify` object semantics); a `null` value must be **emitted as `null`**. `_score = undefined`
   (missing) must be omitted too. Per-value `if (v !== undefined)` guard, `_score`/`_id` included only when set.
3. **Separator (multivalued) fields.** Only `Array.isArray(v)` gets `.join(separator)` — a plain
   `Array.prototype.join` (which renders `null`/`undefined` elements as `""` and numbers via `String`),
   exactly as `flatten` does. Scalar / null / absent tags pass through unchanged. Do NOT use the map-based
   join variant used elsewhere — it would differ on `null` elements.
4. **Nested-key resolution.** Mirror `flatten`: prefer a literal `source["a.b"]` if present, else
   `source["a"]?.["b"]`; parent object is not emitted. `a` present but `a.b` undefined ⇒ key omitted.
5. **String escaping.** Must be byte-identical to `JSON.stringify`'s escaping (quotes, backslash, `\n\t\r`,
   control chars, unicode incl. astral pairs). The only safe way is to call `JSON.stringify(str)` for string
   values — do not hand-roll an escaper.
6. **Number formatting.** For finite numbers `String(n) === JSON.stringify(n)` (incl. `-0 → "0"`, `1e21`,
   `1e-7`, `0.1+0.2`), but `NaN`/`±Infinity` must become `null` (JSON semantics) whereas `String` yields
   `"NaN"`/`"Infinity"`. The typed encoder guards this — but since json-encode (recommended) delegates to
   `JSON.stringify`, this risk only exists if someone reintroduces a typed fast path.
7. **`selectIncludesId`.** `_id` is appended only when `hasIdField && (no select | select === '*' | select
   includes _id)` — the compile must key on `select` and re-derive this, matching `prepareResultContext`.
8. **Fast-path gating.** The compiled path is valid ONLY when the query has none of
   `html`/`thumbnail`/`highlight`/`truncate`/`wkt`/`geo_distance`/`_c_geo_distance`/`draft` AND the source has
   no `_attachment_url` needing rewrite / no `_geopoint` for geo_distance. Any of these ⇒ fall back to
   `prepareResultItem`. (`fillNull`, virtual-dataset attachment rewrite, and `_highlight` blocks are all
   outside the plain path and untested by this prototype.)

## Reproduce

```
node --expose-gc --experimental-strip-types --disable-warning=ExperimentalWarning \
  benchmark/src/compiled-serializer/bench.ts
```
