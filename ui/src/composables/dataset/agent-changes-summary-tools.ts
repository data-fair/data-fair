import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createAgentTranslator } from '~/composables/agent/utils'
import { diffDataset } from './agent-changes-summary-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readDatasetChanges: 'Lire les modifications du jeu de données',
    changesSummarizerSubAgent: 'Résumer les modifications du jeu de données',
    changesSummarizerSubAgentDesc: 'Lire les modifications en attente d\'enregistrement, métadonnées et structure, puis les résumer.'
  },
  en: {
    readDatasetChanges: 'Read dataset changes',
    changesSummarizerSubAgent: 'Summarize dataset changes',
    changesSummarizerSubAgentDesc: 'Read the changes pending save, metadata and structure alike, then summarize them.'
  }
}

export interface DatasetEditSides {
  metadataData: Ref<any>
  metadataServer: Ref<any>
  structureData: Ref<any>
  structureServer: Ref<any>
}

/**
 * The "what am I about to save?" tool.
 *
 * It used to render both sides through `describe_dataset.formatResult` and diff the text.
 * That representation carries neither capabilities, nor groups, nor value labels, nor
 * column order — so a schema reshuffle could be saved without the summary ever mentioning
 * it. It now walks the two edited objects field by field instead.
 */
export function useAgentDatasetChangesSummaryTools (locale: Ref<string>, sides: DatasetEditSides) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'read_dataset_changes',
    description: 'Read everything that has been changed on this dataset and is waiting to be saved — metadata card and structure alike, including column titles, descriptions, concepts, groups, value labels, indexing capabilities, type overrides and column order. Use it before the user saves so nothing is saved unseen.',
    annotations: { title: t('readDatasetChanges'), readOnlyHint: true },
    inputSchema: { type: 'object' as const, properties: {} },
    execute: async () => diffDataset({
      metadataServer: sides.metadataServer.value,
      metadataEdited: sides.metadataData.value,
      structureServer: sides.structureServer.value,
      structureEdited: sides.structureData.value
    })
  })

  const changesSummarizerPrompts: Record<string, string> = {
    fr: `Tu relis les modifications qu'un utilisateur s'apprête à enregistrer sur un jeu de données Data Fair. Ton rôle est qu'il ne sauvegarde rien sans l'avoir vu.

Tâche :
1. Appelle read_dataset_changes pour obtenir la liste des modifications en attente.
2. Résume-la, en restant fidèle : n'omets aucune catégorie de changement.

Format :
- 800 caractères maximum
- des puces courtes, une par nature de changement
- rédige dans la langue du jeu de données

Priorités :
- Signale en premier ce qui change le comportement du jeu et pas seulement son affichage : capacités d'indexation, types forcés, concepts, enrichissements, ordre des colonnes.
- Une capacité désactivée mérite d'être nommée pour ce qu'elle coûte : sans « triable et groupable », une colonne ne peut plus être ni triée ni agrégée ; sans « filtrable », elle ne peut plus être filtrée.
- Un type forcé qui rétrécit un type détecté (nombre vers entier, texte vers date) doit être signalé explicitement : il modifie les valeurs indexées.
- Pour les changements nombreux et de même nature, donne le compte plutôt que la liste ("libellés posés sur 14 colonnes").
- Ne donne aucun avis sur la pertinence des changements, dis seulement ce qu'ils sont.`,
    en: `You review the changes a user is about to save on a Data Fair dataset. Your job is that nothing gets saved unseen.

Task:
1. Call read_dataset_changes to get the pending changes.
2. Summarize them faithfully: do not drop a category of change.

Format:
- 800 characters max
- short bullets, one per kind of change
- write in the language of the dataset

Priorities:
- Lead with what changes the dataset's behaviour rather than its display: indexing capabilities, type overrides, concepts, extensions, column order.
- Name a disabled capability for what it costs: without "sortable and groupable" a column can no longer be sorted or aggregated; without "filterable" it can no longer be filtered.
- A type override that narrows a detected type (number to integer, text to date) must be called out explicitly: it changes the indexed values.
- For many changes of the same kind, give the count rather than the list ("labels set on 14 columns").
- Do not judge whether the changes are a good idea, only say what they are.`
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
