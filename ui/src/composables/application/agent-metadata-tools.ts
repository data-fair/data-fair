import type { Ref } from 'vue'
import { useAgentTool, useAgentSkill } from '@data-fair/lib-vue-agents'
import { createAgentTranslator } from '~/composables/agent/utils'
import { validateApplicationSummary } from './agent-metadata-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    setApplicationSummary: 'Définir le résumé de l\'application',
    setApplicationDescription: 'Définir la description de l\'application'
  },
  en: {
    setApplicationSummary: 'Set the application summary',
    setApplicationDescription: 'Set the application description'
  }
}

export function useAgentApplicationMetadataTools (
  locale: Ref<string>,
  setSummary: (summary: string) => void,
  setDescription: (description: string) => void
) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'set_application_summary',
    description: 'Set the summary field of the application currently being edited.',
    annotations: { title: t('setApplicationSummary') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string' as const, description: 'The summary text to set' }
      },
      required: ['summary'] as const
    },
    execute: async (params) => {
      const error = validateApplicationSummary(params.summary)
      if (error) return error
      setSummary(params.summary)
      return 'Summary updated successfully.'
    }
  })

  useAgentTool({
    name: 'set_application_description',
    description: 'Set the description field of the application currently being edited. The description supports markdown formatting.',
    annotations: { title: t('setApplicationDescription') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string' as const, description: 'The markdown description text to set' }
      },
      required: ['description'] as const
    },
    execute: async (params) => {
      setDescription(params.description)
      return 'Description updated successfully.'
    }
  })

  const summarizerPrompts: Record<string, string> = {
    fr: `Rédiger le résumé d'une application de visualisation de données Data Fair. Les résumés sont affichés dans les catalogues pour aider les utilisateurs à comprendre rapidement ce que fait une application.

Tâche :
1. Appelle describe_application puis get_application_config avec l'identifiant de l'application pour obtenir les métadonnées et la configuration.
2. Rédige un résumé décrivant ce que montre et permet l'application (type de visualisation, jeux de données utilisés, objectif).
3. Présente le résumé à l'utilisateur et demande son accord avant de l'appliquer avec set_application_summary.

Format :
- 300 caractères maximum (entre 200 et 300 idéalement)
- Texte brut uniquement : pas de formatage, pas de markdown, pas de retours à la ligne
- Ton accessible — le public va des analystes de données au grand public
- Rédige dans la même langue que le titre et les métadonnées existantes
- Ne commence JAMAIS par "Cette application est..." ou une formulation générique similaire. Commence directement par le sujet concret.`,
    en: `Writing the summary of a Data Fair data-visualization application. Summaries are displayed in catalogs to help users quickly understand what an application does.

Task:
1. Call describe_application then get_application_config with the application's id to get the metadata and configuration.
2. Write a summary describing what the application shows and lets users do (visualization type, datasets used, purpose).
3. Show the summary to the user and ask for their approval before applying it with set_application_summary.

Format:
- 300 characters maximum (ideally between 200 and 300)
- Plain text only: no formatting, no markdown, no line breaks
- Use an accessible tone — the audience ranges from data analysts to general public users
- Write in the same language as the title and existing metadata
- NEVER start with "This application is..." or similar generic phrasing. Start directly with the concrete subject.`
  }

  useAgentSkill({
    name: 'write-application-summary',
    description: 'How to write the catalog summary of the current application. Load it before proposing one.',
    body: summarizerPrompts[locale.value] ?? summarizerPrompts.en
  })

  const descriptionWriterPrompts: Record<string, string> = {
    fr: `Rédiger la description d'une application de visualisation de données Data Fair. Les descriptions sont affichées sur les pages d'application pour aider les utilisateurs à comprendre l'application en détail.

Tâche :
1. Appelle describe_application puis get_application_config avec l'identifiant de l'application pour obtenir les métadonnées et la configuration.
2. Rédige une description détaillée de l'application : ce qu'elle montre, comment l'utiliser, quels jeux de données elle exploite.
3. Présente la description à l'utilisateur et demande son accord avant de l'appliquer avec set_application_description.

Format :
- Entre 500 et 2000 caractères
- Le formatage markdown est encouragé : titres (##), listes à puces, gras pour les termes clés
- Structure : vue d'ensemble, contenu / interactions, notes d'utilisation
- Ton accessible — le public va des analystes de données au grand public
- Rédige dans la même langue que le titre et les métadonnées existantes
- Ne répète pas simplement le résumé ; la description doit apporter de la profondeur et du contexte`,
    en: `Writing the description of a Data Fair data-visualization application. Descriptions are displayed on application pages to help users understand the application in detail.

Task:
1. Call describe_application then get_application_config with the application's id to get the metadata and configuration.
2. Write a detailed description of the application: what it shows, how to use it, which datasets it draws on.
3. Show the description to the user and ask for their approval before applying it with set_application_description.

Format:
- Between 500 and 2000 characters
- Markdown formatting is encouraged: headings (##), bullet lists, bold for key terms
- Structure: overview, content / interactions, usage notes
- Use an accessible tone — the audience ranges from data analysts to general public users
- Write in the same language as the title and existing metadata
- Do not simply repeat the summary; the description should add depth and context`
  }

  useAgentSkill({
    name: 'write-application-description',
    description: 'How to write the detailed markdown description of the current application. Load it before proposing one.',
    body: descriptionWriterPrompts[locale.value] ?? descriptionWriterPrompts.en
  })
}
