import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createPatch } from 'diff'
import { serializeDatasetInfo } from './agent-tools'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readDatasetChanges: 'Lire les modifications du jeu de données',
    changesSummarizerSubAgent: 'Résumer les modifications du jeu de données'
  },
  en: {
    readDatasetChanges: 'Read dataset changes',
    changesSummarizerSubAgent: 'Summarize dataset changes'
  }
}

export function useAgentDatasetChangesSummaryTools (locale: Ref<string>, data: Ref<any>, serverData: Ref<any>) {
  const t = (key: string) => messages[locale.value]?.[key] ?? messages.en[key] ?? key

  useAgentTool({
    name: 'read_dataset_changes',
    description: 'Read a unified diff of the changes made to the dataset metadata. Lines prefixed with - are removed, lines prefixed with + are added.',
    annotations: { title: t('readDatasetChanges'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      const original = serverData.value ? serializeDatasetInfo(serverData.value) : ''
      const current = data.value ? serializeDatasetInfo(data.value) : ''
      if (original === current) return 'No changes detected.'
      return createPatch('dataset', original, current, 'original', 'edited')
    }
  })

  useAgentSubAgent({
    name: 'dataset_changes_summarizer',
    title: t('changesSummarizerSubAgent'),
    description: t('changesSummarizerSubAgent') + '. Read the diff of the dataset metadata changes, then summarize them.',
    model: 'summarizer',
    prompt: 'You are a dataset change summarization assistant. Call read_dataset_changes to get a unified diff of the changes. Then produce a concise, human-readable summary of what changed. Focus on meaningful differences (title, description, schema changes, etc.). The summary should be plain text, no markdown, no line breaks. Write in the same language as the dataset content.',
    tools: ['read_dataset_changes']
  })
}
