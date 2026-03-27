import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { serializeDatasetInfo } from './agent-tools'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readDatasetInfo: 'Lire les informations du jeu de données',
    setDatasetSummary: 'Définir le résumé du jeu de données',
    summarizerSubAgent: 'Résumer un jeu de données'
  },
  en: {
    readDatasetInfo: 'Read dataset info',
    setDatasetSummary: 'Set dataset summary',
    summarizerSubAgent: 'Summarize a dataset'
  }
}

export function useAgentDatasetSummaryTools (locale: Ref<string>, datasetData: Ref<any>, setSummary: (summary: string) => void) {
  const t = (key: string) => messages[locale.value]?.[key] ?? messages.en[key] ?? key

  useAgentTool({
    name: 'read_dataset_info',
    description: 'Read the full metadata and schema of the current dataset being edited. Returns title, description, status, owner, column schema, etc.',
    annotations: { title: t('readDatasetInfo'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      return serializeDatasetInfo(datasetData.value)
    }
  })

  useAgentTool({
    name: 'set_dataset_summary',
    description: 'Set the summary field of the dataset currently being edited.',
    annotations: { title: t('setDatasetSummary') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string' as const, description: 'The summary text to set' }
      },
      required: ['summary'] as const
    },
    execute: async (params) => {
      setSummary(params.summary)
      return 'Summary updated successfully.'
    }
  })

  useAgentSubAgent({
    name: 'dataset_summarizer',
    title: t('summarizerSubAgent'),
    description: t('summarizerSubAgent') + '. Read the dataset metadata and schema, then produce a concise summary.',
    model: 'summarizer',
    prompt: 'You are a dataset summarization assistant. First call read_dataset_info to get the full metadata and schema of the dataset. Then write a summary that describes the content and purpose of the dataset based on its title, description, columns, and other metadata. The summary MUST be between 200 and 300 characters long, plain text only with no formatting, no markdown, no line breaks. The summary should be in the same language as the dataset title and description.',
    tools: ['read_dataset_info']
  })
}
