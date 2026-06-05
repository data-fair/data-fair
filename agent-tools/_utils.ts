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

// Full filtering guide — the single rich source. Embedded once into the dataset_data
// subagent prompt. Covers column filters AND the geo/temporal params (bbox, geoDistance,
// dateMatch), so the spec lives in one place instead of being repeated across every tool.
export const filtersGuide = `Filtering covers column filters (the \`filters\` object) plus three separate geo/temporal params (bbox, geoDistance, dateMatch).

Column filters — key-value pairs, key = column_key + suffix. All values are strings, even for numbers/dates. If a column key has underscores (e.g. code_postal), just append the suffix: code_postal_eq.

Suffixes:
- _eq / _neq: equals / not equals
- _in / _nin: in / not in a comma-separated list
- _gt / _gte / _lt / _lte: numeric or date range comparisons
- _starts: value starts with a string (prefix)
- _exists / _nexists: column has / has no value
- _search: free-text word search (DEFAULT choice for matching text)
- _contains: substring match — only on columns explicitly enabled for it

Columns support the suffixes that make sense for their data. Just try the suffix you need; if it's rejected, the 400 error lists what that column supports — read it and adapt. Never prefix a column filter with _c_ (reserved for concept filters, silently ignored otherwise): use the bare column_key + suffix (ville_eq, not _c_ville_eq).
Example filters: { "nom_search": "Jean", "age_lte": "30", "ville_eq": "Paris" }

Geo/temporal params are top-level, not part of the filters object, and only apply to geolocalized/temporal datasets:
- bbox — bounding box "lonMin,latMin,lonMax,latMax" (longitude before latitude). Example: "-2.5,43,3,47".
- geoDistance — proximity "lon,lat,distance" (longitude first). Example: "2.35,48.85,10km". Use distance "0" for point-in-polygon containment.
- dateMatch — a single date "YYYY-MM-DD" to match that day, or "YYYY-MM-DD,YYYY-MM-DD" for an overlapping range. ISO datetimes also accepted. Example: "2023-11-21" or "2023-01-01,2023-12-31".`

// Terse, self-contained stub kept on the filters param. Enough for a flat WebMCP client to
// build the common filters; the full suffix table and geo/date detail live in filtersGuide.
export const filtersDescription = 'Column filters as key-value pairs: column_key + suffix, all values strings. Example: { "ville_eq": "Paris", "age_lte": "30", "nom_search": "Jean" }. Suffixes include _eq, _in, _gt/_lt, _search and more; if one is rejected the 400 error lists what the column supports. Never _c_-prefix a column filter (use ville_eq, not _c_ville_eq).'

const datasetIdProperty = { type: 'string' as const, description: 'The exact dataset ID from the "id" field in list_datasets results. Do not use the title or slug.' }

export const filterProperties = {
  filters: { type: 'object' as const, description: filtersDescription, properties: {} },
  bbox: { type: 'string' as const, description: 'Bounding box "lonMin,latMin,lonMax,latMax" (lon before lat), e.g. "-2.5,43,3,47". Geolocalized datasets only.' },
  geoDistance: { type: 'string' as const, description: 'Proximity filter "lon,lat,distance" (lon first), e.g. "2.35,48.85,10km"; distance "0" = point-in-polygon. Geolocalized datasets only.' },
  dateMatch: { type: 'string' as const, description: 'Date "YYYY-MM-DD" (single day) or "YYYY-MM-DD,YYYY-MM-DD" (range), e.g. "2023-11-21". Temporal datasets only.' }
} as const

export { datasetIdProperty }

/**
 * Build the filter-relevant query params from common tool input params.
 * Returns a URL query string (e.g. "nom_search=Jean&_c_geo_distance=2.35,48.85,10km").
 * Excludes pagination (size, page) and tool-specific params (metric, field, etc.).
 *
 * `q`, `bbox`, `geo_distance` and `date_match` are emitted with the `_c_` prefix
 * (concept filters) so they survive the table/map URL sync, which only forwards
 * `_c_`-prefixed params through `useConceptFilters`. The API accepts both forms
 * interchangeably.
 */
export function buildFilterQueryString (params: { q?: string, filters?: Record<string, any>, sort?: string, select?: string, bbox?: string, geoDistance?: string, dateMatch?: string }): string | undefined {
  const searchParams = new URLSearchParams()
  if (params.q) searchParams.set('_c_q', params.q)
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) searchParams.set(key, String(value))
  }
  if (params.sort) {
    const normalized = normalizeSort(params.sort)
    if (normalized) searchParams.set('sort', normalized)
  }
  if (params.select) searchParams.set('select', params.select)
  if (params.bbox) searchParams.set('_c_bbox', params.bbox)
  if (params.geoDistance) searchParams.set('_c_geo_distance', params.geoDistance)
  if (params.dateMatch) searchParams.set('_c_date_match', params.dateMatch)
  const qs = searchParams.toString()
  return qs || undefined
}

/**
 * Consumer-side counterpart to buildFilterQueryString, for browser apps that feed a
 * filterQuery into their `navigate` tool. The dataset_data subagent returns filterQuery as
 * a complete query string and the caller is told to pass it verbatim, but LLMs sometimes
 * wrap it as "filterQuery=<the whole query string>". Detect that single-param mistake and
 * return the inner query string; otherwise return the input unchanged.
 */
export function unwrapFilterQuery (query: string | undefined): string | undefined {
  if (!query) return query
  const match = /^filterQuery=(.+)$/s.exec(query.trim())
  if (!match) return query
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
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
      // _geopoint/_geocorners are stored lat,lon — warn that geo_distance/bbox filters use the reverse order
      if (col.key === '_geopoint' || col.key === '_geocorners') notes.push('⚠️ geo_distance/bbox filters use the REVERSE order (lon,lat)')
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
