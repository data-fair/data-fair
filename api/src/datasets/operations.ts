// pure functions for the datasets module — no I/O. The unit-test surface.

// matches the separator used by memoizee's built-in `primitive` normalizer
const KEY_SEP = '\u0001'

// a stable primitive identity for a publicationSite / mainPublicationSite object
// (these are the {owner, type, id, url, ...} objects built in app.js)
const siteKey = (site: any): string => {
  if (!site) return ''
  return `${site.owner?.type}:${site.owner?.id}:${site.type}:${site.id}`
}

/**
 * Normalizer for the `memoizedGetDataset` cache.
 *
 * `getDataset` receives the publicationSite / mainPublicationSite as objects. The default
 * `primitive: true` memoizee normalizer string-coerces them to "[object Object]", so two
 * different sites collapse to the same cache key — a dataset could be served (or 404'd) for
 * the wrong site within the 30s TTL (multi-domain exposure). This builds a stable key that
 * keeps the two site objects distinct while ignoring the non-cacheable args (db,
 * acceptedStatuses, reqBody) — mirroring the previous `length: 6`. Fields are joined with a
 * separator so adjacent fields can never concatenate into a colliding key.
 */
export const getDatasetCacheKey = (args: ArrayLike<any>): string => {
  return [
    args[0], // datasetId
    siteKey(args[1]), // publicationSite
    siteKey(args[2]), // mainPublicationSite
    !!args[3], // useDraft
    !!args[4], // fillDescendants
    !!args[5] // acceptInitialDraft
  ].join(KEY_SEP)
}
