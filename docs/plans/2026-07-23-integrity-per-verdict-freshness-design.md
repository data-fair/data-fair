# Integrity — per-verdict freshness clock (index) — design

Status: **approved 2026-07-23** — closes the stated residual limit of the A1 index-consistency
wave (`2026-07-22-integrity-index-consistency-design.md` §3.4 correction,
`api/src/integrity/README.md` A1 invariants).

## 1. The gap

`integrity-check-stale` fires off `integrity.lastDefinitiveCheck`, which advances whenever the
**overall** check completes definitively (ok/breach, `checker.ts` final `$set`). The `index`
verdict member is the **only** member that can be individually `unknown` while the overall check
stays definitive — every other pending shape (`_needsHistorizing`, stamped lines, missing anchor,
terminal-residue) downgrades the *whole* check to `unknown`, and the trail verdict is binary
(`ok`/`altered`). So a Mongo-writing adversary can pin the index verdict to `unknown` forever —
an orphaned `_needsIndexing: true` line with no relay hint, or a forged non-finalized
`dataset.status`, both outside hash coverage — without ever tripping the stale alert, and the
"silence is an anomaly" posture does not hold for the one verdict that guards what readers
actually see.

## 2. Design

Minimal, targeted: one new clock for the one member that needs it.

- **`integrity.lastDefinitiveIndexCheck`** (ISO date-time, beside `lastDefinitiveCheck` in the
  dataset schema): advanced in the same final `$set` as the overall clock, **only when
  `indexResult.status !== 'unknown'`** (`ok` or `diverged` are both definitive).
- **Seeding:** `enableIntegrity` seeds it alongside `lastDefinitiveCheck` (a never-checked
  enrollment trips the alert after `maxUnknownDays` instead of staying silent); the
  `seedDefinitive` net in `checkDataset` seeds both clocks on datasets enrolled before the field
  existed. Because the index clock only advances where the overall clock advances, the invariant
  `lastDefinitiveIndexCheck <= lastDefinitiveCheck` holds everywhere.
- **Sweep:** `alertStaleChecks` gains a second query —
  `lastDefinitiveIndexCheck < cutoff AND lastDefinitiveCheck >= cutoff` (precisely the
  pinned-index shape; the conjunct avoids double-alerting a dataset the overall loop already
  caught, sound because of the ordering invariant above) — firing the **same**
  `integrity-check-stale` event with a **distinct dedup key** `index-check-stale`, the exact
  two-sources-one-event pattern `integrity-renewal-failed` already uses for dataset-vs-lines
  renewal, so one condition recovering never clears the other's re-alert cadence.
- **Recovery:** the definitive-path clear in `checkDataset` keeps clearing the overall dedup;
  a second clear for `index-check-stale` runs only when the index verdict was definitive this
  pass.
- **No new config:** reuses `integrity.maxUnknownDays` and `integrity.realertDays`.

Mongo-residency of the clock is the accepted posture (identical to `lastDefinitiveCheck` and the
alert dedup map, architecture §3.3): pre-writing it suppresses at most a window per write, and no
Mongo-resident state survives a *sustained* write adversary.

## 3. Alternatives rejected

- **Generalized `integrity.lastDefinitive.{member}` map** — churn without benefit while `index`
  is the only independently-unknowable member; trivially adoptable later if another member gains
  an `unknown` state.
- **Downgrading the overall verdict when index is `unknown`** — already rejected in the A1
  design; would couple lock renewal (which runs only on a fully-ok pass, and whose failure is
  the one path to permanently lost repairability) to ES availability, and erase the real
  file/metadata/lines/trail verdicts for a routine transient.

## 4. Tests

`tests/features/integrity/index.api.spec.ts`:

- pinned index verdict (orphaned `_needsIndexing`, the adversary shape) + backdated index clock
  fires `integrity-check-stale` while the overall clock is fresh; dedup holds on a second run;
- a definitive index pass advances the clock and clears the `index-check-stale` dedup;
- enable seeds the field.
