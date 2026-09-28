// Pure logic behind `read_schema_for_annotation` / `annotate_schema`.
//
// The tool writes four per-column fields — title, description, concept (`x-refersTo`)
// and group (`x-group`) — which are exactly four of the six inputs the column editor
// renders. Concepts are validated against the same eligibility rules the editor applies
// (`dataset-column-editor.vue`), so the agent can never set a concept the human could
// not have picked from the list.

export interface VocabularyTerm {
  id: string
  title: string
  description?: string
  identifiers: string[]
  type: string
  format?: string
  tag?: string
  private?: boolean
}

export interface SchemaAnnotation {
  key: string
  title?: string
  description?: string
  /** vocabulary identifier, id or title; empty string or null clears the concept */
  concept?: string | null
  /** free text; empty string or null clears the group */
  group?: string | null
}

export interface AnnotationOutcome {
  key: string
  applied: string[]
  rejected: { field: string, reason: string }[]
}

/** Columns the agent may touch: no internal keys, no calculated columns. */
export const isEditableColumn = (col: any): boolean =>
  !!col && !['_i', '_id', '_rand'].includes(col.key) && !col['x-calculated']

/**
 * Mirrors `filteredVocabularyItems` in dataset-column-editor.vue. Kept in sync by hand;
 * if the editor's rules change, this must follow or the agent will offer concepts the
 * form refuses.
 */
export function isConceptEligible (column: any, term: VocabularyTerm, allColumns: any[]): true | string {
  const identifier = term.identifiers[0]
  const taken = allColumns.find(c => c['x-refersTo'] === identifier && c.key !== column.key)
  if (taken) return `concept "${term.title}" is already carried by column "${taken.key}" — a concept is unique within a dataset`
  if (column.type === 'integer' && term.type === 'number') return true
  if (column.type !== term.type && term.type !== 'string') {
    return `concept "${term.title}" expects a ${term.type} column, "${column.key}" is ${column.type}`
  }
  if (term.format === 'date-time' && column.format !== 'date-time' && column.format !== 'date') {
    return `concept "${term.title}" expects a date column, "${column.key}" has no date format`
  }
  return true
}

/** Resolve a concept from an identifier URI, a vocabulary id, or a title. */
export function resolveConcept (value: string, vocabulary: VocabularyTerm[]): VocabularyTerm | undefined {
  const norm = (s: string) => s.trim().toLowerCase()
  return vocabulary.find(t => t.identifiers.includes(value)) ??
    vocabulary.find(t => t.id === value) ??
    vocabulary.find(t => norm(t.title) === norm(value))
}

/**
 * Apply annotations to a schema in place. Returns a per-column account; a column with a
 * bad concept still gets its title and description, so one mistake does not lose the
 * whole batch.
 */
export function applyAnnotations (
  schema: any[],
  annotations: SchemaAnnotation[],
  vocabulary: VocabularyTerm[]
): AnnotationOutcome[] {
  const outcomes: AnnotationOutcome[] = []

  for (const ann of annotations) {
    const outcome: AnnotationOutcome = { key: ann.key, applied: [], rejected: [] }
    outcomes.push(outcome)

    const col = schema.find(c => c.key === ann.key)
    if (!col) {
      outcome.rejected.push({ field: 'key', reason: `no column "${ann.key}" in this dataset` })
      continue
    }
    if (!isEditableColumn(col)) {
      outcome.rejected.push({ field: 'key', reason: `column "${ann.key}" is internal or calculated and cannot be annotated` })
      continue
    }

    if (ann.title !== undefined) {
      const title = (ann.title ?? '').trim()
      if (title !== (col.title ?? '')) {
        col.title = title
        outcome.applied.push('title')
      }
    }

    if (ann.description !== undefined) {
      const description = ann.description ?? ''
      if (description !== (col.description ?? '')) {
        col.description = description
        outcome.applied.push('description')
      }
    }

    if (ann.group !== undefined) {
      const group = (ann.group ?? '').trim()
      const before = col['x-group']
      if (group) {
        if (before !== group) { col['x-group'] = group; outcome.applied.push('group') }
      } else if (before !== undefined) {
        delete col['x-group']
        outcome.applied.push('group')
      }
    }

    if (ann.concept !== undefined) {
      const raw = (ann.concept ?? '').trim()
      if (!raw) {
        if (col['x-refersTo'] !== undefined) {
          delete col['x-refersTo']
          delete col['x-concept']
          outcome.applied.push('concept')
        }
      } else {
        const term = resolveConcept(raw, vocabulary)
        if (!term) {
          outcome.rejected.push({ field: 'concept', reason: `unknown concept "${raw}" — call read_schema_for_annotation to see the available list` })
        } else {
          const eligible = isConceptEligible(col, term, schema)
          if (eligible !== true) {
            outcome.rejected.push({ field: 'concept', reason: eligible })
          } else if (col['x-refersTo'] !== term.identifiers[0]) {
            col['x-refersTo'] = term.identifiers[0]
            // `x-concept` is a denormalized copy the API recomputes on save; drop the
            // stale one rather than guess its `primary` flag.
            delete col['x-concept']
            outcome.applied.push('concept')
          }
        }
      }
    }
  }

  return outcomes
}

export function formatAnnotationOutcomes (outcomes: AnnotationOutcome[]): string {
  const changed = outcomes.filter(o => o.applied.length)
  const rejected = outcomes.filter(o => o.rejected.length)
  const untouched = outcomes.length - changed.length - rejected.length

  const lines: string[] = []
  if (changed.length) {
    lines.push('Applied to the form (not saved yet — the user reviews and clicks Enregistrer):')
    for (const o of changed) lines.push(`- ${o.key}: ${o.applied.join(', ')}`)
  }
  if (rejected.length) {
    lines.push('REJECTED:')
    for (const o of rejected) for (const r of o.rejected) lines.push(`- ${o.key} / ${r.field}: ${r.reason}`)
  }
  if (untouched > 0) lines.push(`${untouched} column(s) already had those values, left alone.`)
  if (!lines.length) lines.push('Nothing to change.')
  return lines.join('\n')
}

/** The concept catalogue handed to the model, grouped by tag and trimmed to essentials. */
export function formatVocabulary (vocabulary: VocabularyTerm[], schema: any[]): string {
  const used = new Map<string, string>()
  for (const col of schema) if (col['x-refersTo']) used.set(col['x-refersTo'], col.key)

  const lines: string[] = []
  const byTag = new Map<string, VocabularyTerm[]>()
  for (const term of vocabulary) {
    const tag = term.tag || 'Autres'
    if (!byTag.has(tag)) byTag.set(tag, [])
    byTag.get(tag)!.push(term)
  }
  for (const [tag, terms] of byTag) {
    lines.push(`### ${tag}`)
    for (const term of terms) {
      const taken = used.get(term.identifiers[0])
      lines.push(`- **${term.title}** (${term.type}${term.format ? `, ${term.format}` : ''})${taken ? ` — already on \`${taken}\`` : ''}`)
    }
  }
  return lines.join('\n')
}
