import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import * as listDatasets from '@data-fair/agent-tools-data-fair/list-datasets.ts'
import * as describeDataset from '@data-fair/agent-tools-data-fair/describe-dataset.ts'

export { formatResult as serializeDatasetInfo } from '@data-fair/agent-tools-data-fair/describe-dataset.ts'

export function useAgentDatasetTools (locale: Ref<string>) {
  useAgentTool({
    ...listDatasets.schema,
    annotations: { title: (listDatasets.annotations as any)[locale.value]?.title ?? listDatasets.annotations.en.title, readOnlyHint: true },
    execute: async (params) => {
      const { path, query } = listDatasets.buildQuery(params)
      const data = await $fetch<any>(path, { query })
      const page = Math.max(params.page || 1, 1)
      const size = Math.min(Math.max(params.size || 10, 1), 50)
      return listDatasets.formatResult(data, page, size)
    }
  })

  useAgentTool({
    ...describeDataset.schema,
    annotations: { title: (describeDataset.annotations as any)[locale.value]?.title ?? describeDataset.annotations.en.title, readOnlyHint: true },
    execute: async (params) => {
      const dataset = await $fetch<any>(`datasets/${encodeURIComponent(params.datasetId)}`)
      return describeDataset.formatResult(dataset, { includeOwner: true })
    }
  })
}
