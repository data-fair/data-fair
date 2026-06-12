# T15 — ES response handling is the last big read-path lever

Handoff document for a future session. Context: the 2026-06 perf campaign
(`benchmark/perf-scan-notes.md`, `benchmark/results/EXPERIMENTS.md`) fixed the node-side hot
loops (T1, T14); what remains on large `/lines` pages is dominated by *receiving, parsing and
re-emitting JSON*, not by our own processing.

## Evidence (main-thread CPU profile, 2026-06-12, all campaign fixes applied)

Captured with `GET http://localhost:<DEV_OBSERVER_PORT>/cpu-profile?duration=20000` while
`large-page-json` + `large-page-csv` ran at 10 connections (analyzer script pattern: aggregate
self-time from samples/timeDeltas; ~17.6 s busy of 20.3 s sampled):

| busy CPU | frame | meaning |
|---|---|---|
| ~37% | `_parse @ secure-json-parse` | ES client parsing the ES response body |
| ~15% | `write @ node:string_decoder` | decoding ES response bytes to string |
| ~18% | `stringify`/`json @ express/response` | serializing OUR response (T13) |
| ~8.5% | GC | allocation pressure from the above |
| ~3.5% | `update` (crypto) | express default ETag MD5 — T5, closed as not-worth-it |
| ~3% | `prepareResultItem` | post-T1 residue |

So ~52% of main-thread CPU is the ES response path and ~18% the output path. On default
size=20 pages all of this is negligible (the request is ES-latency-bound at ~11 ms) — **T15 only
matters for large pages, exports, wide datasets, compat-ods-style consumers.**

## Where the code is

- The `/lines` ES call: `api/src/datasets/es/search.ts` (~line 36) — `client.transport.request`
  with an explicit `querystring` object → adding `filter_path` is a one-line change there.
- ES client construction: `api/src/es.ts` — `@elastic/transport` accepts a custom `serializer`
  at client construction (`node_modules/@elastic/transport/lib/Transport.js:236`,
  `serialize`/`deserialize` class) → injection point for a plain-`JSON.parse` deserializer.
- `_source` list construction: `api/src/datasets/es/commons.js` (~line 193) — default `_source`
  enumerates every schema key; an `excludes`-based form is constant-size.
- Output serialization: `res.send(result)` in `readLines` (`api/src/datasets/router.js`, end of
  readLines) — the monolithic stringify (T13).

## ⚠️ Steps 1-3 MEASURED AND REJECTED (2026-06-12, same day)

The "easy parts" were implemented and A/B-measured (fresh process per arm, 11 byte-identical
equivalence probes incl. zero-hit/collapse/aggs — the correctness approach works and is
documented in the harness):

- `filter_path` (step 1) shrinks the ES response body by a measured **18%** (3.97 MB → 3.29 MB
  for 10k rows)… and changes **nothing measurable** end-to-end (json 23→22 req/s, csv 20→19,
  wide-list 119→118 — all within noise).
- plain `JSON.parse` deserializer (step 2): also no measurable change.

**Why**: the profile frame attributed to `secure-json-parse._parse` is dominated by the
`JSON.parse` builtin called *inside* it (self-time attribution artifact); the poisoning regex
scan is comparatively cheap. The irreducible cost is parsing the `_source` payload itself, which
neither step touches. Both changes were reverted (the serializer dropped a security layer for
nothing; filter_path adds a response-shape allowlist that future consumers must remember to
extend).

**Conclusion: only step 4 (passthrough) can move this block.** Steps 1-3 below are kept for
reference but should NOT be retried in isolation. Step 1 may still be bundled into step 4 if
passthrough lands (less bytes to slice through).

## Stepped plan (measure after each step, stop when the curve flattens)

1. **`filter_path`** (cheap, do first). What readLines actually consumes from the response:
   `timed_out`, `hits.total`, `hits.hits._id`, `hits.hits._score`, `hits.hits._source`,
   `hits.hits.highlight`, `hits.hits.sort` (last hit only, for the `next` cursor),
   `hits.hits.fields` (vector tiles `_vt`), `aggregations` (collapse total). Everything else
   (`_index`, `_shards`, `took`, per-hit `_type`) is parsed and thrown away today.
   ⚠️ check: ES `filter_path` may drop `_score: null` entries entirely — interacts with T17
   (`_score: null` currently serialized in every row; decide the compat question together).
   ⚠️ aggregation endpoints (values-agg, geo-agg) have different needs — scope to search.ts first.
2. **Plain JSON.parse deserializer**: subclass the transport `Serializer`, override
   `deserialize` to use `JSON.parse` (keep the prototype-poisoning protection for *request*
   serialization; the poisoning risk is in our own response handling — assess whether
   `__proto__` keys can occur in `_source`: field keys are schema-validated, so injection
   surface is dataset field *values*, which JSON.parse handles safely as plain values).
   Could roughly halve the ~37% block; measure before keeping.
3. **`_source` excludes** instead of full field enumeration for wide schemas (request-side,
   small).
4. **End-game — passthrough serialization (absorbs T13)**: for the JSON format without
   transformative params (no truncate/html/thumbnail/wkt/geo_distance...), per-hit `_source`
   could be sliced as raw bytes/strings from the ES response and concatenated into our response
   with only the envelope (`total`, `next`, `_id`/`_score` injection) generated — the CSV-JIT
   approach applied to JSON. This skips parse AND stringify for the row bodies (~55% of
   main-thread CPU combined). Significant complexity: needs the flatten no-op case
   (flat schemas), `_attachment_url` rewriting (search.ts post-processing currently mutates
   `_source`), and a JIT/memoized "can passthrough?" decision per (dataset, query). Only do it
   if steps 1-3 leave large-page throughput unsatisfying.

## Measurement protocol

- Scenarios: `large-page-json`, `large-page-csv`, `wide-list` (+ `simple-list` as the
  no-regression guard), `npm run benchmark -- --scenarios=...`.
- A/B with fresh server process per arm, PID + code-marker asserted (see BASELINE.md
  "Protocol caveats" — nodemon reloads in ~2 s; never compare across hours).
- Re-profile with the observer `GET /cpu-profile?duration=20000` under load after each step —
  the goal is watching the `secure-json-parse` / `string_decoder` / `stringify` blocks shrink.
- ES response sizes: compare `content-length` (already captured as `esResponse.contentLength`
  in search.ts) before/after `filter_path`.

## Expected ceiling

If steps 1-2 remove half the parse block and step 4 is skipped: roughly +25-35% throughput on
large pages. Full passthrough (step 4) targets the combined ~70% block: plausibly another
×1.5-2 on large-page throughput, at real complexity cost.
