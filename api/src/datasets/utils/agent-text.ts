/**
 * The agent text of the data queries: with `agent_text=true`, the lines, values_agg and metric_agg
 * routes, and the dataset read, add `agentText` to their JSON answer, the text an assistant reads. It is rendered by the
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
import * as describeDataset from '@data-fair/agent-tools-data-fair/describe-dataset.ts'
import { buildFilterQueryString } from '@data-fair/agent-tools-data-fair/_utils.ts'
import { filterSuffixes } from '../es/commons.ts'
import { setResourceLinks } from '../../misc/utils/find.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { reqPublicationSite } from '../../misc/utils/publication-sites.ts'
import { performanceAdviceIntro } from '../../misc/utils/query-advice.ts'

type Query = Record<string, any>

export const wantsAgentText = (query: Query) => query.agent_text === 'true'

/**
 * The largest lines page rendered as agent text, the MCP search tool's max size: the text keeps
 * every row of the page in memory, so a larger page answers without `agentText`.
 */
export const agentTextMaxSize = 100

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
 * The formatter's text, then the links: their filter query is built from the params the formatter
 * printed its "Filter query:" line from (not read back from the text, where a cell can hold such a
 * line), so the link opens the view the line describes.
 */
const withLinks = (req: Request, dataset: any, text: string, filterQuery: string | undefined): string => {
  const page = datasetPage(req, dataset)
  const view = (name: string) => `${page}/${name}${filterQuery ? '?' + filterQuery : ''}`
  const lines = [text, '', `Table: ${view('table')}`]
  if (dataset.bbox) lines.push(`Map: ${view('map')}`)
  return lines.join('\n')
}

/**
 * The MCP tool pages with `after` (the value the next URL carries), it has no `next` input. A next
 * URL without `after` (page numbers) is a page the tool cannot reach: no line.
 */
export const nextPageLine = (next: string): string => {
  const after = new URL(next).searchParams.get('after')
  return after ? `Next page available: call again with after set to this value:\n${after}` : ''
}

/**
 * The body without the performance advice of meta.hints: it is written for developers and names
 * parameters the agent tools do not have (count, agg_size, q_fields). The correctness hints stay.
 */
const withoutPerformanceAdvice = (body: any) => {
  const hints = body?.meta?.hints
  if (!Array.isArray(hints)) return body
  return { ...body, meta: { ...body.meta, hints: hints.filter((h: string) => !h.startsWith(performanceAdviceIntro)) } }
}

export const searchDataText = (req: Request, dataset: any, body: any) => {
  const params = searchDataParams(dataset.id, req.query)
  return withLinks(req, dataset, searchData.formatResult(withoutPerformanceAdvice(body), params, { nextPage: nextPageLine }).text, buildFilterQueryString(params))
}

export const aggregateDataText = (req: Request, dataset: any, body: any) => {
  const params = aggregateDataParams(dataset.id, req.query)
  // the group sort is not a view's sort: the formatter leaves it out of its line too
  return withLinks(req, dataset, aggregateData.formatResult(withoutPerformanceAdvice(body), params).text, buildFilterQueryString({ ...params, sort: undefined }))
}

export const calculateMetricText = (req: Request, dataset: any, body: any) => {
  const params = calculateMetricParams(dataset.id, req.query)
  return withLinks(req, dataset, calculateMetric.formatResult(withoutPerformanceAdvice(body), params).text, buildFilterQueryString(params))
}

/**
 * The dataset read's text: the describe_dataset formatter on the dataset as the read answers it.
 * On the back-office (no portal host) the dataset link is the back-office page, which also gives
 * the editable dataset's /edit-data line; a portal has no data-entry page, so no such line there.
 */
export const describeDatasetText = (req: Request, dataset: any): string =>
  describeDataset.formatResult(dataset, reqPublicationSite(req) ? undefined : { datasetLink: () => datasetPage(req, dataset) }).text
