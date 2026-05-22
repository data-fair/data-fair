export interface Scenario {
  name: string
  description: string
  datasetId: string
  queryParams: string
}

// Field names follow the generator's naming: full-text strings `text<n>`,
// keyword strings `kw<n>`, integers `int<n>`, numbers `num<n>`, dates `date<n>`.
// The `bench-mixed` preset has all of these plus geo (lat/lon).
export const scenarios: Scenario[] = [
  { name: 'simple-list', description: 'Baseline paginated list', datasetId: 'bench-mixed', queryParams: 'size=20' },
  { name: 'fulltext-search', description: 'Full-text search', datasetId: 'bench-mixed', queryParams: 'q=analyse+population&size=20' },
  { name: 'filter-eq', description: 'Exact match filter', datasetId: 'bench-mixed', queryParams: 'kw1_eq=cat-alpha&size=20' },
  { name: 'filter-range', description: 'Range filter', datasetId: 'bench-mixed', queryParams: 'int1_gte=200&int1_lte=800&size=20' },
  { name: 'sort', description: 'Sort by integer field', datasetId: 'bench-mixed', queryParams: 'sort=int1&size=20' },
  { name: 'deep-pagination', description: 'Deep offset pagination', datasetId: 'bench-mixed', queryParams: 'page=500&size=20&sort=_i' },
  { name: 'geo-bbox', description: 'Geo bounding box filter', datasetId: 'bench-mixed', queryParams: 'bbox=-5,42,8,51&size=20' },
  { name: 'combined', description: 'Search + filter + sort combined', datasetId: 'bench-mixed', queryParams: 'q=analyse&int1_gte=100&sort=int1&size=20' },
  { name: 'small-dataset', description: 'Small dataset baseline', datasetId: 'bench-small', queryParams: 'size=20' }
]
