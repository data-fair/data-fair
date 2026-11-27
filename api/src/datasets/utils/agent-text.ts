/**
 * The agent text of the data queries: with `agent_text=true`, the lines, values_agg and metric_agg
 * routes add `agentText` to their JSON answer, the text an assistant reads. It is rendered by the
 * formatters of the page tools (@data-fair/agent-tools-data-fair), so the MCP tools (which point
 * openapi-mcp's `response.text` at it, see api/contract/x-agent.ts) and the page tools give the
 * same text: one implementation per read. This module only maps the API query to the formatters'
 * params, and adds the absolute links to the filtered table (and map) of the dataset's page for
 * the calling host: the portal's page on a portal, else the back-office's.
 */
import type { Request } from 'express'
import * as searchData from '@data-fair/agent-tools-data-fair/search-data.ts'
import * as aggregateData from '@data-fair/agent-tools-data-fair/aggregate-data.ts'
import * as calculateMetric from '@data-fair/agent-tools-data-fair/calculate-metric.ts'
import { filterSuffixes } from '../es/commons.ts'
import { setResourceLinks } from '../../misc/utils/find.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { reqPublicationSite } from '../../misc/utils/publication-sites.ts'

type Query = Record<string, any>

export const wantsAgentText = (query: Query) => query.agent_text === 'true'

const str = (value: any): string | undefined => typeof value === 'string' && value ? value : undefined

/** The params every page query tool shares: the text search, column filters, geo and date filters. */
const commonParams = (datasetId: string, query: Query) => {
  const filters: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (filterSuffixes.some(suffix => key.endsWith(suffix))) filters[key] = String(value)
  }
  return {
    datasetId,
    q: str(query.q) ?? str(query._c_q),
    filters: Object.keys(filters).length ? filters : undefined,
    bbox: str(query.bbox) ?? str(query._c_bbox),
    geoDistance: str(query.geo_distance) ?? str(query._c_geo_distance),
    dateMatch: str(query.date_match) ?? str(query._c_date_match)
  }
}

export const searchDataParams = (datasetId: string, query: Query): searchData.Params => ({
  ...commonParams(datasetId, query),
  select: str(query.select),
  sort: str(query.sort),
  page: query.page ? Number(query.page) : undefined
})

export const aggregateDataParams = (datasetId: string, query: Query): aggregateData.Params => ({
  ...commonParams(datasetId, query),
  groupByColumns: (str(query.field) ?? '').split(',').map(s => s.trim()).filter(Boolean),
  metric: str(query.metric) ? { type: query.metric, column: str(query.metric_field) } : undefined,
  sort: str(query.sort)
})

export const calculateMetricParams = (datasetId: string, query: Query): calculateMetric.Params => ({
  ...commonParams(datasetId, query),
  fieldKey: str(query.field) ?? '',
  metric: str(query.metric) ?? '',
  percents: str(query.percents)
})

/** The dataset's page for the host of the request, as the dataset read answers it in `page`. */
const datasetPage = (req: Request, dataset: { id?: string, slug?: string }): string => {
  const links: { id?: string, slug?: string, page?: string } = { id: dataset.id, slug: dataset.slug }
  setResourceLinks(links, 'dataset', reqPublicBaseUrl(req), reqPublicationSite(req)?.datasetUrlTemplate ?? null, null)
  return links.page as string
}

/**
 * The formatter's text, then the links: the filter query of the links is the one of the text's
 * "Filter query:" line, so the link opens the view the line describes.
 */
const withLinks = (req: Request, dataset: any, text: string): string => {
  const filterQuery = /^Filter query: (.*)$/m.exec(text)?.[1]
  const page = datasetPage(req, dataset)
  const view = (name: string) => `${page}/${name}${filterQuery ? '?' + filterQuery : ''}`
  const lines = [text, '', `Table: ${view('table')}`]
  if (dataset.bbox) lines.push(`Map: ${view('map')}`)
  return lines.join('\n')
}

/** The MCP tool pages with `after` (the value the next URL carries), it has no `next` input. */
export const nextPageLine = (next: string): string => {
  const after = new URL(next).searchParams.get('after')
  return after ? `Next page available: call again with after set to this value:\n${after}` : ''
}

export const searchDataText = (req: Request, dataset: any, body: any) =>
  withLinks(req, dataset, searchData.formatResult(body, searchDataParams(dataset.id, req.query), { nextPage: nextPageLine }).text)

export const aggregateDataText = (req: Request, dataset: any, body: any) =>
  withLinks(req, dataset, aggregateData.formatResult(body, aggregateDataParams(dataset.id, req.query)).text)

export const calculateMetricText = (req: Request, dataset: any, body: any) =>
  withLinks(req, dataset, calculateMetric.formatResult(body, calculateMetricParams(dataset.id, req.query)).text)
