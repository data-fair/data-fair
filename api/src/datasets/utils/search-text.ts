import mongo from '#mongo'
import { computeSearchText, type CatalogSearchSettings } from '../operations.ts'

// INVARIANT: `_searchText` is derived from `schema`, `permissions` and `settings.catalogSearch`;
// any code that writes one of those three must recompute it (via searchTextPatch below) or
// justify why staleness is safe in its direction. Two writers are known to leave it stale, on
// purpose, in the safe (under-populated, not leaking) direction — not fixed here, just documented
// so the next reader isn't surprised:
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

/** The `_searchText` value to write for a dataset, `null` to unset it. */
export const searchTextPatch = async (dataset: { owner: { type: string, id: string }, schema?: any[] | null, permissions?: any[] | null }): Promise<{ _searchText: string | null }> => {
  const catalogSearch = await getCatalogSearchSettings(dataset.owner)
  return { _searchText: computeSearchText(dataset, catalogSearch) ?? null }
}
