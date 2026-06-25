import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $agentFetch, $sitePath } from '~/context'
import { toAbsoluteUrl } from '~/composables/agent/url-utils'
import * as listDatasets from '@data-fair/agent-tools-data-fair/list-datasets'
import * as describeDataset from '@data-fair/agent-tools-data-fair/describe-dataset'

// Back-office page URL for a dataset on the CURRENT site. The router base is
// `$sitePath + '/data-fair/'` (see ui/src/main.ts), so this resolves correctly even when
// the back-office is served on a secondary domain — unlike the API `page` field, which
// points at the public portal (or the primary back-office via its fallback).
const datasetBackOfficeLink = (d: any) => toAbsoluteUrl(window.location.origin, $sitePath + '/data-fair/', `/dataset/${d.id}`)

export function serializeDatasetInfo (dataset: any, options?: { includeOwner?: boolean }): string {
  return describeDataset.formatResult(dataset, { ...options, datasetLink: datasetBackOfficeLink }).text
}

export function useAgentDatasetTools (locale: Ref<string>) {
  useAgentTool({
    ...listDatasets.schema,
    annotations: { title: (listDatasets.annotations as any)[locale.value]?.title ?? listDatasets.annotations.en.title, readOnlyHint: true },
    execute: async (params) => {
      const { path, query } = listDatasets.buildQuery(params)
      const data = await $agentFetch<any>(path, { query })
      const page = Math.max(params.page || 1, 1)
      const size = Math.min(Math.max(params.size || 10, 1), 50)
      const result = listDatasets.formatResult(data, page, size, { datasetLink: datasetBackOfficeLink })
      return { content: [{ type: 'text' as const, text: result.text }], structuredContent: result.structuredContent }
    }
  })

  useAgentTool({
    ...describeDataset.schema,
    annotations: { title: (describeDataset.annotations as any)[locale.value]?.title ?? describeDataset.annotations.en.title, readOnlyHint: true },
    execute: async (params) => {
      const dataset = await $agentFetch<any>(`datasets/${encodeURIComponent(params.datasetId)}`)
      const result = describeDataset.formatResult(dataset, { includeOwner: true, datasetLink: datasetBackOfficeLink })
      return { content: [{ type: 'text' as const, text: result.text }], structuredContent: result.structuredContent }
    }
  })
}
