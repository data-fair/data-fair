# Admin Elasticsearch page — search tasks, shard cap, saturation guards

Date: 2026-05-13
Iteration on: `2026-05-13-admin-elasticsearch-page-design.md`

## Context

The admin Elasticsearch page currently lists long-running tasks in a single
table sorted by runtime. In practice the actionable signal is *long-running
search queries* — those are what point at a missing optimization. They're
mixed in with indexing, refresh, force-merge, and other admin tasks, which
makes them hard to spot and act on.

Two adjacent gaps:

- Search task descriptions already carry the request `source[{...}]` body
  but we expose it only as a 500-char truncated blob in the expanded row.
- The per-node `shards` count is shown without the cluster-imposed cap
  (`cluster.max_shards_per_node`, default `1000`), so there's no way to
  see if a node is approaching its allocation ceiling.

When the cluster is in trouble — saturated queues, many stuck searches —
the data we'd add can itself become large enough to make the diagnose
endpoint a contributor to load. Mitigations are part of the design.

## Goals

1. Separate long-running search queries from other long-running tasks in
   the UI, with search-specific details (parsed source query, dataset
   link) featured prominently.
2. Show the active shard count per node alongside the cluster cap, with
   a warning when a node is near its ceiling.
3. Keep the diagnose endpoint safe to call when the cluster is saturated:
   bounded payload, bounded CPU on parsing, bounded UI work.

## Non-goals

- No interactive task cancellation (use ES APIs directly for that).
- No historical trend / time-series — page is a point-in-time snapshot.
- No reformatting of write/admin task descriptions; only search source
  queries are pretty-printed.

## API changes

All file paths relative to `api/src/admin/`.

### 1. Task categorization (`elasticsearch-diagnose.ts`)

In `mapLongTasks`, classify each task by its `action`:

| Category | Match |
|---|---|
| `search` | `action.startsWith('indices:data/read/')` (covers `search`, `search[phase/query]`, `msearch`, `scroll`, `scroll/clear`) |
| `write`  | `action.startsWith('indices:data/write/')` |
| `admin`  | `action.startsWith('indices:admin/') \|\| action.startsWith('cluster:') \|\| action.startsWith('internal:')` |
| `other`  | anything else |

### 2. Source-query extraction (search tasks only)

When `category === 'search'`, parse the description's `source[{...}]`
token:

- Locate `source[` then walk forward counting `{`/`}` to find the
  matching `]`. This handles nested objects without depending on the
  position of `]` in the raw string.
- If the inner content is longer than `MAX_SOURCE_QUERY_CHARS` (50 000
  string characters — roughly ≤ 50 KB for typical ASCII queries), skip
  parsing and set `sourceQueryOversized: true`.
- Otherwise attempt `JSON.parse`. On success, set `sourceQuery` to the
  parsed object. On failure, leave both fields null.

New fields on `LongTask`:

```ts
category: 'search' | 'write' | 'admin' | 'other'
sourceQuery: object | null
sourceQueryOversized: boolean
```

The 500-char `description` truncation is kept as the universal fallback.

### 3. Per-category caps (saturation guard)

New config key:

```
elasticsearch.diagnose.maxLongTasksPerCategory  // default 100
```

`mapLongTasks` returns a new shape instead of a flat array:

```ts
type LongTasksByCategory = {
  search: { items: LongTask[], totalCount: number, truncated: boolean }
  other:  { items: LongTask[], totalCount: number, truncated: boolean }
}
```

`other` aggregates `write`, `admin`, and `other` categories — only
`search` is split out at the top level. The `category` field on each
item still drives the chip color in the "Other" table.

Sorting: within each bucket, sort by `runningTimeMs` desc, then slice to
`maxLongTasksPerCategory`. `totalCount` records the pre-slice length;
`truncated = totalCount > items.length`.

The cap applies to each of the two top-level buckets independently —
`other` is an aggregate of `write` / `admin` / `other` sub-categories
and gets a single shared budget, not one per sub-category.

### 4. Cluster allocation settings (`elasticsearch-diagnose-service.ts`)

Rename `_getWatermarks` → `_getClusterAllocSettings` and broaden its
return type:

```ts
{ lowPct, highPct, floodPct, maxShardsPerNode }
```

`cluster.max_shards_per_node` defaults to `1000` if not in
persistent/transient/defaults. Memoization stays at 60 s.

The setting is plumbed through to `mapNodes` and surfaced on each
`NodeSummary` as `maxShardsPerNode: number | null` (null only when the
settings call failed entirely — `safeSection` already handles the
fallback).

### 5. Endpoint response shape

The top-level `longTasks` array becomes the new `LongTasksByCategory`
object described above. The frontend is the only consumer; no external
clients depend on this shape. Existing API integration test is updated
accordingly.

## UI changes

All paths relative to `ui/src/pages/admin/elasticsearch.vue`.

### 1. Split long-tasks block into two cards

- **"Long-running search queries"** card — rendered first when
  `data.longTasks.search.items.length > 0`. Columns:
  - `running` (ms)
  - `dataset / index` (primary affordance — widen column; dataset link
    when known, falls back to `<code>{indexName}</code>`)
  - `node`
  - expand chevron
- Expanded row shows, in priority order:
  1. Pretty-printed `sourceQuery` JSON in a monospace `<pre>` when
     present.
  2. "Query too large to display inline" notice when
     `sourceQueryOversized` is true, with the raw 500-char
     `description` underneath.
  3. Raw 500-char `description` when extraction failed.
  Also list any additional `targets` beyond the first.

- **"Other long-running tasks"** card — rendered when
  `data.longTasks.other.items.length > 0`. Columns:
  - `category` (chip: `write` / `admin` / `other`)
  - `action`
  - `running`
  - `target` (first target — same dataset-or-index rendering as today)
  - `node`
  - expand chevron
- Expanded row shows raw `description` and additional targets — same as
  today's single table.

If both `items` arrays are empty, render a single "No long-running tasks
above the configured threshold" message instead of two empty cards.

### 2. Truncation banner

When `truncated === true` on either card, render a `v-alert` of type
`warning`, variant `tonal`, at the top of the card body:

> Showing top {N} of {totalCount}. The cluster may be saturated —
> investigate pending tasks, rejected thread-pool work, and stuck
> queries.

i18n key: `longTasks.truncated`.

### 3. Pagination

Drop `:items-per-page="-1"` on both long-tasks tables; default to 25.
Drop it on the unassigned-shards table as well (same exposure pattern,
even if the cap there is already enforced server-side via
`unassignedExplainCap` for the details fetch — the row count itself is
still unbounded).

### 4. Per-node shards column

Render the `shards` cell as `{n} / {max}` when `maxShardsPerNode` is
available. Append a `v-chip` of color `warning` (size `x-small`) when
`n >= 0.9 * max`. Fall back to current `{n}` rendering when
`maxShardsPerNode` is null.

i18n key: `nodes.shardCap` for the chip aria-label / tooltip.

## Tests

### Unit tests — `mapLongTasks`

- Tasks across all four `action` prefixes get classified into the
  expected category.
- `search` items end up in `out.search.items`; the rest in
  `out.other.items`.
- Sort is by `runningTimeMs` descending within each bucket.
- When a category has more than the cap, `items.length === cap`,
  `totalCount` equals the pre-slice count, `truncated === true`.

### Unit tests — source-query extraction

- A representative ES search description string yields a parsed object
  matching the embedded JSON.
- A description with no `source[...]` token (e.g., scroll-clear) yields
  `sourceQuery: null`, `sourceQueryOversized: false`.
- A description whose `source[...]` inner content is malformed JSON
  yields both flags null/false (treated as parse miss).
- A description whose `source[...]` inner content exceeds
  `MAX_SOURCE_QUERY_BYTES` yields `sourceQuery: null`,
  `sourceQueryOversized: true` — and crucially does not call `JSON.parse`
  (assert via spy or via timing of a contrived large input).

### Unit tests — `mapNodes`

- `maxShardsPerNode` from cluster settings is propagated to each
  `NodeSummary`. (Existing tests for the rest of the shape are not
  affected.)

### API integration test

Existing `/admin/elasticsearch/diagnose` test is updated to assert the
new `longTasks` shape (`{ search, other }`) and the presence of
`maxShardsPerNode` on each node.

## i18n keys

Both `fr` and `en`, under `admin/elasticsearch.vue` `<i18n>`:

```yaml
longTasks:
  searchTitle:    # "Long-running search queries"
  otherTitle:     # "Other long-running tasks"
  sourceQuery:    # "Source query"
  sourceQueryOversized:  # "Query too large to display inline"
  category:       # column header
  truncated:      # "Showing top {shown} of {total} — cluster may be saturated"
  none:           # reused as "No long-running tasks above the configured threshold"
nodes:
  shardCap:       # "Near per-node shard cap"
```

## Out of scope (future work)

- A "kill task" action.
- Surface per-thread-pool queue/rejected totals at the cluster level
  (currently only per-node).
- Track search-task frequency or duration as a time series.
