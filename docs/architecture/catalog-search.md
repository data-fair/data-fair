# Catalog search

How `q=` on `GET /api/v1/datasets` and `GET /api/v1/applications` ranks results: an inverted
term index owned by data-fair, scored with BM25/dis_max inside a Mongo aggregation, replacing
MongoDB's built-in `$text` search for these two collections.

For the design reasoning (why an owned index instead of `$text` or Elasticsearch, the alternatives
costed and rejected) read [the spec](../plans/2026-09-18-text-search-util-design.md). For the
measured evidence behind that choice — precision/recall numbers, the engines that were actually
benchmarked — read [`benchmark/catalog-search/ENGINE-OPTIONS.md`](../../benchmark/catalog-search/ENGINE-OPTIONS.md).
The implementation plan and its task-by-task ledger (real bugs found and fixed along the way,
several of them silent) live under `.superpowers/sdd/2026-09-18-text-search-util-plan/`.

## Which collections switched, which did not

- **Switched to the owned index**: `datasets`, `applications`.
- **Still on MongoDB `$text`**: `remote-services`, `base-applications`, `activity`. Their `q=`
  routes never pass a `textFilter` to `misc/utils/find.ts`, so `findUtils.query` and `basePipeline`
  fall back to `query.$text = { $search: reqQuery.q }` — see `find.ts`'s own fallback branch. There
  is no plan to convert them; the owned index exists because datasets/applications searches are
  the ones users actually run and the ones the `$text` engine ranked badly.

The module itself lives entirely under `api/src/misc/utils/text-search/` and is written to be
extractable to `@data-fair/lib-utils`/`@data-fair/lib-node` later (see the plan's "Extraction"
follow-up) — every file except `collections.ts` has zero imports from the rest of data-fair.
`collections.ts` is the ONLY file allowed to import data-fair modules (`#config`, `#mongo`); it is
where the two shipped definitions (`datasetsTextSearch`, `applicationsTextSearch`) and the
data-fair-specific stats providers live.

## What a query does now

`GET /api/v1/datasets?q=...` (mirrored for `applications`):

1. `datasetsTextSearch.plan(q, datasetsStats, ownerScope)` parses `q` (`query.ts`), fetches corpus
   statistics for the terms involved (`stats.ts`), and returns a `QueryPlan` — or `null` if no
   positive term survives (every term unknown to the corpus, or a query of only negations).
2. **A `null` plan means NO RESULTS, never an unfiltered list.** `datasets/service.ts` and
   `applications/service.ts` both do:
   ```ts
   const textFilter = reqQuery.q ? (plan ? datasetsTextSearch.matchFilter(plan) : { _id: null }) : undefined
   ```
   `{ _id: null }` is the "match nothing" filter. This is the single most important line in the
   whole wiring: get it wrong (e.g. treat `null` as "no filter") and a nonsense search returns the
   entire catalogue. It is guarded by
   `tests/features/text-search/search-behaviour.api.spec.ts` ("a query whose every term is unknown
   returns NOTHING, not everything").
3. `matchFilter(plan)` builds `{ _terms: { $in: plan.gate, $nin?: plan.negated }, $expr?: <phrase> }`.
   `$expr` is a normal query operator, so this same filter object is used for `countDocuments()`,
   `find()` and the `$match` stage of an aggregation without any translation — the property that
   `count === results.length` (for `size` large enough) rests on, including for phrase queries.
4. `scoreExpression(plan)` computes a dis_max BM25 score per document, only when the request is
   relevance-sorted (`relevanceSorted = !!plan && !reqQuery.sort`) — an explicit `?sort=` skips the
   `$addFields`/expression-sort cost entirely and uses the plain `find()` path.
5. `sortSpec()` returns `{ _score: -1, [tieBreakField]: 1 }` (default tie-break field: `id`).
   **Never sort on `_score` alone.** Exact ties are common (e.g. two datasets with the same shape
   ranking identically for a broad query) and MongoDB leaves ties in an unspecified order without a
   deterministic secondary key. Guarded by
   `search-behaviour.api.spec.ts` ("tied scores return a stable order across identical calls").

### The results query drops the `en` collation when there is a text filter

MongoDB will only use an index to serve a string predicate when the query's collation matches the
index's. The `terms` (`{_terms: 1}`) and `owner-terms` (`{owner.type, owner.id, _terms}`) indexes in
`api/src/mongo.ts` are **simple**-collation, so issuing `{_terms: {$in: [...]}}` under
`{locale: 'en'}` degrades to a COLLSCAN of the whole collection — measured on the dev instance:
`IXSCAN keys=201 docs=100` uncollated vs `COLLSCAN keys=0 docs=2000` collated. The old `$text` path
was exempt because a text index ignores collation.

So both services compute `const resultsOptions = textFilter ? {} : { collation: { locale: 'en' } }`
and pass it to the aggregate *and* the `find()`. Nothing is lost: with `q=` the default sort is
`sortSpec()`'s numeric `_score`, where collation is a no-op. The browse path (no `q=`, where
`sort=title` ordering actually matters) keeps the collation exactly as before. Note the residual
effect on the *tie-break* key: `sortSpec()`'s secondary key is the string `id`, so score ties now
order in byte order rather than `en` order — still deterministic, which is all the tie-break is for.

The collation must **not** be added to the indexes instead: `countDocuments(query)`,
`findUtils.facetsQuery` and `findUtils.sumsQuery` all filter on `_terms` uncollated and are
correctly index-served today; a collated index would break those three to fix one, and collating the
facets aggregation would risk collapsing `"A"` and `"a"` into one `$group` bucket.

`ownerScopeOf` (`misc/utils/find.ts`) narrows corpus stats and the candidate gate to a single owner
when the request implies one (an unambiguous single `owner=` filter, or a publication site whose
caller says it restricts the result set to the site owner — `siteOwnerOnly`). This is the largest
scaling lever in the design: on a 200k-document instance an owner-scoped portal query examines ~321
documents instead of ~62,360, because the compound `{owner.type, owner.id, _terms}` index gates by
owner first. Returning `undefined` is always correct, only slower — anything ambiguous (several
owners, a negated owner) must return `undefined` rather than guess.

A publication site is **not** on its own such a scope. `findDatasets` outside catalog mode
deliberately keeps OTHER owners' master-data datasets in a site's list (`masterData.*.active`), so
scoping the statistics to the site owner counted `df = 0` for a term that occurs only in one of
them; `planQuery` then dropped the term as unknown to the corpus, and a single-term query fell
through to the `{_id: null}` "match nothing" filter — zero results for a dataset sitting right
there in the list. Hence `siteOwnerOnly`: only a caller whose own publication-site filter is a
strict owner equality may ask for the narrowing — the catalog route (`catalogMode`, which filters
on `publicationSites`) and `findApplications` (which filters on `owner.type`/`owner.id`) qualify;
`findDatasets` outside catalog mode does not. **Neither qualifying call site passes it yet**, so a
publication-site request currently plans against the whole corpus: correct, and slower than it
needs to be. Wiring `{ siteOwnerOnly: options.catalogMode }` in `datasets/service.ts` and
`{ siteOwnerOnly: true }` in `applications/service.ts` restores the lever. Guarded by
`search-behaviour.api.spec.ts` ("a foreign-owned master-data dataset stays findable from a
publication site").

## Stored index fields, and what writes them

Every document in `datasets`/`applications` carries, when indexed content exists:

| field | what it is |
|---|---|
| `_terms` | every distinct stem in the document — the multikey-indexed candidate gate |
| `_pos` | `field → stem → raw token positions`, sanitised field keys (see below); term frequency is the position array's length |
| `_len` | `field → number of indexed tokens`, used to normalise BM25 by field length |
| `_searchIndex` | `{ v: <definition version>, at: <ISO timestamp> }`, bumped whenever the index was (re)computed |
| `_needsSearchIndex` | present and `true` only while a document is waiting for the worker to recompute it |

All five are in `INDEX_FIELD_NAMES` (`pipeline.ts`). What the API actually excludes is
`RESPONSE_EXCLUDED_FIELD_NAMES` = those five **plus `_score`**: `findUtils.project` builds an
EXCLUSION projection when `select` is absent, so anything not excluded there leaks — kilobytes of
position arrays plus corpus-shape statistics, and (because `$addFields` injects `_score` before
`$project`) a raw BM25 float on every relevance-sorted row. The same list drives the `clean()`
deletes on both collections. Guarded end-to-end by
`tests/features/text-search/response-hygiene.api.spec.ts`.

Datasets index `title`, `searchTerms`, `summary`, `description`, `keywords`, `topics.title`,
`owner.name`, `owner.departmentName` and `_searchText` (the schema-derived text: column titles and
the head of their descriptions — see [Dataset Validation](dataset-validation.md) for
`_searchText`'s own computation). Applications
index `title`, `summary`, `description`, `owner.name`, `owner.departmentName`. Weights mirror the
old `fulltext` `$text` index's weights so ranking didn't regress on migration.

### `_pos`/`_len` keys are sanitised

`fieldKey(path)` (`definition.ts`) replaces `.` with `_`. `def.fields` keeps the real dotted paths
(`'topics.title'`, `'owner.name'`) because `extractFieldValue` still reads the source document by
that dotted path — but `_pos`/`_len` are written and read under the sanitised key. A dotted key
written literally (`_pos.topics.title.<term>`) is unaddressable from an aggregation path expression
(`$_pos.topics.title.<term>` is read by Mongo as a NESTED path traversal `topics → title`, not a
literal key lookup) and silently scores zero — the document still matches via `_terms` but never
ranks. This was a real, review-caught bug (plan ledger, Ruling P11); `validateDefinition` now
rejects two field paths that would collide after sanitisation.

## The two-tier recompute: inline vs `_needsSearchIndex`

Two ways a document's index gets (re)computed:

1. **Inline**, synchronously, inside the write path — `searchIndexPatch`/`applicationIndexPatch`
   (`api/src/datasets/utils/search-text.ts` and the applications equivalent). This is what runs on
   dataset/application create, on a metadata PATCH that touches indexed content, on a permissions
   change, and inside the settings `catalogSearch` sweep (recomputed inline there because that sweep
   already streams every one of the owner's datasets — deferring to the worker would only add a
   staleness window with no saving).
2. **Deferred**, via the worker — a document is stamped `_needsSearchIndex: true` and the
   `computeDatasetSearchIndex`/`computeApplicationSearchIndex` tasks (`api/src/workers/tasks.ts`,
   `api/src/workers/short-processor/index.ts`) pick it up on `mongoFilter: () => ({ _needsSearchIndex: true })`,
   rebuild `_terms`/`_pos`/`_len`, stamp `_searchIndex`, and `$unset _needsSearchIndex`. Both go
   through the shared `drainSearchIndex` helper, which owns the two rulings below.

### The deferred recompute re-reads the stored document

It does NOT index the resource the dispatcher handed it. `../index.ts` merges a pending draft into
the resource before dispatching ANY task (`Object.assign(dataset, dataset.draft)`), and this index
describes the **published** dataset — so a draft title or a draft column label would otherwise
land in the published `_searchText`/`_terms`, findable by everyone, for a dataset
whose draft may never be validated. Both tasks therefore re-read with `findOne({ id })` and index
that. A document deleted between selection and execution reads back as nothing and the task writes
nothing at all (the flag included — it went with the document). Applications have no drafts; theirs
re-reads too, to keep the two recomputes symmetrical and to index the stored document rather than a
snapshot captured at selection time. Guarded by `recompute.api.spec.ts` ("the recompute indexes the
published dataset, not a draft merged in by the dispatcher").

### A failed recompute clears the flag anyway

Every other worker task filters on `status`, so a failure changes what it matches and it stops
selecting itself. These two are selected on `_needsSearchIndex: true` **and nothing else**: letting
the error escape to the generic handler would leave the flag set, `loop()` would re-select the
document immediately, and a permanently failing document would become a tight loop writing an
`error` journal entry per round — flagging an otherwise healthy resource `status: 'error'` from a
task that is bookkeeping and writes no journal by design, and, for applications, stranding it in
`error` forever because `applicationTasks` has no `errorRetry`.

So `drainSearchIndex` swallows the failure, reports it through
`internalError('search-index-recompute', …)`, and clears `_needsSearchIndex` regardless. The
document keeps its PREVIOUS, stale index until its next write recomputes it. That is the same
failure mode `markStale` already trades in (see below) — staleness, visible in logs, resolved by
the next real write — chosen over a loop that no operator can stop. Guarded by
`recompute.api.spec.ts` ("a failing recompute clears the flag instead of erroring the resource and
looping").

### `markStale` is the contract for bulk writers

`markStale(collection, filter)` (`api/src/misc/utils/text-search/mark-stale.ts`) just does
`updateMany(filter, { $set: { _needsSearchIndex: true } })`. **Anything that mutates indexed
content without going through `searchIndexPatch`/`applicationIndexPatch` must call `markStale`, or
the index silently rots** — the document keeps matching its OLD text forever, with no error, no
log, nothing to notice short of a user reporting stale search results.

`$text` never had this problem: it self-maintained on every write, automatically, as a MongoDB
index. An owned index does not — it is regular document fields that only change when code changes
them.

Current callers, both bulk writers that patch fields directly with `updateMany` (bypassing
`applyPatch`):

- **`api/src/identities/service.ts`, `renameIdentity`**: an identity (user/org) rename bulk-`$set`s
  `owner.name`/`owner.departmentName` across every owned dataset/application, then calls
  `markStale` on the same filter — those two fields are indexed, so the bulk write staleifies every
  owner-name token and the worker recomputes them.
- **`api/src/misc/utils/topics.ts`, `updateTopics`**: a topic rename or delete bulk-`$set`/`$pull`s
  `topics.$` across datasets (and applications, for the non-indexed fields). `topics.title` is
  indexed for datasets, and this bypasses `applyPatch`/`searchIndexPatch` entirely — without the
  `markStale` call here, a renamed topic would never reach `_terms`, and a dataset would keep
  matching only its OLD topic name, indefinitely. (Applications carry no `topics` in their
  definition, so their branch does not call it.)

If you add a new bulk writer — an upgrade script, an admin bulk action, anything using
`updateMany`/`bulkWrite` on `datasets`/`applications` outside `applyPatch` — and it touches any
field in `datasetsTextSearch.definition.fields` (or `applicationsTextSearch.definition.fields`),
call `markStale` on the same filter, or document explicitly why staleness is safe in that direction
(see the INVARIANT comment at the top of `api/src/datasets/utils/search-text.ts` for the one
accepted exception: `deleteIdentity` stripping a restrictive permission grant can only make search
results OVER-restrictive, never leak).

### The recompute trigger is derived from the definition, not hardcoded

`applyPatch` (`api/src/datasets/service.ts`) decides whether a PATCH touches indexed content like
this:

```ts
const INDEXED_TOP_LEVEL = new Set(
  Object.keys(datasetsTextSearch.definition.fields).map(path => path.split('.')[0])
)
const touchesIndexedContent = Object.keys(patch).some(key => INDEXED_TOP_LEVEL.has(key)) ||
  !!patch.schema || !!patch.permissions
```

This is deliberate: `_terms`/`_pos`/`_len` derive from far more fields than the old
schema-derived `_searchText` did (title, summary, description, keywords, topics, owner names,
searchTerms, `_searchText` itself). A hardcoded field list here would silently go stale the next
time a field is added to either definition — whoever adds the field would need to remember a
second place to update. Deriving it from `datasetsTextSearch.definition.fields` means adding a
field to the definition is enough; the trigger widens automatically. `patch.schema` and
`patch.permissions` are checked unconditionally in addition (not only together), because a
permissions-only patch changes what `_searchText`/the index is allowed to expose (see
"guardedParts" in `search-text.ts`) even with no schema change in the same patch — this covers the
integrity-restore metadata path, which restores `permissions` alone.

Recompute is skipped for drafts (`dataset.draftReason`/`patch.draftReason`): the indexed fields
describe the *published* dataset.

### A zero document frequency is never memoized

`createStatsProvider` (`stats.ts`) memoizes per-term document frequency (`df`) for 5 minutes to
keep query planning cheap. **A `df` of exactly zero is the one value that must NEVER be cached.**
`planQuery` drops any term whose `df` is 0 as "unknown to the corpus" (see `query.ts`). If a term's
zero count were cached: a user creates a dataset with a novel word, searches for it once before it
finishes indexing (or before their own search populates the corpus with that word), that search
caches `df(word) = 0` for 5 minutes — and every search for that word, by anyone, returns nothing
for the rest of the TTL, even after the content is indexed. One unlucky search poisons the term for
the whole instance. This was a real bug caught only by an empirical probe against a fake collection
after two failed code-reading diagnoses (plan ledger, Ruling P25) — `countTerm.delete(term, key)`
runs whenever `df === 0`, so an absent term is simply recounted on every query (cheap: it is an
empty index range).

## `config.catalogSearch.language` is a MongoDB name, not ISO

`config.catalogSearch.language` (e.g. `'french'`) is the value plugged into the legacy `fulltext`
`$text` index's `default_language` (`api/src/mongo.ts`) — it has to be a MongoDB text-index
language name. The analyzer (`analysis.ts`) takes ISO 639-1 codes (`'fr'`, `'en'`) and is
deliberately kept ISO-only so it stays extractable to a shared lib with no MongoDB-specific
vocabulary.

`collections.ts` bridges the two with `analyzerLanguage()`:

```ts
const LANGUAGE_CODES: Record<string, string> = { french: 'fr', english: 'en', none: 'none' }
export const analyzerLanguage = (mongoLanguage: string): string => {
  const code = LANGUAGE_CODES[mongoLanguage]
  if (!code) throw new Error(`text-search: unsupported catalogSearch.language "${mongoLanguage}" — expected one of ${Object.keys(LANGUAGE_CODES).join(', ')}`)
  return code
}
```

It **throws** on anything unmappable, on purpose. Passing the Mongo name straight through
(`createAnalyzer('french')`) does not error — it silently returns an analyzer with no stemming and
no stopword removal (`createAnalyzer` only recognises ISO codes, so an unrecognised language falls
through to a no-op pipeline). Everything still works: documents index, searches return results —
just materially worse ones, with every ranking figure the design's benchmark established assuming
stemming that never actually ran. This shipped once during implementation (plan ledger, Ruling P22)
before being caught. A startup crash on a typo'd config value is the correct trade against that
kind of invisible degradation.

## The backfill window: catalog search degrades while 6.20.0 rolls out

`api/upgrade/6.20.0/02-backfill-search-index.ts` builds `_terms`/`_pos`/`_len` on every existing
dataset and application (after `01-backfill-search-text.ts` has stamped `_searchText`, which the
datasets definition indexes). It runs inline rather than handing the whole corpus to the worker,
because a document without `_terms` is invisible to search.

**Upgrade scripts are not a pre-requisite for serving traffic.** The runner
(`@data-fair/lib-node/upgrade-scripts`) acquires an `upgrade` lock; a process that does not get it
logs `upgrade scripts lock is already acquired, skip them` and continues straight to serving. Its
own source says so, in as many words: *"this behaviour of running the process when the upgrade
scripts are still running on another one implies that they cannot be considered a pre-requisite"*.
So in a multi-pod deploy exactly one pod backfills and every other pod starts answering requests
immediately, against documents that still have no `_terms`.

**What degrades.** Only `q=` on `datasets` and `applications`. `{_terms: {$in: gate}}` matches
nothing on a not-yet-backfilled document, so an upgraded pod returns few or no results — `count`
and `results` agree with each other, there is no error, and nothing appears in the logs. Browsing
without `q=`, facets, sums, permissions and every other route are unaffected. Pods still running
the previous release keep answering `$text` correctly (the `fulltext` index is deliberately not
dropped in this release, see below), so during a rolling deploy the same search gives good results
on one pod and thin results on another.

**For how long.** Proportional to corpus size: one pass over each collection, bulk-writing every
200 documents. Seconds for thousands of documents, minutes for hundreds of thousands.

**Why it converges, and why nothing is poisoned afterwards.** The backfill marks everything stale
before it starts, so any document it has not reached yet is carrying `_needsSearchIndex: true` and
the worker's `computeDatasetSearchIndex`/`computeApplicationSearchIndex` tasks finish the job even
if the script dies mid-run. And a `df` of zero is never memoized (see above), so a search issued
during the window never caches "this term is unknown to the corpus" — results become correct as
soon as the documents are stamped, with no cache TTL to wait out and no restart or manual action.

**What an operator sees.** With `DEBUG=upgrade,upgrade:*`, the backfilling pod logs
`stamped the search index on <N> datasets` / `... applications` when it finishes; the other pods
log the "lock is already acquired" warning at startup. From the product side: result counts for
`q=` searches that climb back to normal on their own over the window.

**Release note for 6.20.0.** *The first pod to start on 6.20.0 runs a one-time search-index
backfill whose duration is proportional to corpus size — seconds for thousands of datasets,
minutes for hundreds of thousands — so expect a longer first start. While it runs, catalog search
(`q=`) on already-upgraded pods returns incomplete results; it recovers by itself, and the backfill
is idempotent and resumable (an interrupted run is finished by a re-run or by the background
worker).*

A readiness gate (pods waiting on the lock before reporting healthy) and a `$text` fallback for
documents with no `_terms` would both close this window. Both were considered and deliberately left
out of this release; the runner comment quoted above sketches what the readiness gate would take.

### Why the scripts sit in a folder named after the current version

`api/upgrade/6.20.0/` matches `package.json`'s current `6.20.0`, and that is the house rule, not an
oversight: an upgrade folder is named after the **last released** version, because the version the
branch will eventually ship as is unknown while it is being written. Every folder under
`api/upgrade/` was created that way. The consequence, which `semver.gte(folder, recordedVersion)`
makes plain:

- **On production** the release bumps `package.json` past `6.20.0`; the first upgraded boot records
  the new version, and from the next boot on `6.20.0 >= <new version>` is false and neither script
  runs again.
- **On a dev or staging checkout**, where `package.json` stays at `6.20.0` until the next release,
  both scripts re-run on every restart. That is expected — it is exactly why they are written to be
  idempotent — but it is not free: neither filter is index-served (there is no index on
  `_searchIndex.v` or on `_searchText`), so each restart pays a full collection scan on `datasets`
  and `applications` that finds nothing to do.

## The legacy `fulltext` index is kept on purpose

`api/src/mongo.ts` still declares the `fulltext` `$text` index on `datasets` and `applications`
(alongside the new `terms`/`owner-terms` indexes) even though `q=` no longer reads it for these two
collections. This is deliberate, **not** dead weight to clean up: during a rolling deploy, old pods
running the previous version still issue `$text` queries against the same database, and removing
the index would break them mid-rollout. Removing `fulltext: null` is a **follow-up for a later
release**, once no pod in the fleet can still be running pre-cutover code.

## Testing

- `tests/features/text-search/*.unit.spec.ts` — pure-function coverage of the module itself
  (analysis, definition, indexing, pipeline, query, stats, collections' language mapping, the
  façade). These run against fake collections that **ignore their own aggregation pipeline** and
  return a canned row, so nothing expressed *inside* an aggregation (`$expr`, `$avg` targets, read
  paths) is exercised by a unit test — only what can be asserted on the *captured* pipeline shape.
- `tests/features/text-search/recompute.api.spec.ts` — the worker drains `_needsSearchIndex`,
  indexes the published document rather than the draft the dispatcher merged in, and clears the
  flag even when the recompute fails.
- `tests/features/text-search/response-hygiene.api.spec.ts` — none of the five index fields ever
  reach an API response, on any route, any projection.
- `tests/features/text-search/search-behaviour.api.spec.ts` — the silent-failure guards against a
  real API and a real MongoDB: a null plan returns nothing, `count` agrees with `results.length`
  (including for a phrase query), negation excludes and an all-negation query returns nothing,
  tied scores are ordered deterministically across repeated identical calls, and a foreign-owned
  master-data dataset stays findable from a publication site (the `ownerScopeOf` guard).
- `tests/features/datasets/catalog-search.api.spec.ts` — end-to-end product behaviour: French
  stemming/stopwords, `searchTerms`, schema-label indexing, permission-gated schema vocabulary,
  and response hygiene on the draft validate/cancel routes.

See [Testing](testing.md) for how to run any of these in isolation.
