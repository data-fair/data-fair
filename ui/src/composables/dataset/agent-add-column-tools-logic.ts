// Pure logic behind `add_columns`.
//
// The assistant proposes a set of columns in its very first reply — before the
// wizard has told it anything — and until now could not create one of them. The
// judged runs all ended the same way: a hand-written procedure for the person to
// follow, and a wizard guidance that had to say "your part ends at Create".
//
// What this stages is exactly what `dataset-add-column-dialog.vue` stages, so a
// column the agent adds and a column the person adds are the same object, and
// `dataset-columns-list.vue` flags it as pending (a column absent from the
// original schema is modified by definition) until the person clicks Enregistrer.

import { escapeKey } from '../../utils/escape-key.js'

/** The identity of a column type: what the schema property carries. */
export interface ColumnType {
  type: string
  format?: string
  'x-display'?: 'textarea' | 'markdown'
}

/**
 * The type names offered to the model, each one an identity of the form's own
 * `propertyTypes` list. They are spelled out here rather than derived from it,
 * so this module stays free of the Vue application's modules; the unit test
 * imports both and pins that the two lists still cover each other, in both
 * directions — a type added to the dialog and not here would be silently
 * unreachable by the agent.
 */
const TYPE_IDENTITIES: Record<string, ColumnType> = {
  text: { type: 'string' },
  'long-text': { type: 'string', 'x-display': 'textarea' },
  'formatted-text': { type: 'string', 'x-display': 'markdown' },
  date: { type: 'string', format: 'date' },
  'date-time': { type: 'string', format: 'date-time' },
  integer: { type: 'integer' },
  number: { type: 'number' },
  boolean: { type: 'boolean' }
}

export const AGENT_COLUMN_TYPES = Object.keys(TYPE_IDENTITIES)

export interface NewColumn {
  name: string
  type: string
}

export interface AddOutcome {
  name: string
  key?: string
  rejected?: string
}

/** The schema fields for one of the names above, or undefined. */
export function resolveColumnType (name: string): ColumnType | undefined {
  return TYPE_IDENTITIES[name]
}

/**
 * Why columns cannot be added here, or undefined when they can.
 *
 * Only a REST dataset has the add-column button: everywhere else the columns come
 * from the source, and adding one by hand would be staging a change the form
 * itself does not offer.
 */
export function addColumnsPrecondition (dataset: { isRest?: boolean } | undefined): string | undefined {
  if (!dataset) return 'No dataset loaded.'
  if (dataset.isRest) return undefined
  return 'This dataset is not editable: its columns come from its file or its source, so they cannot be declared here. ' +
    'Only a dataset of type « Éditable » (REST) has columns entered by hand.'
}

/**
 * Append columns to the schema in place. Returns a per-column account: a column
 * that cannot be created does not stop the ones that can, so one wrong type does
 * not lose the batch.
 */
export function addColumns (schema: any[], columns: NewColumn[]): AddOutcome[] {
  const outcomes: AddOutcome[] = []

  for (const column of columns) {
    const name = (column.name ?? '').trim()
    const key = escapeKey(name)
    if (!key) {
      outcomes.push({ name: column.name, rejected: `"${column.name}" leaves no usable column key — give a name with letters or digits in it` })
      continue
    }

    const conflict = schema.find(c => c.key === key)
    if (conflict) {
      const held = conflict.title || conflict['x-originalName'] || conflict.key
      outcomes.push({ name, rejected: `key "${key}" is already used by column "${held}"` })
      continue
    }

    const type = resolveColumnType(column.type)
    if (!type) {
      outcomes.push({ name, rejected: `unknown type "${column.type}" — pick one of: ${AGENT_COLUMN_TYPES.join(', ')}` })
      continue
    }

    schema.push({
      key,
      'x-originalName': name,
      type: type.type,
      ...(type.format ? { format: type.format } : {}),
      ...('x-display' in type ? { 'x-display': type['x-display'] } : {}),
      title: ''
    })
    outcomes.push({ name, key })
  }

  return outcomes
}

export function formatAddOutcomes (outcomes: AddOutcome[]): string {
  const added = outcomes.filter(o => o.key)
  const rejected = outcomes.filter(o => o.rejected)

  const lines: string[] = []
  if (added.length) {
    lines.push(`${added.length} column(s) are in the schema form now, on the page the user is already on:`)
    for (const o of added) lines.push(`- \`${o.key}\` — ${o.name}`)
    lines.push('Nothing is sent yet. Tell the user the Enregistrer button is ready — they do not need to find a tab or check the columns first.')
    lines.push('Titles, descriptions and concepts are set separately, with annotate_schema.')
  }
  if (rejected.length) {
    lines.push('REJECTED:')
    for (const o of rejected) lines.push(`- ${o.name}: ${o.rejected}`)
  }
  if (!lines.length) lines.push('No column was requested, so nothing changed.')
  return lines.join('\n')
}
