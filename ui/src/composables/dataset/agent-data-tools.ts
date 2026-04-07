import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import * as searchData from '@data-fair/agent-tools-data-fair/search-data.ts'
import * as aggregateData from '@data-fair/agent-tools-data-fair/aggregate-data.ts'
import * as calculateMetric from '@data-fair/agent-tools-data-fair/calculate-metric.ts'
import * as getFieldValues from '@data-fair/agent-tools-data-fair/get-field-values.ts'
import * as getDatasetSchema from '@data-fair/agent-tools-data-fair/get-dataset-schema.ts'
import * as datasetDataSubagent from '@data-fair/agent-tools-data-fair/dataset-data-subagent.ts'

function title (annotations: Record<string, { title: string }>, locale: string): string {
  return annotations[locale]?.title ?? annotations.en.title
}

export function useAgentDatasetDataTools (locale: Ref<string>) {
  useAgentTool({
    ...getDatasetSchema.schema,
    annotations: { title: title(getDatasetSchema.annotations, locale.value), readOnlyHint: true },
    execute: async (params) => {
      const { schemaReq, samplesReq } = getDatasetSchema.buildQuery(params)
      const [dataset, linesData] = await Promise.all([
        $fetch<any>(schemaReq.path, { query: schemaReq.query }),
        $fetch<any>(samplesReq.path, { query: samplesReq.query })
      ])
      return getDatasetSchema.formatResult(dataset, linesData)
    }
  })

  useAgentTool({
    ...searchData.schema,
    annotations: { title: title(searchData.annotations, locale.value), readOnlyHint: true },
    execute: async (params) => {
      let data: any
      if (params.next) {
        data = await $fetch<any>(params.next)
      } else {
        const { path, query } = searchData.buildQuery(params)
        data = await $fetch<any>(path, { query })
      }
      const result = searchData.formatResult(data, params)
      return { content: [{ type: 'text' as const, text: result.text }], structuredContent: result.structuredContent }
    }
  })

  useAgentTool({
    ...aggregateData.schema,
    annotations: { title: title(aggregateData.annotations, locale.value), readOnlyHint: true },
    execute: async (params) => {
      const { path, query } = aggregateData.buildQuery(params)
      const data = await $fetch<any>(path, { query })
      const result = aggregateData.formatResult(data, params)
      return { content: [{ type: 'text' as const, text: result.text }], structuredContent: result.structuredContent }
    }
  })

  useAgentTool({
    ...calculateMetric.schema,
    annotations: { title: title(calculateMetric.annotations, locale.value), readOnlyHint: true },
    execute: async (params) => {
      const { path, query } = calculateMetric.buildQuery(params)
      const data = await $fetch<any>(path, { query })
      const result = calculateMetric.formatResult(data, params)
      return { content: [{ type: 'text' as const, text: result.text }], structuredContent: result.structuredContent }
    }
  })

  useAgentTool({
    ...getFieldValues.schema,
    annotations: { title: title(getFieldValues.annotations, locale.value), readOnlyHint: true },
    execute: async (params) => {
      const { path, query } = getFieldValues.buildQuery(params)
      const values = await $fetch<any>(path, { query })
      const result = getFieldValues.formatResult(values, params)
      return { content: [{ type: 'text' as const, text: result.text }], structuredContent: result.structuredContent }
    }
  })

  const ann = (datasetDataSubagent.annotations as any)[locale.value] ?? datasetDataSubagent.annotations.en
  useAgentSubAgent({
    name: 'dataset_data',
    title: ann.title,
    description: ann.description,
    prompt: datasetDataSubagent.prompt,
    tools: [...datasetDataSubagent.tools]
  })
}
