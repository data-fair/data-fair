import type { Ref } from 'vue'
import { useAgentTool, useAgentSkill } from '@data-fair/lib-vue-agents'
import { createAgentTranslator, fetchSampleRows, toCsv } from '~/composables/agent/utils'
import { serializeDatasetInfo } from './agent-tools'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readDatasetInfo: 'Lire les informations du jeu de données'
  },
  en: {
    readDatasetInfo: 'Read dataset info'
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
    fr: `Rédiger le résumé d'un jeu de données Data Fair, une plateforme de publication de données ouvertes. Les résumés sont affichés dans les catalogues pour aider les utilisateurs à comprendre rapidement le contenu d'un jeu de données.

Tâche :
1. Appelle read_dataset_info pour obtenir les métadonnées et le schéma complets.
2. Rédige un résumé décrivant le contenu et l'objectif du jeu de données à partir de son titre, sa description, ses colonnes et autres métadonnées.
3. Présente le résumé à l'utilisateur et demande son accord avant de l'appliquer avec set_dataset_metadata (champ summary).

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
    en: `Writing the summary of a Data Fair dataset, an open data publishing platform. Summaries are displayed in dataset catalogs to help users quickly understand what a dataset contains.

Task:
1. Call read_dataset_info to get the full metadata and schema.
2. Write a summary describing the content and purpose of the dataset based on its title, description, columns, and other metadata.
3. Show the summary to the user and ask for their approval before applying it with set_dataset_metadata (summary field).

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

  useAgentSkill({
    name: 'write-dataset-summary',
    description: 'How to write the catalog summary of the current dataset. Load it before proposing one.',
    body: summarizerPrompts[locale.value] ?? summarizerPrompts.en
  })

  const searchTermsPrompts: Record<string, string> = {
    fr: `Proposer des termes de recherche cachés pour un jeu de données publié sur Data Fair. Ces termes ne sont affichés dans aucune interface : ils servent uniquement à ce que la recherche textuelle du catalogue retrouve le jeu de données quand quelqu'un emploie d'autres mots que ceux du titre ou du résumé. Ils restent toutefois présents dans la réponse API publique du jeu de données : ne propose rien de confidentiel ou de jargon interne.

Tâche :
1. Appelle read_dataset_info pour obtenir les métadonnées, le schéma (libellés et descriptions de colonnes, valeurs d'énumération) et des exemples.
2. Propose une liste de 10 à 40 termes ou expressions courtes, un par ligne.
3. Présente-la à l'utilisateur et demande son accord avant de l'appliquer avec set_dataset_metadata (champ searchTerms).

Règles :
- Ne répète pas les mots déjà présents dans le titre, le résumé ou les mots-clés : ils sont déjà indexés.
- Donne les sigles AVEC leur développement (ex. "PLU" et "plan local d'urbanisme").
- Ajoute les formulations courantes et administratives d'un même concept (ex. "HLM", "logement social", "habitat social").
- Ajoute les notions voisines qu'une personne taperait pour trouver ce jeu (ex. "élections" pour des bureaux de vote).
- Des termes ou des expressions de 1 à 4 mots, en français, sans phrase, sans ponctuation finale, sans explication.
- Pas de valeurs recopiées des données, pas de chiffres, pas de dates.`,
    en: `Proposing hidden search terms for a dataset published on Data Fair. These terms are not shown in any interface: their only purpose is to let the catalog text search find the dataset when someone uses other words than the title or summary. They are still present in the dataset's public API response, though: do not propose anything confidential or internal jargon.

Task:
1. Call read_dataset_info to get the metadata, the schema (column titles and descriptions, enum values) and samples.
2. Propose a list of 10 to 40 short terms or expressions, one per line.
3. Show it to the user and ask for their approval before applying it with set_dataset_metadata (searchTerms field).

Rules:
- Do not repeat words already in the title, summary or keywords: they are already indexed.
- Give acronyms WITH their expansion (e.g. "PLU" and "plan local d'urbanisme").
- Add everyday and administrative wordings of the same concept (e.g. "HLM", "logement social", "habitat social").
- Add neighbouring notions a person would type to find this dataset (e.g. "élections" for polling stations).
- Terms of 1 to 4 words, in the language of the dataset, no sentences, no trailing punctuation, no explanation.
- No values copied from the data, no numbers, no dates.`
  }

  useAgentSkill({
    name: 'write-search-terms',
    description: 'How to propose the hidden catalog search terms of the current dataset (synonyms, acronyms, everyday wording). Load it before proposing them.',
    body: searchTermsPrompts[locale.value] ?? searchTermsPrompts.en
  })
}
