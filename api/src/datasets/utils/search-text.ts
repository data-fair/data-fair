import mongo from '#mongo'
import { computeSearchText, type CatalogSearchSettings } from '../operations.ts'

// collections.ts reads `mongo.datasets` / `mongo.applications` at module top level (to build its
// stats providers). Router modules — this one's callers among them — are loaded by app.js via
// dynamic `import()` BEFORE `mongo.init()` runs, so a static import here would run that read
// while the db is still disconnected and crash the process on every start. A dynamic import
// deferred to first call lands well after `mongo.init()`, once a request actually comes in.
let textSearchPromise: Promise<typeof import('../../misc/utils/text-search/collections.ts')> | undefined
const loadTextSearch = () => (textSearchPromise ??= import('../../misc/utils/text-search/collections.ts'))

// INVARIANT: the search index fields (`_searchText`, `_terms`, `_pos`, `_len`, `_searchIndex`) are
// derived from `schema`, `permissions` and `settings.catalogSearch`; any code that writes one of
// those three must recompute them (via searchIndexPatch below) or justify why staleness is safe
// in its direction. Two writers are known to leave `_searchText` (and therefore the index built
// from it) stale, on purpose, in the safe (under-populated, not leaking) direction — not fixed
// here, just documented so the next reader isn't surprised:
//   - api/src/identities/service.ts `deleteIdentity`: strips a grantee from `permissions` without
//     recomputing. Removing a restrictive (list-only) grantee can only loosen guardedParts'
//     result, so the stale value stays over-restrictive (misses search hits) rather than leaking.
//   - api/src/integrity/service.ts metadata restore: routes a restored `permissions` (with no
//     `schema` in the same patch) through the same `applyPatch` as the PATCH route, but
//     `applyPatch` only recomputes `_searchText` when `patch.schema` is present — a
//     permissions-only restore leaves the previous, now possibly-stale, value in place.

// the owner's main settings (department settings never carry catalogSearch)
export const getCatalogSearchSettings = async (owner: { type: string, id: string }): Promise<CatalogSearchSettings | undefined> => {
  const settings = await mongo.settings.findOne(
    { type: owner.type, id: owner.id, department: { $exists: false } },
    { projection: { catalogSearch: 1 } }
  )
  return (settings as { catalogSearch?: CatalogSearchSettings } | null)?.catalogSearch
}

/** Everything derived from a dataset's indexed content. `null` values are `$unset`. */
export const searchIndexPatch = async (dataset: { owner: { type: string, id: string }, schema?: any[] | null, permissions?: any[] | null }) => {
  const { datasetsTextSearch } = await loadTextSearch()
  const catalogSearch = await getCatalogSearchSettings(dataset.owner)
  const _searchText = computeSearchText(dataset, catalogSearch) ?? null
  // _searchText is one of the indexed fields, so it must be computed BEFORE the index is built
  const fields = datasetsTextSearch.buildIndexFields({ ...dataset, _searchText })
  return {
    _searchText,
    _terms: fields?._terms ?? null,
    _pos: fields?._pos ?? null,
    _len: fields?._len ?? null,
    _searchIndex: { v: datasetsTextSearch.definition.version, at: new Date().toISOString() }
  }
}
