import type { TextSearch } from './index.ts'

/**
 * The search-index fields of a document, as a patch. A `null` value means "this document has no
 * such field": every consumer below turns that into a removal, never into a stored null.
 *
 * `_needsSearchIndex` is always null because building this patch IS the recompute, so it clears any
 * pending stale flag wherever the patch is applied. Without it a write that follows a topic or
 * owner rename would leave the flag set and the worker would redo the work.
 */
export const indexPatch = (textSearch: TextSearch, doc: any): Record<string, any> => {
  const fields = textSearch.buildIndexFields(doc)
  return {
    _terms: fields?._terms ?? null,
    _pos: fields?._pos ?? null,
    _len: fields?._len ?? null,
    _searchIndex: { v: textSearch.definition.version, at: new Date().toISOString() },
    _needsSearchIndex: null
  }
}

/**
 * Apply a patch to a document being written whole (insert, replace, or an in-memory document kept
 * in sync with a mongo update). Null-valued keys are deleted rather than stored: a document that
 * has nothing indexable must carry no index fields at all, which is also what `mergeIndexUpdate`
 * leaves behind, so every writer produces the same shape.
 */
export const assignIndexFields = (doc: Record<string, any>, patch: Record<string, any>) => {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete doc[key]
    else doc[key] = value
  }
  return doc
}

/**
 * Merge a patch into a mongo update document, routing null-valued keys to `$unset`. Mutates and
 * returns the update so it can wrap one built by the caller, e.g. `mergeIndexUpdate({ $set: patch }, …)`.
 */
export const mergeIndexUpdate = <T extends { $set?: Record<string, any>, $unset?: Record<string, any> }>(
  update: T,
  patch: Record<string, any>
): T & { $set?: Record<string, any>, $unset?: Record<string, any> } => {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) (update.$unset ??= {})[key] = ''
    else (update.$set ??= {})[key] = value
  }
  return update
}
