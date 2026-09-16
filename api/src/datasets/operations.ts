// pure functions for the datasets module — no I/O. The unit-test surface.

import type { Permission } from '#types'
import { operationsClasses } from '@data-fair/data-fair-shared/permissions/operations.ts'

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
  // draft-only changes are invisible to every field above
  if (useDraft && cachedFull.draft?.updatedAt !== fresh.draft?.updatedAt) return false
  return true
}

export interface CatalogSearchSettings { indexSchemaLabels?: boolean, indexEnumValues?: boolean }

// the concrete operations a permission entry grants (same expansion as permissions.ts's
// permissionOperations, kept here so this module stays free of #config / #mongo)
const grantedOperations = (permission: Permission): Set<string> => {
  const granted = new Set<string>(permission.operations ?? [])
  for (const opClass of permission.classes ?? []) {
    for (const op of operationsClasses.datasets[opClass] ?? []) granted.add(op)
  }
  return granted
}

export const SEARCH_TEXT_LIMITS = {
  titleMax: 200,
  descriptionHead: 200,
  enumValueMax: 100,
  enumValuesMax: 500,
  labelsBytes: 8192,
  enumsBytes: 8192
} as const

// first `max` characters, cut back to the last whitespace so no word is split. When the first
// `max` characters contain no whitespace at all (one long unbroken token: a URL, a code), look
// forward for the next whitespace instead of cutting mid-token — capped at 2×max so a single
// token cannot swallow the whole labels budget; past that cap it is hard-truncated at `max`.
const head = (text: string, max: number): string => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  if (space > 0) return cut.slice(0, space).trim()
  const cap = max * 2
  const nextSpace = text.slice(0, cap).indexOf(' ', max)
  return (nextSpace > 0 ? text.slice(0, nextSpace) : text.slice(0, max)).trim()
}

// concatenate strings in order, dropping whole entries once the byte budget is reached
const bounded = (parts: string[], maxBytes: number): string[] => {
  const kept: string[] = []
  let bytes = 0
  for (const part of parts) {
    const size = Buffer.byteLength(part, 'utf8') + 1
    if (bytes + size > maxBytes) break
    kept.push(part)
    bytes += size
  }
  return kept
}

// which schema-derived parts a viewer allowed to merely list the dataset could otherwise infer
const guardedParts = (permissions: Permission[] | null | undefined): { labels: boolean, enums: boolean } => {
  let labels = true
  let enums = true
  for (const permission of permissions ?? []) {
    const ops = grantedOperations(permission)
    if (!ops.has('list')) continue
    if (!ops.has('readSchema')) labels = false
    if (!ops.has('readLines')) enums = false
  }
  return { labels, enums }
}

/**
 * The calculated `_searchText` of a dataset: column labels (and, when the owner opts in, enum
 * values) so the catalog search sees the vocabulary of the data. Bounded because MongoDB's text
 * score dilutes a field's terms by its length. `undefined` means "unset the field".
 */
export function computeSearchText (
  dataset: { schema?: any[] | null, permissions?: Permission[] | null },
  catalogSearch?: CatalogSearchSettings | null
): string | undefined {
  const columns = (dataset.schema ?? []).filter(p => !p['x-calculated'])
  const guard = guardedParts(dataset.permissions)
  const parts: string[] = []

  if (catalogSearch?.indexSchemaLabels !== false && guard.labels) {
    const seen = new Set<string>()
    const labels: string[] = []
    for (const column of columns) {
      const pieces: string[] = []
      if (typeof column.title === 'string' && column.title.trim()) pieces.push(column.title.trim().slice(0, SEARCH_TEXT_LIMITS.titleMax))
      if (typeof column.description === 'string' && column.description.trim()) pieces.push(head(column.description.trim(), SEARCH_TEXT_LIMITS.descriptionHead))
      const label = pieces.join(' ')
      if (!label || seen.has(label)) continue
      seen.add(label)
      labels.push(label)
    }
    parts.push(...bounded(labels, SEARCH_TEXT_LIMITS.labelsBytes))
  }

  if (catalogSearch?.indexEnumValues === true && guard.enums) {
    const seen = new Set<string>()
    const values: string[] = []
    for (const column of columns) {
      for (const value of column.enum ?? []) {
        if (typeof value !== 'string' || !value.trim()) continue
        if (value.length > SEARCH_TEXT_LIMITS.enumValueMax) continue
        if (seen.has(value)) continue
        seen.add(value)
        values.push(value.trim())
        if (values.length >= SEARCH_TEXT_LIMITS.enumValuesMax) break
      }
      if (values.length >= SEARCH_TEXT_LIMITS.enumValuesMax) break
    }
    parts.push(...bounded(values, SEARCH_TEXT_LIMITS.enumsBytes))
  }

  return parts.length ? parts.join('\n') : undefined
}
