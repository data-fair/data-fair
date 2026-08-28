// pure functions for the datasets module — no I/O. The unit-test surface.

import equal from 'fast-deep-equal'

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

/**
 * The cheap "did this dataset change?" probe behind `getDatasetFresh`: rather than re-reading the
 * whole document, project a handful of fields and compare them against the memoized copy.
 *
 * Integrity verdicts and anchors have to be part of it. The checker writes `integrity.lastCheck`
 * and the relay writes `integrity.lastRevision` WITHOUT touching `updatedAt` — deliberately, since
 * that field is the dataset's user-facing modification date and a nightly check must not move it.
 * Left out of the projection they are invisible here, so a reader keeps being served the previous
 * verdict for the whole 30s cache window: a manual "check now" then appears to do nothing at all,
 * even across a page reload, until the entry expires on its own.
 */
export const datasetFreshnessProjection = (useDraft?: boolean): Record<string, number> => ({
  updatedAt: 1,
  finalizedAt: 1,
  status: 1,
  errorStatus: 1,
  errorRetry: 1,
  'integrity.lastCheck.date': 1,
  'integrity.lastRevision.date': 1,
  // the settings-driven batch rescore writes to mongo without touching `updatedAt`, so without this
  // the freshness check would keep serving stale scores until each cache entry expired on its own
  completeness: 1,
  ...(useDraft ? { 'draft.updatedAt': 1 } : {}),
  _id: 0
})

/**
 * True when the memoized document still matches the freshly projected one and may be served as is.
 * `fresh` is the result of a find with `datasetFreshnessProjection`.
 */
export const isCachedDatasetFresh = (cachedFull: Record<string, any> | undefined, fresh: Record<string, any>, useDraft?: boolean): boolean => {
  if (!cachedFull) return false
  if (cachedFull.updatedAt !== fresh.updatedAt) return false
  if (cachedFull.finalizedAt !== fresh.finalizedAt) return false
  if (cachedFull.status !== fresh.status) return false
  if (cachedFull.errorStatus !== fresh.errorStatus) return false
  if (cachedFull.errorRetry !== fresh.errorRetry) return false
  if (cachedFull.integrity?.lastCheck?.date !== fresh.integrity?.lastCheck?.date) return false
  if (cachedFull.integrity?.lastRevision?.date !== fresh.integrity?.lastRevision?.date) return false
  // the whole sub-document: score alone misses a reshuffle at equal weights or a $unset, and
  // lengths / customLabels change what the form shows even when score and missing are untouched
  if (!equal(cachedFull.completeness, fresh.completeness)) return false
  // draft-only changes are invisible to every field above
  if (useDraft && cachedFull.draft?.updatedAt !== fresh.draft?.updatedAt) return false
  return true
}
