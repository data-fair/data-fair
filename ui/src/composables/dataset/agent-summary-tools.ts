import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createAgentTranslator, fetchSampleRows, toCsv } from '~/composables/agent/utils'
import { serializeDatasetInfo } from './agent-tools'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readDatasetInfo: 'Lire les informations du jeu de données',
    summarizerSubAgent: 'Résumer un jeu de données',
    summarizerSubAgentDesc: 'Lire les métadonnées et le schéma du jeu de données, puis produire un résumé concis.'
  },
  en: {
    readDatasetInfo: 'Read dataset info',
    summarizerSubAgent: 'Summarize a dataset',
    summarizerSubAgentDesc: 'Read the dataset metadata and schema, then produce a concise summary.'
  }
}

export function useAgentDatasetSummaryTools (locale: Ref<string>, datasetData: Ref<any>) {
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
      const info = serializeDatasetInfo(dataset, { includeOwner: true })
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
- Utilise les données d'exemple retournées par read_dataset_info pour comprendre le contenu réel, mais **ne recopie aucune valeur**.
- **Décris la nature du jeu, pas son contenu du jour.** Le résumé survit aux mises à jour : pas de nombre de lignes, pas de valeurs d'énumération, pas de liste de modalités, pas de bornes chiffrées, pas de date de dernière mise à jour. Le millésime ou la période de référence font partie du sujet et restent, eux, légitimes.

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
- Use the sample data returned by read_dataset_info to understand the real content, but **never quote a value from it**.
- **Describe what the dataset is, not what it currently holds.** The summary must survive the next update: no row count, no enum values, no list of modalities, no numeric bounds, no last-update date. A vintage or a reference period is part of the subject and stays.

Example of a good summary (French):
"Recense les bornes de recharge pour véhicules électriques en France métropolitaine, avec leur localisation, puissance, type de connecteur et disponibilité en temps réel."`
  }

  useAgentSubAgent({
    name: 'dataset_summarizer',
    title: t('summarizerSubAgent'),
    description: t('summarizerSubAgentDesc'),
    model: 'summarizer',
    // Producer: the lead agent consumes its returned summary and applies it via
    // set_dataset_metadata. Keep it delegated even when the host enables the flatten toggle.
    delegateOnly: true,
    prompt: summarizerPrompts[locale.value] ?? summarizerPrompts.en,
    tools: ['read_dataset_info']
  })
}
