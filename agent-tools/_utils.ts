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

export const filtersDescription = 'Column filters as key-value pairs. Key format: column_key + suffix (see server instructions for available suffixes). All values must be strings, even for numbers/dates. If a column key has underscores (e.g., code_postal), just append the suffix: code_postal_eq. Example: { "nom_search": "Jean", "age_lte": "30", "ville_eq": "Paris" }'

const datasetIdProperty = { type: 'string' as const, description: 'The exact dataset ID from the "id" field in list_datasets results. Do not use the title or slug.' }

export const filterProperties = {
  filters: { type: 'object' as const, description: filtersDescription, properties: {} },
  bbox: { type: 'string' as const, description: 'Geographic bounding box filter (only for geolocalized datasets). Format: "lonMin,latMin,lonMax,latMax". Example: "-2.5,43,3,47".' },
  geoDistance: { type: 'string' as const, description: 'Geographic proximity filter (only for geolocalized datasets). Restricts results to within a distance from a point. Format: "lon,lat,distance". Example: "2.35,48.85,10km". Use distance "0" for point-in-polygon containment.' },
  dateMatch: { type: 'string' as const, description: 'Temporal filter (only for temporal datasets with date fields). Accepts a single date "YYYY-MM-DD" to match that day, or a date range "YYYY-MM-DD,YYYY-MM-DD" to match an overlapping period. ISO datetimes also accepted. Example: "2023-11-21" or "2023-01-01,2023-12-31".' }
} as const

export { datasetIdProperty }

/**
 * Build the filter-relevant query params from common tool input params.
 * Returns a URL query string (e.g. "nom_search=Jean&geo_distance=2.35,48.85,10km").
 * Excludes pagination (size, page) and tool-specific params (metric, field, etc.).
 */
export function buildFilterQueryString (params: { q?: string, filters?: Record<string, any>, sort?: string, select?: string, bbox?: string, geoDistance?: string, dateMatch?: string }): string | undefined {
  const searchParams = new URLSearchParams()
  if (params.q) searchParams.set('q', params.q)
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) searchParams.set(key, String(value))
  }
  if (params.sort) {
    const normalized = normalizeSort(params.sort)
    if (normalized) searchParams.set('sort', normalized)
  }
  if (params.select) searchParams.set('select', params.select)
  if (params.bbox) searchParams.set('bbox', params.bbox)
  if (params.geoDistance) searchParams.set('geo_distance', params.geoDistance)
  if (params.dateMatch) searchParams.set('date_match', params.dateMatch)
  const qs = searchParams.toString()
  return qs || undefined
}

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
