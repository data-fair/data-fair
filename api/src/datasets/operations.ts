// pure functions for the datasets module — no I/O. The unit-test surface.
import type { Dataset } from '#types'

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

// trim leading/trailing whitespace of the free-text fields (explicit list: separators,
// regex patterns and date formats are syntaxes where whitespace is significant)
export const trimDataset = (dataset: Partial<Dataset>) => {
  if (dataset.title) dataset.title = dataset.title.trim()
  if (dataset.summary) dataset.summary = dataset.summary.trim()
  if (dataset.description) dataset.description = dataset.description.trim()
  if (dataset.origin) dataset.origin = dataset.origin.trim()
  if (dataset.image) dataset.image = dataset.image.trim()
  if (dataset.creator) dataset.creator = dataset.creator.trim()
  if (dataset.spatial) dataset.spatial = dataset.spatial.trim()
  if (dataset.keywords) {
    dataset.keywords = [...new Set(dataset.keywords.map(keyword => keyword.trim()).filter(Boolean))]
  }
  for (const key of Object.keys(dataset.customMetadata ?? {})) {
    if (dataset.customMetadata![key]) dataset.customMetadata![key] = dataset.customMetadata![key].trim()
  }
  if (dataset.conformsTo) {
    if (dataset.conformsTo.title) dataset.conformsTo.title = dataset.conformsTo.title.trim()
    if (dataset.conformsTo.version) dataset.conformsTo.version = dataset.conformsTo.version.trim()
    if (dataset.conformsTo.url) dataset.conformsTo.url = dataset.conformsTo.url.trim()
  }
  // the generated attachment types lose the fields shared by the oneOf branches
  const attachments = (dataset.attachments ?? []) as { title?: string, description?: string, name?: string, url?: string, targetUrl?: string }[]
  for (const attachment of attachments) {
    if (attachment.title) attachment.title = attachment.title.trim()
    if (attachment.description) attachment.description = attachment.description.trim()
    if (attachment.name) attachment.name = attachment.name.trim()
    if (attachment.url) attachment.url = attachment.url.trim()
    if (attachment.targetUrl) attachment.targetUrl = attachment.targetUrl.trim()
  }
  for (const prop of dataset.schema ?? []) {
    if (prop.title) prop.title = prop.title.trim()
    if (prop.description) prop.description = prop.description.trim()
    if (prop['x-group']) prop['x-group'] = prop['x-group'].trim()
    if (prop['x-originalName']) prop['x-originalName'] = prop['x-originalName'].trim()
    if (prop.patternErrorMessage) prop.patternErrorMessage = prop.patternErrorMessage.trim()
    if (prop['x-labels']) {
      prop['x-labels'] = Object.fromEntries(Object.entries(prop['x-labels']).map(([value, label]) => [value.trim(), label.trim()]))
    }
    if (prop['x-transform']) {
      if (prop['x-transform'].expr) prop['x-transform'].expr = prop['x-transform'].expr.trim()
      if (prop['x-transform'].examples) prop['x-transform'].examples = prop['x-transform'].examples.map(example => example.trim())
    }
  }
  for (const extension of dataset.extensions ?? []) {
    if (extension.type === 'exprEval') {
      if (extension.expr) extension.expr = extension.expr.trim()
    } else if (extension.type === 'remoteService') {
      if (extension.propertyPrefix) extension.propertyPrefix = extension.propertyPrefix.trim()
      for (const overwrite of Object.values(extension.overwrite ?? {})) {
        if (overwrite.title) overwrite.title = overwrite.title.trim()
        if (overwrite['x-originalName']) overwrite['x-originalName'] = overwrite['x-originalName'].trim()
      }
    }
  }
  for (const filter of dataset.virtual?.filters ?? []) {
    filter.values = filter.values.map(value => value.trim()).filter(Boolean)
  }
  const searchs: { title?: string, description?: string, filters?: { values: string[] }[] }[] = [...dataset.masterData?.bulkSearchs ?? [], ...dataset.masterData?.singleSearchs ?? []]
  for (const search of searchs) {
    if (search.title) search.title = search.title.trim()
    if (search.description) search.description = search.description.trim()
    for (const filter of search.filters ?? []) {
      filter.values = filter.values.map(value => value.trim()).filter(Boolean)
    }
  }
}
