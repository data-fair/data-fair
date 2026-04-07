import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createPatch } from 'diff'
import { serializeDatasetInfo } from './agent-tools'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readDatasetChanges: 'Lire les modifications du jeu de données',
    changesSummarizerSubAgent: 'Résumer les modifications du jeu de données',
    changesSummarizerSubAgentDesc: 'Lire le diff des modifications de métadonnées du jeu de données, puis les résumer.'
  },
  en: {
    readDatasetChanges: 'Read dataset changes',
    changesSummarizerSubAgent: 'Summarize dataset changes',
    changesSummarizerSubAgentDesc: 'Read the diff of the dataset metadata changes, then summarize them.'
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
      const original = serverData.value ? serializeDatasetInfo(serverData.value, { includeOwner: true }) : ''
      const current = data.value ? serializeDatasetInfo(data.value, { includeOwner: true }) : ''
      if (original === current) return 'No changes detected.'
      return createPatch('dataset', original, current, 'original', 'edited')
    }
  })

  const changesSummarizerPrompts: Record<string, string> = {
    fr: `Tu es un réviseur de modifications de métadonnées pour Data Fair, une plateforme de publication de données ouvertes. Tu aides les utilisateurs à comprendre ce qu'ils ont modifié avant de sauvegarder.

Tâche :
1. Appelle read_dataset_changes pour obtenir le diff unifié des modifications de métadonnées.
2. Produis un résumé concis et lisible de ce qui a changé.

Concentre-toi sur les différences significatives : titre, description, modifications du schéma (colonnes ajoutées/supprimées/renommées), licence, thématiques, mots-clés. Ignore les champs internes ou les changements triviaux d'espacement.

Format :
- Texte brut, pas de markdown, pas de retours à la ligne
- Maximum 500 caractères
- Rédige dans la même langue que le contenu du jeu de données
- Si aucun changement significatif n'est trouvé, indique-le clairement`,
    en: `You are a metadata change reviewer for Data Fair, an open data publishing platform. You help users understand what they modified before saving.

Task:
1. Call read_dataset_changes to get a unified diff of the metadata changes.
2. Produce a concise, human-readable summary of what changed.

Focus on meaningful differences: title, description, schema changes (added/removed/renamed columns), license, topics, keywords. Ignore internal fields or trivial whitespace changes.

Format:
- Plain text, no markdown, no line breaks
- Keep it under 500 characters
- Write in the same language as the dataset content
- If no meaningful changes are found, say so clearly`
  }

  useAgentSubAgent({
    name: 'dataset_changes_summarizer',
    title: t('changesSummarizerSubAgent'),
    description: t('changesSummarizerSubAgentDesc'),
    model: 'summarizer',
    prompt: changesSummarizerPrompts[locale.value] ?? changesSummarizerPrompts.en,
    tools: ['read_dataset_changes']
  })
}
