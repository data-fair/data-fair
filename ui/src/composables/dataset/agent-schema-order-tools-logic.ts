// Pure logic behind `reorder_columns`.
//
// Reordering is a whole-schema operation, not a per-column one, so it gets its own tool
// rather than a field of annotate_schema. It is also the one write with no natural visual
// trace: the column chips flag a column whose *content* changed, so a pure reorder needs
// `dataset-columns-list.vue` to compare positions too — see `isModified` there.
//
// The reorder is strictly a permutation: the tool can move columns, never add, drop or
// rename one. Anything else would let the agent delete a column through a reorder call.

import { isEditableColumn } from './agent-schema-annotation-tools-logic.js'

export interface ReorderResult {
  schema?: any[]
  error?: string
  movedCount?: number
}

/**
 * Build the reordered schema. Internal and calculated columns (`_id`, `_i`, `_rand`,
 * extension error columns) are not part of the requested order — they keep their relative
 * position at the end, which is where the API puts them anyway.
 */
export function reorderSchema (schema: any[], keys: string[]): ReorderResult {
  const editable = schema.filter(isEditableColumn)
  const rest = schema.filter(c => !isEditableColumn(c))

  const editableKeys = editable.map(c => c.key)
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const key of keys) {
    if (seen.has(key)) duplicates.push(key)
    seen.add(key)
  }
  if (duplicates.length) {
    return { error: `duplicate key(s) in the requested order: ${[...new Set(duplicates)].map(k => `"${k}"`).join(', ')}` }
  }

  const unknown = keys.filter(k => !editableKeys.includes(k))
  if (unknown.length) {
    return { error: `unknown column(s): ${unknown.map(k => `"${k}"`).join(', ')}. Pass every editable column exactly once, using the keys from read_schema_for_annotation.` }
  }

  const missing = editableKeys.filter(k => !seen.has(k))
  if (missing.length) {
    return { error: `the order must list every editable column exactly once — missing: ${missing.map(k => `"${k}"`).join(', ')}. This tool reorders, it never drops a column.` }
  }

  const byKey = new Map(editable.map(c => [c.key, c]))
  const reordered = keys.map(k => byKey.get(k))
  const movedCount = reordered.reduce((n, col, i) => n + (col.key === editableKeys[i] ? 0 : 1), 0)

  return { schema: [...reordered, ...rest], movedCount }
}

export function formatReorderResult (result: ReorderResult): string {
  if (result.error) return `REJECTED: ${result.error}`
  if (!result.movedCount) return 'The schema is already in that order, nothing changed.'
  return `Reordered — ${result.movedCount} column(s) changed position. Applied to the form (not saved yet); the moved columns are flagged in the schema list so the user sees the change before clicking Enregistrer.`
}
