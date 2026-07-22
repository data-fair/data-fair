# Integrity A1 — Elasticsearch index consistency verdict (design)

> Status: **validated design, not yet planned**. Follows the A1 assessment in
> [2026-07-22-integrity-next-actions-notes.md](2026-07-22-integrity-next-actions-notes.md).
> Branch: `feat-integrity7` (stacked on `feat-integrity6`, which carries targets 1–3 and the
> hardening rounds). Read `docs/architecture/integrity.md` and `api/src/integrity/README.md`
> before implementing.

## 1. Goal and honest framing

Users read datasets through ES (`/lines`), not through the sources the integrity module
verifies. Today a direct ES write serves tampered data to every reader while all verdicts stay
green. This feature closes that gap with a **projection-consistency check**: join what users
can read (ES, through the alias) against the verified source of truth, and surface divergence
as a fourth breach member `'index'` in the existing verdict/alert/realert machinery.

This is *not* historization of ES (it remains a rebuildable projection) and it does not extend
the threat model: the sources compared against are themselves guarded (the file by the file
hash, Mongo lines by the lines verdict). `dataset.count` is *not* one of those guarded sources —
it sits on the metadata hash denylist (see the §3.1 correction below) — so for file datasets the
count compare is a cheap tripwire, hint-grade; the real grounding is the file-hash-covered
sampled windows / `?deep=true` compare (§3.2). The chain is:
locked store → source verdicts → **this check** → what is served.

Deliverable includes removing the honesty limits currently stated in
`docs/presentation-integrite-fr/04-perimetre.md` and architecture §12 — they may only be
removed when **both** dataset families are covered, which this design does.

## 2. Decisions taken (with the maintainer, 2026-07-22)

- **Both families in this branch** — file and REST datasets, one delivery.
- **One uniform mechanism, no dual path.** The notes assessed "exhaustive for REST, sampled
  for file"; the maintainer chose instead: **count check + seeded-random sampled windows for
  both families, every night; exhaustive only on demand** via the existing `?deep=true` on
  `POST /_check`. Only the *source adapter* differs per family.
- **Repair = panel one-click reindex** (superadmin, next to the index verdict, like restore),
  with divergence evidence written to the dataset journal before the reindex destroys it.

## 3. Mechanism

Runs inside `checkDataset` (nightly cron + on-demand `_check`), producing a third result
alongside the content check and the trail verdict.

### 3.1 Count check (every run, both families)

Compare the ES doc count **through the alias** (`aliasName(dataset)` — a diverted alias
pointing at a doctored index is an in-scope attack, so every ES access in this check goes
through the alias, never a physical index name) against the authoritative count:

- **REST**: live Mongo line count (non-deleted), the same collection the lines verdict guards.
- **File**: `dataset.count` — set by the indexer from `indexStream.i`, i.e. the number of rows
  *read from the file* (`index-lines.ts:222`), not an ES count, so there is no circularity;
  ~~it is covered by the metadata hash, so an adversary cannot silently adjust it.~~

  > **Correction (delivery):** `count` is in `EXCLUDED_TOP_LEVEL` (`api/src/integrity/operations.ts`)
  > — the metadata hash **denylist** — because it is an indexer-churn field: covering it would
  > WORM-churn a locked revision on every reindex. So `dataset.count` is *not* hash-covered, and a
  > Mongo-writing adversary *can* silently adjust it. The non-circularity point above still holds
  > (the count is derived from a file parse, not from ES), but the file-side count compare is a
  > cheap tripwire, hint-grade, not a proof: it instantly catches a bulk ES add/remove by an
  > adversary who does not also forge `dataset.count`. An adversary who forges both is still caught
  > — probabilistically each night by the sampled windows below (§3.2), and deterministically by
  > `?deep=true` — because both re-derive rows from the file itself, whose bytes *are* covered by
  > the file hash.

Any mismatch → diverged (the count pair is persisted in the verdict). This catches bulk
add/remove immediately, regardless of sampling luck (against an adversary who does not also
forge `dataset.count`; see the correction above).

### 3.2 Sampled windows (nightly, both families)

- A **fresh crypto-random seed per run**, never persisted before use — an adversary cannot
  predict which rows tonight's run will visit, so there is no permanently-safe row to tamper.
- The seed draws W random **`_i` pivots** in `[min_i, max_i]` (W and the per-window row count
  K are config, gate-bounded totals ~1000 rows/night). Pivots — not dense ranges — because
  REST `_i` is sparse and time-derived; "next K rows from `_i ≥ pivot`" bounds the cost
  identically on both sides and both families (file `_i` is dense 1..count, same code works).
- For each window, both sides produce the K-row slice in `_i` order:
  - **source side** re-derives the *full projected doc* (extension columns included — this is
    pure consistency vs the current source, none of the covered-body subtleties apply):
    - REST: Mongo query `_i ≥ pivot`, sort `_i`, limit K, projected the same way the indexer
      projects (strip transient flags, apply calculations).
    - File: the indexer's own read path (`readStreams` from `data-streams.ts`, extended file
      when extensions are active) with a skip/take on `_i`, plus the same
      `prepareCalculations` the index stream applies. One streaming pass serves all windows
      of the run (sorted pivots, early stop after the last window) — bounded by one file
      parse, no ES writes, far below reindex cost.
  - **ES side**: alias search `_i ≥ pivot`, sort `_i`, size K.
- Compare the two slices over the **intersection `_i` span** (up to the smaller side's last
  `_i`): join by `_id` for REST (the indexer uses the Mongo line `_id` as ES `_id`,
  `index-stream.ts:84`), by `_i` for file (ids are throwaway nanoids). A mismatching doc, a
  doc missing on either side within the span, or a duplicate → diverged. Doc comparison is a
  canonical deep-equal of the projected doc vs the ES `_source`.

### 3.3 Deep check (on demand, both families)

`POST /_check?deep=true` (existing route and semantics) sets one window covering everything:
pivot at `min_i`, no K limit, both sides streamed in `_i` order and compared exhaustively.
Same code path as 3.2 — deep is a parameterization, not a second mechanism.

### 3.4 Pending states → unknown

`_needsIndexing` lines, `_partialRestStatus` set, dataset not in a finalized/indexed state, or
a missing alias while a (re)index is in flight → the index verdict is `unknown`, the same
posture as the rest of the check; the existing check-stale alert bounds accumulated unknowns.
Draft state is ignored: the check compares the production alias against the production source.

> **Correction (delivery):** the claim that "the existing check-stale alert bounds accumulated
> unknowns" is wrong for a *per-verdict* index `unknown`. `integrity-check-stale` fires off
> `integrity.lastDefinitiveCheck`, which advances whenever the **overall** check completes
> definitively (`ok`/`breach`) — and the overall check stays definitive even while the `index`
> member alone is pinned to `unknown`. So a Mongo-writing adversary can pin the index verdict to
> `unknown` **indefinitely** — e.g. an orphaned `_needsIndexing: true` line with no relay hint, or
> a forged non-finalized `dataset.status`; both fields sit outside the metadata hash coverage — and
> the stale clock never trips for it. This is a **stated residual limit**, not bounded in this wave
> (see `api/src/integrity/README.md` A1 invariants and `docs/architecture/integrity.md` §A1). A
> proper fix would need a *per-verdict* freshness clock (a follow-up), not the overall one.

## 4. Verdict shape and alerting

`Check` gains:

```ts
index?: { checked: number, diverged: number, sample: string[], count?: { expected: number, actual: number } }
```

mirroring the lines verdict (`checked/diverged/sample`), and `'index'` joins the breach enum:
`['file', 'metadata', 'lines', 'index']` (types + `api/types/dataset/schema.js`). The sample
persists **evidence, not just ids**: up to N (~5) divergent entries with the join key and a
capped excerpt of expected vs actual doc (the reindex remedy destroys the live evidence, so it
must be captured at detection time; Mongo-resident, hence hint-grade like every persisted
verdict — the alert is the guarantee-bearing signal). Alerting, realert cadence, dedup and
check-stale need **no new machinery**: a non-empty breach array already drives them.

## 5. Repair surface

The integrity panel (`dataset-integrity.vue`) gets an **index section** mirroring the lines
section: verdict, count pair, diverged sample viewer, and a superadmin **reindex** button.
The action (new `POST /:datasetId/_integrity/index/_reindex`, superadmin like `_restore`):

1. writes the current divergence evidence to the dataset **journal** (survives the reindex),
2. triggers the standard reindex path (`status: 'analyzed'`-style re-derivation for file /
   full reindex for REST — reuse the existing superadmin reindex mechanics),
3. the next check verifies convergence; no silent auto-repair anywhere.

## 6. Config & testing hooks

- Config under the existing `integrity` block (+ env wiring like round 2): windows per run,
  rows per window, sample evidence cap. Defaults sized so a nightly run stays ≈ the existing
  Mongo scan cost.
- Determinism for tests: `_check` accepts an explicit seed (superadmin-only body/query param)
  so tests can aim windows at tampered rows. Production nightly runs never pass one.

## 7. Testing (API tests, `tests/features/integrity/`)

- REST: tamper an ES doc directly (test ES client, through the physical index) → check with
  aimed seed → `breach: ['index']`, sample carries the expected/actual pair; restore/reindex
  → next check ok.
- File: same via `_i`-aimed window; extension columns included in the compare.
- Delete an ES doc *outside* every sampled window → count check still flags it.
- Insert a surplus ES doc → count + window intersection flag it.
- Pending `_needsIndexing` / `_partialRestStatus` → index verdict `unknown`, no false breach.
- `deep=true` catches a tamper that sampled windows (fixed seed aimed elsewhere) miss.
- Alias diversion: point the alias at a copied, doctored index → breach (check reads the
  alias).
- Panel reindex action: evidence lands in the journal, reindex runs, verdict converges to ok.
- Unit: pivot/window derivation from a seed is pure (`operations.ts` style, per repo test
  conventions).

## 8. Docs to update on delivery

- `docs/architecture/integrity.md`: new section for the index verdict; **remove the §12
  stated limit** about ES not being covered.
- `docs/presentation-integrite-fr/04-perimetre.md`: remove the honesty lines; `02-garanties.md`
  adversary table gains the served-data row.
- `api/src/integrity/README.md` invariants: every ES access in the check goes through the
  alias; seed never persisted before use; evidence journaled before reindex.

## 9. Out of scope

- Historizing ES or verifying it against the locked store directly (the source verdicts
  already chain to the store).
- Virtual datasets (no own index; their children are covered individually).
- Attachment/thumbnail consistency; `_file.content` full-text extraction differences beyond
  what the projected-doc compare naturally covers (plan phase decides whether `_file.*` and
  `_attachment_url`-style derived fields join the compare or the exclusion set — mirror the
  indexer's own projection, nothing more).
- Level-3 prevention of ES writes.
