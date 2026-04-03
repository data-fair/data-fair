import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { serializeDatasetInfo } from './agent-tools'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readDatasetInfo: 'Lire les informations du jeu de données',
    setDatasetSummary: 'Définir le résumé du jeu de données',
    summarizerSubAgent: 'Résumer un jeu de données',
    summarizerSubAgentDesc: 'Lire les métadonnées et le schéma du jeu de données, puis produire un résumé concis.'
  },
  en: {
    readDatasetInfo: 'Read dataset info',
    setDatasetSummary: 'Set dataset summary',
    summarizerSubAgent: 'Summarize a dataset',
    summarizerSubAgentDesc: 'Read the dataset metadata and schema, then produce a concise summary.'
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
      return serializeDatasetInfo(datasetData.value, { includeOwner: true })
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
    description: t('summarizerSubAgentDesc'),
    model: 'summarizer',
    prompt: `You are a dataset summarization expert for Data Fair, an open data publishing platform. Summaries are displayed in dataset catalogs to help users quickly understand what a dataset contains.

Task:
1. Call read_dataset_info to get the full metadata and schema.
2. Write a summary describing the content and purpose of the dataset based on its title, description, columns, and other metadata.

Format:
- Between 200 and 300 characters long
- Plain text only: no formatting, no markdown, no line breaks
- Use an accessible tone — the audience ranges from data analysts to general public users
- Write in the same language as the dataset title and description

Example of a good summary (French):
"Ce jeu de données recense les bornes de recharge pour véhicules électriques en France métropolitaine, avec leur localisation, puissance, type de connecteur et disponibilité en temps réel."`,
    tools: ['read_dataset_info']
  })
}
