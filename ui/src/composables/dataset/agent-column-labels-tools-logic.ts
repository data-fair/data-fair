// Pure logic behind `read_column_values` / `set_column_labels`.
//
// `x-labels` is its own tool, not a field of annotate_schema, for three reasons:
// it needs the column's real distinct values first (title and description do not);
// a wrong label silently mislabels the data in every application built on the dataset;
// and separating it is what lets the annotation prompt say "coded values belong in the
// labels, never in the description".

import { isEditableColumn } from './agent-schema-annotation-tools-logic'

export interface ColumnLabels {
  key: string
  /** value -> human-readable label; an empty object clears the labels */
  labels: Record<string, string>
}

export interface LabelOutcome {
  key: string
  status: 'applied' | 'unchanged' | 'rejected'
  reason?: string
  unknownValues?: string[]
}

/** Columns worth labelling: a closed, small set of codes rather than free text. */
export const LABELLABLE_MAX_CARDINALITY = 100

export function isLabellable (col: any): true | string {
  if (!isEditableColumn(col)) return 'internal or calculated column'
  if (col.type === 'boolean') return 'booleans already display as yes/no'
  const cardinality = col['x-cardinality']
  if (typeof cardinality === 'number' && cardinality > LABELLABLE_MAX_CARDINALITY) {
    return `${cardinality} distinct values — labels are meant for a closed set of codes, not for free text`
  }
  return true
}

/**
 * Apply labels in place. Values are stored as strings because `x-labels` is a JSON object
 * and its keys are always strings, including for integer columns (`{"1": "Homme"}`).
 *
 * A label whose key is not among the column's observed values is reported but still
 * written: `enum` is truncated for large columns, so absence is not proof of absence.
 */
export function applyColumnLabels (schema: any[], entries: ColumnLabels[]): LabelOutcome[] {
  const outcomes: LabelOutcome[] = []

  for (const entry of entries) {
    const col = schema.find(c => c.key === entry.key)
    if (!col) {
      outcomes.push({ key: entry.key, status: 'rejected', reason: `no column "${entry.key}" in this dataset` })
      continue
    }
    const labellable = isLabellable(col)
    if (labellable !== true) {
      outcomes.push({ key: entry.key, status: 'rejected', reason: labellable })
      continue
    }

    const labels: Record<string, string> = {}
    for (const [value, label] of Object.entries(entry.labels ?? {})) {
      const trimmed = String(label ?? '').trim()
      if (trimmed) labels[String(value)] = trimmed
    }

    const known = new Set((col.enum ?? []).map((v: any) => String(v)))
    const unknownValues = known.size
      ? Object.keys(labels).filter(v => !known.has(v))
      : []

    const before = JSON.stringify(col['x-labels'] ?? null)
    if (!Object.keys(labels).length) {
      if (col['x-labels'] === undefined) {
        outcomes.push({ key: entry.key, status: 'unchanged' })
      } else {
        delete col['x-labels']
        outcomes.push({ key: entry.key, status: 'applied' })
      }
      continue
    }

    // Merge over existing labels: a partial call must not wipe labels the dataset
    // already carried for other values.
    const merged = { ...(col['x-labels'] ?? {}), ...labels }
    if (JSON.stringify(merged) === before) {
      outcomes.push({ key: entry.key, status: 'unchanged', unknownValues: unknownValues.length ? unknownValues : undefined })
    } else {
      col['x-labels'] = merged
      outcomes.push({ key: entry.key, status: 'applied', unknownValues: unknownValues.length ? unknownValues : undefined })
    }
  }

  return outcomes
}

export function formatLabelOutcomes (outcomes: LabelOutcome[]): string {
  const lines: string[] = []
  const applied = outcomes.filter(o => o.status === 'applied')
  const unchanged = outcomes.filter(o => o.status === 'unchanged')
  const rejected = outcomes.filter(o => o.status === 'rejected')

  if (applied.length) {
    lines.push('Labels applied to the form (not saved yet — the user reviews and clicks Enregistrer):')
    for (const o of applied) lines.push(`- ${o.key}`)
  }
  if (unchanged.length) lines.push(`Already had those labels: ${unchanged.map(o => o.key).join(', ')}.`)
  for (const o of outcomes) {
    if (o.unknownValues?.length) {
      lines.push(`WARNING ${o.key}: labelled value(s) ${o.unknownValues.map(v => `"${v}"`).join(', ')} were not observed in the data — check the codes before the user saves.`)
    }
  }
  if (rejected.length) {
    lines.push('REJECTED:')
    for (const o of rejected) lines.push(`- ${o.key}: ${o.reason}`)
  }
  if (!lines.length) lines.push('Nothing to change.')
  return lines.join('\n')
}
