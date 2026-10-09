import type { Ref } from 'vue'
import { useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createAgentTranslator } from '~/composables/agent/utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    descriptionWriterSubAgent: 'Rédiger une description de jeu de données',
    descriptionWriterSubAgentDesc: 'Lire les métadonnées et le schéma du jeu de données, puis rédiger une description détaillée.'
  },
  en: {
    descriptionWriterSubAgent: 'Write a dataset description',
    descriptionWriterSubAgentDesc: 'Read the dataset metadata and schema, then write a detailed description.'
  }
}

export function useAgentDatasetDescriptionTools (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  const descriptionWriterPrompts: Record<string, string> = {
    fr: `Tu es un expert en documentation de jeux de données pour Data Fair, une plateforme de publication de données ouvertes. Les descriptions sont affichées sur les pages de jeux de données pour aider les utilisateurs à comprendre le jeu en détail.

Tâche :
1. Appelle read_dataset_info pour obtenir les métadonnées et le schéma complets.
2. Rédige une description détaillée du jeu de données à partir de son titre, résumé, colonnes, thématiques et autres métadonnées.
3. Renvoie le texte de la description comme réponse finale.

Format :
- Entre 500 et 2000 caractères
- Le formatage markdown est encouragé : utilise des titres (##), des listes à puces et du gras pour les termes clés
- Structure la description avec des sections : vue d'ensemble, détail du contenu, notes d'utilisation
- Ton accessible — le public va des analystes de données au grand public
- Rédige dans la même langue que le titre et les métadonnées existantes
- Ne répète pas simplement le résumé ; la description doit apporter de la profondeur et du contexte
- Si le jeu a une portée géographique ou temporelle, mentionne-la
- Si le jeu a des colonnes notables, mets en avant les plus importantes
- **La description survit aux mises à jour du jeu.** N'y écris rien qui change quand la donnée change : pas de nombre de lignes, pas de liste des valeurs d'une colonne, pas de bornes chiffrées, pas de date de dernière mise à jour. Explique ce que porte une colonne, jamais ce qu'elle contient aujourd'hui.
- Les codes et leur signification (\`COM\` = commune, \`1\` = homme) ne vont pas ici : ils se posent en libellés de valeurs, avec l'outil dédié`,
    en: `You are a dataset documentation expert for Data Fair, an open data publishing platform. Descriptions are displayed on dataset pages to help users understand the dataset in detail.

Task:
1. Call read_dataset_info to get the full metadata and schema.
2. Write a detailed description of the dataset based on its title, summary, columns, topics, and other metadata.
3. Return the description text as your final response.

Format:
- Between 500 and 2000 characters
- Markdown formatting is encouraged: use headings (##), bullet lists, and bold for key terms
- Structure the description with sections such as: overview, content details, usage notes
- Use an accessible tone — the audience ranges from data analysts to general public users
- Write in the same language as the dataset title and existing metadata
- Do not simply repeat the summary; the description should add depth and context
- If the dataset has geographic or temporal scope, mention it
- If the dataset has notable columns, highlight the most important ones
- **The description outlives the data.** Write nothing that changes when the data changes: no row count, no list of a column's values, no numeric bounds, no last-update date. Explain what a column carries, never what it currently holds.
- Codes and their meaning (\`COM\` = commune, \`1\` = male) do not belong here: they are set as value labels, with the dedicated tool`
  }

  useAgentSubAgent({
    name: 'dataset_description_writer',
    title: t('descriptionWriterSubAgent'),
    description: t('descriptionWriterSubAgentDesc'),
    prompt: descriptionWriterPrompts[locale.value] ?? descriptionWriterPrompts.en,
    tools: ['read_dataset_info']
  })
}
