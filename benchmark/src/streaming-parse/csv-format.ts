import type { Column } from './descriptor.ts'
const NEEDS_QUOTE = /[",\r\n]/
export function csvCell (value: unknown, type: Column['type']): string {
  if (value === null || value === undefined) return ''
  if (type === 'string') return '"' + String(value).replace(/"/g, '""').replace(/\0/g, '') + '"'
  if (type === 'integer' || type === 'number') return '' + value
  if (type === 'boolean') return value === true ? '1' : value === false ? '0' : ''
  let s: string; try { s = JSON.stringify(value) } catch { s = String(value) }
  if (s === undefined) return ''
  s = s.replace(/\0/g, '')
  return NEEDS_QUOTE.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export function csvHeader (cols: Column[]): string {
  return cols.map(c => '"' + c.outKey.replace(/"/g, '""') + '"').join(',') + '\n'
}
