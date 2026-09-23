import { computeSearchText } from '../operations.ts'
import { indexPatch } from '../../misc/utils/text-search/index.ts'
import { datasetsTextSearch } from '../../misc/utils/text-search/collections.ts'

// INVARIANT: the search index fields (`_searchText`, `_terms`, `_pos`, `_len`, `_searchIndex`) are
// derived from `schema` and `permissions`; any code that writes one of those two must recompute
// them (via searchIndexPatch below) or justify why staleness is safe in its direction. One writer
// is known to leave `_searchText` (and therefore the index built from it) stale, on purpose, in the
// safe (under-populated, not leaking) direction — not fixed here, just documented so the next
// reader isn't surprised:
//   - api/src/identities/service.ts `deleteIdentity`: strips a grantee from `permissions` without
//     recomputing. Removing a restrictive (list-only) grantee can only loosen computeSearchText's
//     guard, so the stale value stays over-restrictive (misses search hits) rather than leaking.
// api/src/integrity/service.ts metadata restore routes a restored `permissions` through the same
// `applyPatch` as the PATCH route; `applyPatch`'s `touchesIndexedContent` gate checks
// `!!patch.permissions` unconditionally (not only alongside `patch.schema`), so a permissions-only
// restore recomputes the index correctly and is NOT a stale path.

/** Everything derived from a dataset's indexed content. `null` values are removed, never stored. */
export const searchIndexPatch = (dataset: { schema?: any[] | null, permissions?: any[] | null }) => {
  const _searchText = computeSearchText(dataset) ?? null
  // _searchText is itself one of the indexed fields, so it must be computed BEFORE the index is built
  return { _searchText, ...indexPatch(datasetsTextSearch, { ...dataset, _searchText }) }
}
