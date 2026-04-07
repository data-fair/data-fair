import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createAgentTranslator, fetchSampleRows, toCsv } from '~/composables/agent/utils'
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
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'read_dataset_info',
    description: 'Read the full metadata and schema of the current dataset being edited. Returns title, description, status, owner, column schema, etc.',
    annotations: { title: t('readDatasetInfo'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      const dataset = datasetData.value
      const info = serializeDatasetInfo(dataset)
      let sampleCsv = ''
      if (dataset?.id) {
        try {
          const { rows } = await fetchSampleRows(dataset.id, 5)
          sampleCsv = toCsv(rows)
        } catch {
          sampleCsv = '(failed to fetch sample data)'
        }
      }
      if (sampleCsv) {
        return info + '\n\n## Sample data (5 rows)\n' + sampleCsv
      }
      return info
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
      if (params.summary.length > 300) {
        return `Error: summary is ${params.summary.length} characters long, it must be 300 characters or less. Please shorten it and try again.`
      }
      const genericStarts = ['this dataset is', 'ce jeu de données est']
      if (genericStarts.some(s => params.summary.toLowerCase().startsWith(s))) {
        return 'Error: the summary must not start with a generic phrase like "This dataset is..." or "Ce jeu de données est...". Please rephrase with a more direct and specific opening.'
      }
      setSummary(params.summary)
      return 'Summary updated successfully.'
    }
  })

  const summarizerPrompts: Record<string, string> = {
    fr: `Tu es un expert en résumé de jeux de données pour Data Fair, une plateforme de publication de données ouvertes. Les résumés sont affichés dans les catalogues pour aider les utilisateurs à comprendre rapidement le contenu d'un jeu de données.

Tâche :
1. Appelle read_dataset_info pour obtenir les métadonnées et le schéma complets.
2. Rédige un résumé décrivant le contenu et l'objectif du jeu de données à partir de son titre, sa description, ses colonnes et autres métadonnées.
3. Renvoie le texte du résumé comme réponse finale.

Format :
- 300 caractères maximum (entre 200 et 300 idéalement)
- Texte brut uniquement : pas de formatage, pas de markdown, pas de retours à la ligne
- Ton accessible — le public va des analystes de données au grand public
- Rédige dans la même langue que le titre et la description du jeu de données
- Ne commence JAMAIS par "Ce jeu de données est..." ou une formulation générique similaire. Commence directement par le sujet concret.
- Utilise les données d'exemple retournées par read_dataset_info pour mieux comprendre le contenu réel.

Exemple de bon résumé :
"Recense les bornes de recharge pour véhicules électriques en France métropolitaine, avec leur localisation, puissance, type de connecteur et disponibilité en temps réel."`,
    en: `You are a dataset summarization expert for Data Fair, an open data publishing platform. Summaries are displayed in dataset catalogs to help users quickly understand what a dataset contains.

Task:
1. Call read_dataset_info to get the full metadata and schema.
2. Write a summary describing the content and purpose of the dataset based on its title, description, columns, and other metadata.
3. Return the summary text as your final response.

Format:
- 300 characters maximum (ideally between 200 and 300)
- Plain text only: no formatting, no markdown, no line breaks
- Use an accessible tone — the audience ranges from data analysts to general public users
- Write in the same language as the dataset title and description
- NEVER start with "This dataset is..." or similar generic phrasing. Start directly with the concrete subject.
- Use the sample data returned by read_dataset_info to better understand the actual content.

Example of a good summary (French):
"Recense les bornes de recharge pour véhicules électriques en France métropolitaine, avec leur localisation, puissance, type de connecteur et disponibilité en temps réel."`
  }

  useAgentSubAgent({
    name: 'dataset_summarizer',
    title: t('summarizerSubAgent'),
    description: t('summarizerSubAgentDesc'),
    model: 'summarizer',
    prompt: summarizerPrompts[locale.value] ?? summarizerPrompts.en,
    tools: ['read_dataset_info']
  })
}
