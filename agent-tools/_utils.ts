export function cleanRow (row: any): any {
  const { _id, _i, _rand, ...clean } = row
  return clean
}

export function csvEscape (value: any): string {
  if (value == null) return ''
  const s = String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv (rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  return [keys.map(csvEscape).join(','), ...rows.map(row => keys.map(k => csvEscape(row[k])).join(','))].join('\n')
}

/**
 * Drop incomplete _geo_distance sort entries (without :lon:lat suffix).
 * LLMs sometimes write sort: "_geo_distance" redundantly when a geoDistance filter is already present.
 * The API already auto-sorts by distance when a geo_distance filter is set.
 */
export function normalizeSort (sort: string): string {
  return sort.split(',').map(part => {
    const trimmed = part.trim()
    if (/^-?_geo_distance$/.test(trimmed)) return null
    return trimmed
  }).filter(Boolean).join(',')
}

export const filtersDescription = 'Column filters as key-value pairs. Key format: column_key + suffix (_eq, _neq, _search, _in, _nin, _starts, _contains, _gte, _gt, _lte, _lt, _exists, _nexists). All values must be strings. Example: {"nom_search":"Jean","age_lte":"30"}'

const datasetIdProperty = { type: 'string' as const, description: 'The exact dataset ID' }

export const filterProperties = {
  filters: { type: 'object' as const, description: filtersDescription, properties: {} },
  bbox: { type: 'string' as const, description: 'Geographic bounding box filter (only for geolocalized datasets). Format: "lonMin,latMin,lonMax,latMax". Example: "-2.5,43,3,47"' },
  geoDistance: { type: 'string' as const, description: 'Geographic proximity filter (only for geolocalized datasets). Format: "lon,lat,distance". Example: "2.35,48.85,10km". Use distance "0" for point-in-polygon containment.' },
  dateMatch: { type: 'string' as const, description: 'Temporal filter (only for temporal datasets). Single date "YYYY-MM-DD" or date range "YYYY-MM-DD,YYYY-MM-DD". ISO datetimes also accepted.' }
} as const

export { datasetIdProperty }

/**
 * Format schema columns into markdown table rows.
 * Filters out internal columns (_i, _id, _rand).
 */
export function formatSchemaColumns (schema: any[]): string[] | undefined {
  return schema
    ?.filter((col: any) => !['_i', '_id', '_rand'].includes(col.key))
    .map((col: any) => {
      const notes: string[] = []
      if (col.description) notes.push(col.description)
      if (col['x-concept']?.title) notes.push(`concept: ${col['x-concept'].title}`)
      if (col.enum) {
        const shown = col.enum.slice(0, 20).join(', ')
        notes.push(col.enum.length > 20 ? `enum: ${shown}… (${col.enum.length} total)` : `enum: ${shown}`)
      }
      if (col['x-labels']) {
        const entries = Object.entries(col['x-labels'])
        const shown = entries.slice(0, 10).map(([k, v]) => `${k}=${v}`).join(', ')
        notes.push(entries.length > 10 ? `labels: ${shown}… (${entries.length} total)` : `labels: ${shown}`)
      }
      return `| \`${col.key}\` | ${col.type} | ${col.title || ''} | ${notes.join(' — ')} |`
    })
}
