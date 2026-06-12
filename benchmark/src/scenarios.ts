import { getBaseUrl, getAxios, getAnonAxios, getSessionCookie, getApiKey } from './setup.ts'
import type { AxiosInstance } from 'axios'

export interface BenchContext {
  baseUrl: string
  ax: AxiosInstance
  anonAxios: AxiosInstance
  sessionCookie: string
  apiKey: string
}

export function buildContext (): BenchContext {
  return {
    baseUrl: getBaseUrl(),
    ax: getAxios(),
    anonAxios: getAnonAxios(),
    sessionCookie: getSessionCookie(),
    apiKey: getApiKey()
  }
}

export interface HttpRequestSpec {
  path: string
  method?: 'GET' | 'POST' | 'PUT'
  headers?: Record<string, string>
  body?: string
  idReplacement?: boolean
}

export interface HttpScenario {
  kind: 'http'
  name: string
  description: string
  request: (ctx: BenchContext) => HttpRequestSpec
  prepare?: (ctx: BenchContext) => Promise<void>
  expectStatus?: number
}

export interface OneShotScenario {
  kind: 'oneshot'
  name: string
  description: string
  repetitions?: number
  prepare?: (ctx: BenchContext) => Promise<void>
  run: (ctx: BenchContext) => Promise<Record<string, number>>
}

export type Scenario = HttpScenario | OneShotScenario

const lines = (datasetId: string, queryParams: string): ((ctx: BenchContext) => HttpRequestSpec) =>
  () => ({ path: `/api/v1/datasets/${datasetId}/lines?${queryParams}` })

export const scenarios: Scenario[] = [
  { kind: 'http', name: 'simple-list', description: 'Baseline paginated list', request: lines('bench-large', 'size=20') },
  { kind: 'http', name: 'fulltext-search', description: 'Full-text search', request: lines('bench-large', 'q=analyse+population&size=20') },
  { kind: 'http', name: 'filter-eq', description: 'Exact match filter', request: lines('bench-large', 'str2_eq=cat-alpha&size=20') },
  { kind: 'http', name: 'filter-range', description: 'Range filter', request: lines('bench-large', 'num1_gte=200&num1_lte=800&size=20') },
  { kind: 'http', name: 'sort', description: 'Sort by integer field', request: lines('bench-large', 'sort=num1&size=20') },
  { kind: 'http', name: 'deep-pagination', description: 'Deep offset pagination', request: lines('bench-large', 'page=500&size=20&sort=_i') },
  { kind: 'http', name: 'geo-bbox', description: 'Geo bounding box filter', request: lines('bench-large', 'bbox=-5,42,8,51&size=20') },
  { kind: 'http', name: 'combined', description: 'Search + filter + sort combined', request: lines('bench-large', 'q=analyse&num1_gte=100&sort=num1&size=20') },
  { kind: 'http', name: 'small-dataset', description: 'Small dataset baseline', request: lines('bench-small', 'size=20') }
]
