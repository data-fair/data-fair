/**
 * Compares the lines a dataset ends up with to the final state a line edition case expects. Pure:
 * the caller fetches the lines and the schema (extension columns included). Only the fields a case
 * lists are compared, so internal fields (`_id`, `_i`, `_updatedAt`...) never matter; a listed
 * extension key such as `_code_insee.departement` is compared like any other.
 */

export type ExpectedRow = { match: Record<string, unknown>, fields: Record<string, unknown> }
export type ExpectedState = { rows: ExpectedRow[], absent?: Record<string, unknown>[], totalRows: number }
export type RowCheck = {
  rowsExpected: number,
  rowsFound: number,
  rowsExact: number,
  fieldsExpected: number,
  fieldsCorrect: number,
  missing: Record<string, unknown>[],
  unexpectedPresent: Record<string, unknown>[],
  totalRows: { expected: number, actual: number },
  diffs: Array<{ match: Record<string, unknown>, field: string, expected: unknown, actual: unknown }>
}
type SchemaProp = { key: string, type: string, format?: string, separator?: string }

const isEmpty = (v: unknown) => v === undefined || v === null || v === ''

// a canonical string for a value, so that two shapes of the same value compare equal
const normalize = (value: unknown, prop?: SchemaProp): string | undefined => {
  if (isEmpty(value)) return undefined
  if (prop?.separator) {
    const items = Array.isArray(value) ? value : String(value).split(prop.separator.trim())
    const set = [...new Set(items.map(i => String(i).trim()).filter(i => i !== ''))].sort()
    return set.length ? JSON.stringify(set) : undefined
  }
  if (Array.isArray(value)) return JSON.stringify(value.map(i => String(i).trim()).sort())
  if (prop?.type === 'boolean') return String(value).trim().toLowerCase() === 'true' ? 'true' : String(value).trim().toLowerCase() === 'false' ? 'false' : String(value)
  if (prop?.type === 'integer' || prop?.type === 'number') {
    const n = Number(value)
    return Number.isNaN(n) ? String(value).trim() : String(n)
  }
  if (prop?.format === 'date') return String(value).trim().slice(0, 10)
  return String(value).trim()
}

const same = (a: unknown, b: unknown, prop?: SchemaProp) => normalize(a, prop) === normalize(b, prop)

export function checkRows (expected: ExpectedState, actual: Record<string, unknown>[], schema: SchemaProp[]): RowCheck {
  const props = new Map(schema.map(p => [p.key, p]))
  const matches = (row: Record<string, unknown>, match: Record<string, unknown>) =>
    Object.entries(match).every(([key, value]) => same(row[key], value, props.get(key)))

  const result: RowCheck = {
    rowsExpected: expected.rows.length,
    rowsFound: 0,
    rowsExact: 0,
    fieldsExpected: 0,
    fieldsCorrect: 0,
    missing: [],
    unexpectedPresent: [],
    totalRows: { expected: expected.totalRows, actual: actual.length },
    diffs: []
  }

  for (const { match, fields } of expected.rows) {
    const fieldKeys = Object.keys(fields)
    result.fieldsExpected += fieldKeys.length
    const found = actual.filter(row => matches(row, match))
    if (found.length !== 1) {
      result.missing.push(match)
      result.diffs.push({ match, field: '(match)', expected: 1, actual: found.length })
      continue
    }
    result.rowsFound++
    const row = found[0]
    let exact = true
    for (const field of fieldKeys) {
      if (same(row[field], fields[field], props.get(field))) result.fieldsCorrect++
      else {
        exact = false
        result.diffs.push({ match, field, expected: fields[field], actual: row[field] })
      }
    }
    if (exact) result.rowsExact++
  }

  for (const match of expected.absent ?? []) {
    if (actual.some(row => matches(row, match))) result.unexpectedPresent.push(match)
  }
  return result
}
