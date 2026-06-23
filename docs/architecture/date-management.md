# Date management

Dates are a recurring source of conflicting intuitions in Data Fair. This document settles the
strategy and explains how it is implemented end to end — from sniffing a CSV column to rendering a
cell in the table view. **When you change anything about how dates are parsed, stored, returned or
displayed, update this document.**

## The settled message

1. **A `date` is a timezone-less calendar date.** `2024-01-15` means the fifteenth of January,
   everywhere, for everyone. It is never shifted, never given a time, never given a timezone.

2. **A `date-time` is an absolute instant carrying the timezone of the data source.** Data Fair
   stores it *with its original UTC offset preserved* (e.g. `2024-01-15T10:00:00+01:00`), **not**
   normalized to `Z`. The offset is treated as meaningful information about *where/when the data was
   produced*, not noise to be discarded.

3. **A `date-time` is displayed in its own (source) timezone, not the viewer's.** A value authored
   as "10:00 in Paris" reads `10:00` to a user in Paris, in Tokyo and in New York alike. The cell is
   the same for everybody. We deliberately do **not** convert to the reader's browser timezone,
   because Data Fair is a faithful re-publisher of data, and a cell that changes meaning depending on
   who looks at it is a bug, not a feature.

4. **The reference timezone, when a value carries none, is the field's `timeZone`, defaulting to
   `config.defaultTimeZone` (`Europe/Paris`, env `DEFAULT_TIME_ZONE`).** This single default is used
   consistently for parsing, range-filter day boundaries and aggregations.

Everything below is a consequence of these four rules. The one historical place that violated rule 3
— the SPA table/preview formatter — was a regression and has been fixed (see
[History](#history-of-significant-decisions)).

> Note: rules 2–3 are about **data** date-time columns. System/metadata timestamps (`createdAt`,
> `updatedAt`, journal events, API-key expiry…) are ordinary UTC instants and *are* shown in the
> viewer's local timezone via `useLocaleDayjs`. That is intentional and orthogonal — those are "when
> did this happen for me", not "what does the data say".

## The pipeline, end to end

```
file/REST input ─► sniff (detect type+format) ─► format (normalize) ─► Elasticsearch _source
                        operations.ts                operations.ts        (type: date, verbatim string)
                                                                                │
   table / list / map ◄── formatValue ◄── GET /lines (returned as stored) ◄─────┤
   (own-tz display)       lines.ts        no reformatting, no locale param      │
                                                                                │
                          filters & aggregations (timezone-aware) ◄─────────────┘
                          es/commons.ts, es/values-agg.ts, es/metric-agg.ts
```

### 1. Detection & parsing — `api/src/datasets/utils/operations.ts`

`sniff()` infers a column's type from sample values, trying, in order: boolean → integer → number →
**date-time (by format list)** → date-time (RFC 3339 via ajv) → **date (by format list)** → date
(RFC 3339 via ajv) → string. The candidate formats are **French-first** and configurable
(`SniffDateConfig`); the defaults live in `api/config/default.cjs`:

```
dateFormats:     ['D/M/YYYY', 'D/M/YY', 'YYYY/M/D']
dateTimeFormats: ['D/M/YYYY H:m', 'D/M/YY H:m', …(',' variants)…,
                  'YYYY-MM-DDTHH:mm:ss', 'YYYY-MM-DD HH:mm:ss']
```

A detected date column gets `{ type: 'string', format: 'date'|'date-time', dateFormat|dateTimeFormat }`
in its schema. Parsing/validation uses **`moment-timezone`** in strict mode. `dateFormatsWithPadded()`
additionally accepts the zero-padded variant of each token (`D`→`DD`, …) to survive moment ≥ 2.30's
stricter matching.

`format(value, prop, fileProp, …, { defaultTimeZone })` is the **normalizer** applied to every cell
on ingest:

| schema | normalized stored form | timezone handling |
|---|---|---|
| `format: 'date'` | `moment(value, fmt).format('YYYY-MM-DD')` | none — pure calendar date |
| `format: 'date-time'` (known format) | `moment.tz(value, fmt, prop.timeZone ‖ default).format()` | interpreted in field tz, **offset preserved** in output |
| `format: 'date-time'` (no format, already ISO) | left as-is if valid RFC 3339 | a source `Z` stays `Z`; a source offset stays |
| `format: 'date-time'` (no format, naive) | `moment.tz(value, null, prop.timeZone ‖ default).format()` | naive input gets the field/default offset attached |

The per-field `timeZone` is overridable through the schema (`PATCH` the field), so a dataset whose
naive timestamps are really Honolulu time can declare `timeZone: 'Pacific/Honolulu'` and be parsed
correctly.

The same pure logic is reused for JSON/NDJSON and REST inputs (`data-streams.ts` calls
`fieldsSniffer.format()` per property). `fields-sniffer.ts` is the thin wrapper that injects
`config.defaultTimeZone`; the testable logic is in `operations.ts` (see
[testing](./testing.md)).

### 2. Storage — Elasticsearch (`api/src/datasets/es/operations.ts`)

Both `date` and `date-time` map to Elasticsearch **`type: 'date'` with no explicit `format`** (ES
default `strict_date_optional_time`). ES parses the string to epoch-millis for its own indexing, but
the **`_source` keeps the verbatim string** — including the offset. This is *why* offset preservation
works: nothing in the storage layer rewrites the value.

### 3. API read — `api/src/datasets/es/commons.ts` (`prepareResultItem`)

`GET /datasets/:id/lines` returns dates **exactly as stored**. There is:

- **no reformatting** of date values on read (only `flatten()` for nested keys / separators),
- **no timezone conversion** on read,
- **no locale parameter** on the API.

The API is the single source of truth: it hands out the stored ISO string and lets the consumer
decide how to render it. (Exports — CSV/XLSX/ODS — likewise serialize the stored value.)

### 4. Filters & aggregations are timezone-aware — `es/commons.ts`, `es/values-agg.ts`, `es/metric-agg.ts`

Reading is verbatim, but *querying* needs a reference timezone to be meaningful:

- **Range filters** (`_gte`/`_lte`/`_gt`/`_lt`, and the event-range `date_match`): when the user
  passes a bare `YYYY-MM-DD` (length 10) against a `date-time` field, the boundary is expanded to
  start/end-of-day **in the field's timezone** (`prop.timeZone ‖ config.defaultTimeZone`) before
  hitting ES. A full ISO string passed by the user is used as-is (the `length === 10` guard, added in
  `efce7c7af`, exists precisely so we don't re-apply a timezone to a value that already has one).
- **`date_histogram`** aggregations pass `time_zone: field.timeZone ‖ defaultTimeZone` to ES so bucket
  boundaries align to local midnights.
- **`min`/`max`/`percentiles` metrics** reformat their result with the field timezone (`metric-agg.ts`):
  `date` → `YYYY-MM-DD`, `date-time` → `moment.tz(value, field.timeZone ‖ default).format()`.
- **`values` (terms) aggregations** on a `date` field trim the ES `key_as_string` back to 10 chars.

### 5. Display — `ui/src/composables/dataset/lines.ts` + `format-date-logic.ts`

`formatValue()` is the single UI formatter used by the table view, the list/card view and (now) the
map popups. It renders:

- `date` → `localeDayjs.dayjs(value).format('L')`. `value` is a bare `YYYY-MM-DD`, which dayjs parses
  as **local midnight**, so `L` shows the same calendar date in every timezone. Safe.
- `date-time` → `dateTimeInOwnTimeZone(localeDayjs.dayjs, value).format('lll')`.

`dateTimeInOwnTimeZone` (in the Vue-free, unit-tested `format-date-logic.ts`) implements rule 3:

```
if value is a string ending in an offset (…+HH:MM / …-HH:MM):
    re-apply that offset → render in the data's own timezone   (dayjs + utc plugin, utcOffset())
else (…Z, or no offset at all):
    plain dayjs(value)  → UTC values fall back to the viewer's timezone
```

The `Z` fallback is deliberate and matches the legacy Vue 2 behaviour: a value explicitly stored as
UTC carries no *source* timezone to honour, so the viewer's timezone is the least-surprising choice.
Locale (FR/EN) for month names and `L`/`lll` patterns comes from `useLocaleDayjs`
(`@data-fair/lib-vue`), driven by the session language.

### 6. Making the timezone visible — column "Description" + cell title

Showing a date-time in its source timezone is faithful but, on its own, ambiguous: `10:00` gives no
hint of *which* zone it is, nor what it would be in UTC or in the reader's own time. Two affordances
(both built on `format-date-logic.ts`, the helpers unit-tested) close that gap without cluttering the
grid:

- **Column "Description"** (`dataset-table.vue` computes `dateTimeColumnZone(header)` and passes it as
  `timeZoneLabel` to `dataset-table-header-menu.vue`): the column header menu's *Description* section
  states *"Les horodatages sont affichés dans le fuseau horaire de la donnée : {zone}"* / *"Times are
  shown in the data's own timezone: {zone}"*, e.g. `Europe/Paris (UTC+1)`. The zone **name** comes
  from `field.timeZone` (when declared) and the **offset** from a real cell of that column
  (`dateTimeZoneLabel`), so it is DST-correct for the data actually shown. When the column's values
  are displayed in the viewer's own timezone (UTC-stored / offset-less) the label is omitted — the
  per-cell title clarifies instead.
- **Cell `title`** (`dataset-table-value.vue`, `dateTimeBreakdown`): each date-time cell carries a
  native `title` (a plain multi-line tooltip) giving the value in its **source** zone, in **UTC**, and
  in the **viewer's** timezone — skipping any line that would merely repeat the source. The title is
  set only when there is more than one distinct line (i.e. the equivalents actually differ for this
  viewer); such cells get a discreet dotted underline / `cursor: help` as the only decoration.

`formatUtcOffset` renders the compact `UTC` / `UTC+1` / `UTC+5:30` labels; the viewer's zone name comes
from `Intl.DateTimeFormat().resolvedOptions().timeZone`.

## Golden rules / invariants

- A `date` value is 10 characters, no `T`, no timezone. Treat it as a label, never as an instant.
- Never call bare `dayjs(value)` / `new Date(value)` to display a **data** `date-time` — that shifts
  it to the viewer's timezone. Use `formatValue` / `dateTimeInOwnTimeZone`.
- The stored offset is data. Don't "normalize to Z" on ingest; don't strip it on read.
- When you need a reference timezone (parsing, filter boundaries, aggregation buckets), it is always
  `field.timeZone ‖ config.defaultTimeZone` — never the server's tz, never the viewer's tz.
- Pure date-logic belongs in a `*-logic.ts` module (excluded from UI auto-import, re-exported by its
  composable) so it can be unit-tested directly — see `format-date-logic.ts` and its spec.

## Known edge cases & rationale

- **"The date is one day off."** Almost always rule 3 being violated somewhere (a raw `dayjs(value)`
  shifting a near-midnight `date-time` across the date line for a viewer in a different tz), or a
  `date` accidentally parsed as a UTC instant. Check the value is going through `formatValue`.
- **Mixed offsets in one column.** Possible if the source data carries per-row offsets. Each cell is
  shown in *its own* offset; the column can look inconsistent, but every cell is individually
  faithful. Declaring a field `timeZone` and re-ingesting normalizes the column.
- **UTC (`Z`) data.** Shown in the viewer's timezone by design (no source tz to preserve); the cell
  `title` still exposes the UTC value so nothing is hidden. If a dataset wants a *fixed* display
  timezone for UTC data, that is a future enhancement (a per-field "display timezone"), not a bug in
  the current model.
- **Naive timestamps (`2024-01-15 10:00:00`).** Interpreted on ingest in the field/default timezone
  and stored with that offset attached; from then on they behave like any offset-bearing value.

## History of significant decisions

- `57c03d4c6` (2024-04) — established the storage philosophy: *"format will store the timezone info,
  it is a richer info than always storing with Z suffix; when showing the date it is preferred to use
  parseZone and show the data in the original time zone instead of moving to the user's time zone."*
  Also added per-field secondary `dateFormat`/`dateTimeFormat`/`timeZone` for REST datasets.
- `18762cac7` (2024-02) — fixed dayjs timezone use in ES query building (added the `utc` plugin).
- `efce7c7af` (2024-03) — stopped applying a timezone to a range-filter value that is already a full
  ISO string (the `length === 10` guard).
- `b87e0507d` (2025-11) — corrected date formatting in `values-agg`/`metric-agg` so aggregation
  results respect the field timezone.
- `7fbc18f62` (2025-12) — timezone parameter for compat-ods range filters.
- **Vue 3 rewrite (`0109a44e0`, #337)** — the regression: the SPA table/preview formatter switched to
  `dayjs(value).format('lll')`, which converts `date-time` to the *viewer's* timezone, and the
  `parseZone` behaviour was left commented out as a TODO. This silently contradicted the backend
  philosophy (and the legacy Vue 2 `cell-values.js`, which had the correct `Z`→viewer /
  offset→`parseZone` split). Restoring rule 3 via `dateTimeInOwnTimeZone` closes this gap; map popups
  and list cells, which previously showed raw ISO / browser-tz values, now go through the same
  formatter.

## File map

| Concern | File |
|---|---|
| Sniff + normalize (pure) | `api/src/datasets/utils/operations.ts` (`sniff`, `format`) |
| Config injection wrapper | `api/src/datasets/utils/fields-sniffer.ts` |
| Default formats & timezone | `api/config/default.cjs` (`defaultTimeZone`, sniff formats), env `DEFAULT_TIME_ZONE` |
| ES mapping | `api/src/datasets/es/operations.ts` |
| Read / range filters | `api/src/datasets/es/commons.ts` |
| Aggregations | `api/src/datasets/es/values-agg.ts`, `api/src/datasets/es/metric-agg.ts` |
| UI formatter | `ui/src/composables/dataset/lines.ts` (`formatValue`) |
| UI date logic (own-tz, offset/zone labels, breakdown — unit-tested) | `ui/src/composables/dataset/format-date-logic.ts` |
| Table: derive column zone label | `ui/src/components/dataset/table/dataset-table.vue` (`dateTimeColumnZone`) |
| Column menu "Description" zone note | `ui/src/components/dataset/table/dataset-table-header-menu.vue` (`timeZoneLabel` prop) |
| Table/card: cell zone `title` | `ui/src/components/dataset/table/dataset-table-value.vue` |
| Map popups | `ui/src/components/dataset/map/use-map.ts` |
| Unit test | `tests/features/datasets/format-date.unit.spec.ts` |

## Config reference

| Key | Env | Default | Effect |
|---|---|---|---|
| `defaultTimeZone` | `DEFAULT_TIME_ZONE` | `Europe/Paris` | Reference timezone for parsing, range-filter day boundaries and aggregations when a field has no explicit `timeZone`. |
