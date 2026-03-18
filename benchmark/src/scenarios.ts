export interface Scenario {
  name: string
  description: string
  datasetId: string
  queryParams: string
}

export const scenarios: Scenario[] = [
  {
    name: 'simple-list',
    description: 'Baseline paginated list',
    datasetId: 'bench-large',
    queryParams: 'size=20'
  },
  {
    name: 'fulltext-search',
    description: 'Full-text search',
    datasetId: 'bench-large',
    queryParams: 'q=analyse+population&size=20'
  },
  {
    name: 'filter-eq',
    description: 'Exact match filter',
    datasetId: 'bench-large',
    queryParams: 'str2_eq=cat-alpha&size=20'
  },
  {
    name: 'filter-range',
    description: 'Range filter',
    datasetId: 'bench-large',
    queryParams: 'num1_gte=200&num1_lte=800&size=20'
  },
  {
    name: 'sort',
    description: 'Sort by integer field',
    datasetId: 'bench-large',
    queryParams: 'sort=num1&size=20'
  },
  {
    name: 'deep-pagination',
    description: 'Deep offset pagination',
    datasetId: 'bench-large',
    queryParams: 'page=500&size=20&sort=_i'
  },
  {
    name: 'geo-bbox',
    description: 'Geo bounding box filter',
    datasetId: 'bench-large',
    queryParams: 'bbox=-5,42,8,51&size=20'
  },
  {
    name: 'combined',
    description: 'Search + filter + sort combined',
    datasetId: 'bench-large',
    queryParams: 'q=analyse&num1_gte=100&sort=num1&size=20'
  },
  {
    name: 'small-dataset',
    description: 'Small dataset baseline',
    datasetId: 'bench-small',
    queryParams: 'size=20'
  }
]
