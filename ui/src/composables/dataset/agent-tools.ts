import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import * as listDatasets from '@data-fair/agent-tools-data-fair/list-datasets.ts'
import * as describeDataset from '@data-fair/agent-tools-data-fair/describe-dataset.ts'

export function serializeDatasetInfo (dataset: any, options?: { includeOwner?: boolean }): string {
  return describeDataset.formatResult(dataset, options).text
}

export function useAgentDatasetTools (locale: Ref<string>) {
  useAgentTool({
    ...listDatasets.schema,
    annotations: { title: (listDatasets.annotations as any)[locale.value]?.title ?? listDatasets.annotations.en.title, readOnlyHint: true },
    execute: async (params) => {
      const { path, query } = listDatasets.buildQuery(params)
      const data = await $fetch<any>(path, { query })
      const page = Math.max(params.page || 1, 1)
      const size = Math.min(Math.max(params.size || 10, 1), 50)
      const result = listDatasets.formatResult(data, page, size)
      return { content: [{ type: 'text' as const, text: result.text }], structuredContent: result.structuredContent }
    }
  })

  useAgentTool({
    ...describeDataset.schema,
    annotations: { title: (describeDataset.annotations as any)[locale.value]?.title ?? describeDataset.annotations.en.title, readOnlyHint: true },
    execute: async (params) => {
      const dataset = await $fetch<any>(`datasets/${encodeURIComponent(params.datasetId)}`)
      const result = describeDataset.formatResult(dataset, { includeOwner: true })
      return { content: [{ type: 'text' as const, text: result.text }], structuredContent: result.structuredContent }
    }
  })
}
