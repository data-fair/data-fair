// pure functions for the datasets module — no I/O. The unit-test surface.
import type { Dataset, Permission } from '#types'
import trimFields from '../misc/utils/trim-fields.ts'
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
  labelsBytes: 8192
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

/**
 * Column labels are hidden from a viewer who may list the dataset but not read its schema, so
 * indexing them would let a search match reveal that a column exists. Returns false as soon as one
 * such grantee is present, for the whole dataset.
 */
const schemaReadableByEveryLister = (permissions: Permission[] | null | undefined): boolean => {
  for (const permission of permissions ?? []) {
    const ops = grantedOperations(permission)
    if (ops.has('list') && !ops.has('readSchema')) return false
  }
  return true
}

/**
 * The calculated `_searchText` of a dataset: its column titles and descriptions, so the catalog
 * search sees the vocabulary of the data and not just the prose written about it. Bounded because
 * a field's terms are diluted by its length. `undefined` means "unset the field".
 */
export function computeSearchText (
  dataset: { schema?: any[] | null, permissions?: Permission[] | null }
): string | undefined {
  if (!schemaReadableByEveryLister(dataset.permissions)) return undefined
  const seen = new Set<string>()
  const labels: string[] = []
  for (const column of dataset.schema ?? []) {
    if (column['x-calculated']) continue
    const pieces: string[] = []
    if (typeof column.title === 'string' && column.title.trim()) pieces.push(column.title.trim().slice(0, SEARCH_TEXT_LIMITS.titleMax))
    if (typeof column.description === 'string' && column.description.trim()) pieces.push(head(column.description.trim(), SEARCH_TEXT_LIMITS.descriptionHead))
    const label = pieces.join(' ')
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  const kept = bounded(labels, SEARCH_TEXT_LIMITS.labelsBytes)
  return kept.length ? kept.join('\n') : undefined
}

// trim leading/trailing whitespace of the free-text fields (explicit list: separators,
// regex patterns and date formats are syntaxes where whitespace is significant)
export const trimDataset = (dataset: Partial<Dataset>) => {
  trimFields(dataset, 'title', 'summary', 'description', 'origin', 'image', 'creator', 'spatial')
  if (dataset.keywords) dataset.keywords = [...new Set(dataset.keywords.map(keyword => keyword.trim()).filter(Boolean))]
  if (dataset.customMetadata) trimFields(dataset.customMetadata, ...Object.keys(dataset.customMetadata))
  if (dataset.conformsTo) trimFields(dataset.conformsTo, 'title', 'version', 'url')
  // the generated attachment types lose the fields shared by the oneOf branches
  const attachments = (dataset.attachments ?? []) as { title?: string, description?: string, name?: string, url?: string, targetUrl?: string }[]
  for (const attachment of attachments) trimFields(attachment, 'title', 'description', 'name', 'url', 'targetUrl')
  for (const prop of dataset.schema ?? []) {
    trimFields(prop, 'title', 'description', 'x-group', 'x-originalName', 'patternErrorMessage')
    // keys and transform examples are data values: REST datasets store them untrimmed
    if (prop['x-labels']) {
      prop['x-labels'] = Object.fromEntries(Object.entries(prop['x-labels']).map(([value, label]) => [value, label.trim()]))
    }
    if (prop['x-transform']) trimFields(prop['x-transform'], 'expr')
  }
  for (const extension of dataset.extensions ?? []) {
    if (extension.type === 'exprEval') trimFields(extension, 'expr')
    else if (extension.type === 'remoteService') {
      trimFields(extension, 'propertyPrefix')
      for (const overwrite of Object.values(extension.overwrite ?? {})) trimFields(overwrite, 'title', 'x-originalName')
    }
  }
  // filter values are data values too, left as typed
  const searchs: { title?: string, description?: string }[] = [...dataset.masterData?.bulkSearchs ?? [], ...dataset.masterData?.singleSearchs ?? []]
  for (const search of searchs) trimFields(search, 'title', 'description')
}
