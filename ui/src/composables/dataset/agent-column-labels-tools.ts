import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator } from '~/composables/agent/utils'
import {
  type ColumnLabels,
  applyColumnLabels,
  formatLabelOutcomes,
  isLabellable,
  LABELLABLE_MAX_CARDINALITY
} from './agent-column-labels-tools-logic'
import { isEditableColumn } from './agent-schema-annotation-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readColumnValues: 'Lire les valeurs des colonnes codées',
    setColumnLabels: 'Poser les libellés de valeurs',
    columnLabeler: 'Libeller les valeurs codées',
    columnLabelerDesc: 'Lire les valeurs réelles des colonnes codées, puis leur donner un libellé lisible.'
  },
  en: {
    readColumnValues: 'Read coded column values',
    setColumnLabels: 'Set value labels',
    columnLabeler: 'Label coded values',
    columnLabelerDesc: 'Read the real values of coded columns, then give each one a readable label.'
  }
}

/** How many distinct values we are willing to show the model per column. */
const VALUES_PER_COLUMN = 50

/**
 * Value labels (`x-labels`) get their own tool rather than a field of annotate_schema:
 * they require reading the column's real values first, a wrong label misrepresents the
 * data in every application built on the dataset, and the separation is what lets the
 * annotation prompt forbid spelling codes out in a column description.
 */
export function useAgentColumnLabelsTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  applyToSchema: (mutate: (schema: any[]) => void) => void
) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'read_column_values',
    description: `Read the distinct values of coded columns, with their current labels. Without a column list, returns every column that looks codeable (at most ${LABELLABLE_MAX_CARDINALITY} distinct values). Call this before set_column_labels: labelling a value that does not exist in the data is worse than leaving it unlabelled.`,
    annotations: { title: t('readColumnValues'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        keys: { type: 'array' as const, items: { type: 'string' as const }, description: 'Column keys to inspect; omit to get every codeable column' }
      }
    },
    execute: async (params: { keys?: string[] }) => {
      const dataset = datasetData.value
      if (!dataset?.schema) return 'Error: No dataset loaded'

      let columns = dataset.schema.filter(isEditableColumn)
      if (params.keys?.length) {
        const wanted = new Set(params.keys)
        columns = columns.filter((c: any) => wanted.has(c.key))
        const missing = params.keys.filter(k => !columns.some((c: any) => c.key === k))
        if (missing.length && !columns.length) return `Error: unknown column(s) ${missing.join(', ')}`
      } else {
        columns = columns.filter((c: any) => isLabellable(c) === true)
      }
      if (!columns.length) return 'No codeable column in this dataset — nothing to label.'

      const blocks: string[] = []
      for (const col of columns) {
        const labellable = isLabellable(col)
        if (labellable !== true) {
          blocks.push(`### \`${col.key}\` — not labellable: ${labellable}`)
          continue
        }
        let values: any[] = col.enum ?? []
        if (dataset.id) {
          try {
            const data = await $fetch<any>(`datasets/${encodeURIComponent(dataset.id)}/values/${encodeURIComponent(col.key)}`, {
              query: { size: String(VALUES_PER_COLUMN) }
            })
            if (Array.isArray(data) && data.length) values = data
          } catch { /* fall back on the schema's observed enum */ }
        }
        const labels = col['x-labels'] ?? {}
        const lines = values.slice(0, VALUES_PER_COLUMN).map((v: any) => {
          const current = labels[String(v)]
          return `- \`${v}\`${current ? ` → ${current}` : ''}`
        })
        blocks.push([
          `### \`${col.key}\` — ${col.title || '(no title)'} (${col.type})`,
          values.length >= VALUES_PER_COLUMN ? `(first ${VALUES_PER_COLUMN} values)` : '',
          ...lines
        ].filter(Boolean).join('\n'))
      }
      return blocks.join('\n\n')
    }
  })

  useAgentTool({
    name: 'set_column_labels',
    description: 'Give human-readable labels to the coded values of one or more columns (1 → Homme, COM → Commune). Labels are merged over the existing ones, so a partial call never wipes the others; pass an empty object to clear a column. Nothing is saved — the changed columns are highlighted and the user clicks Enregistrer. Only label values you have actually seen through read_column_values.',
    annotations: { title: t('setColumnLabels') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        columns: {
          type: 'array' as const,
          description: 'One entry per column to label',
          items: {
            type: 'object' as const,
            properties: {
              key: { type: 'string' as const, description: 'The column key' },
              labels: {
                type: 'object' as const,
                description: 'Map of raw value to readable label, e.g. {"1": "Homme", "2": "Femme"}. Empty object clears the labels.',
                additionalProperties: { type: 'string' as const }
              }
            },
            required: ['key', 'labels'] as const
          }
        }
      },
      required: ['columns'] as const
    },
    execute: (params: { columns: ColumnLabels[] }) => {
      if (!datasetData.value?.schema) return 'Error: No dataset loaded'
      let outcomes: ReturnType<typeof applyColumnLabels> = []
      applyToSchema(schema => { outcomes = applyColumnLabels(schema, params.columns) })
      return formatLabelOutcomes(outcomes)
    }
  })

  const columnLabelerPrompts: Record<string, string> = {
    fr: `Tu poses les libellés de valeurs d'un jeu de données Data Fair. Une colonne codée (\`sexe\` valant 1 ou 2, \`nivgeo\` valant COM ou ARM) est illisible telle quelle : les libellés la rendent lisible partout, dans les tableaux comme dans les graphiques, sans toucher à la donnée.

Tâche :
1. Appelle read_column_values pour voir les valeurs réelles et les libellés déjà posés.
2. Pour chaque colonne codée, propose un libellé par valeur.
3. Appelle set_column_labels avec l'ensemble. **C'est cet appel qui fait le travail.**
4. Renvoie comme réponse finale le compte rendu de l'outil.

Règles :
- **Ne libelle que les valeurs que l'outil t'a montrées.** Ne complète pas une nomenclature de mémoire : si tu crois qu'un code manque, dis-le, ne l'invente pas.
- Un libellé court, au singulier, en capitalisation naturelle : "Homme", "Femme", "Commune", "Arrondissement municipal". Pas de phrase, pas de ponctuation finale.
- Le libellé doit rester juste quel que soit le contexte d'affichage : il apparaîtra seul dans une légende ou une facette.
- Les codes des nomenclatures officielles (INSEE, NAF, ISO) se traduisent par leur intitulé officiel quand tu le connais avec certitude. Sinon, laisse la valeur sans libellé.
- Une colonne à forte cardinalité n'a pas à être libellée : ce n'est pas une nomenclature, c'est du texte.
- N'écrase pas un libellé existant correct.

Rédige dans la langue du jeu de données.`,
    en: `You set the value labels of a Data Fair dataset. A coded column (\`sexe\` holding 1 or 2, \`nivgeo\` holding COM or ARM) is unreadable as such: labels make it readable everywhere, in tables and charts alike, without touching the data.

Task:
1. Call read_column_values to see the real values and the labels already in place.
2. For each coded column, propose one label per value.
3. Call set_column_labels with the whole set. **That call is the work.**
4. Return the tool's report as your final answer.

Rules:
- **Only label values the tool showed you.** Do not complete a nomenclature from memory: if you think a code is missing, say so, do not invent it.
- Short label, singular, natural capitalization: "Male", "Female", "Municipality", "Borough". No sentence, no trailing punctuation.
- The label must stand alone: it will appear on its own in a legend or a facet.
- Official nomenclature codes (INSEE, NAF, ISO) get their official wording when you know it for certain. Otherwise leave the value unlabelled.
- A high-cardinality column is not a nomenclature, it is text — do not label it.
- Do not overwrite a correct existing label.

Write in the language of the dataset.`
  }

  useAgentSubAgent({
    name: 'column_labeler',
    title: t('columnLabeler'),
    description: t('columnLabelerDesc'),
    model: 'summarizer',
    prompt: columnLabelerPrompts[locale.value] ?? columnLabelerPrompts.en,
    tools: ['read_column_values', 'set_column_labels']
  })
}
