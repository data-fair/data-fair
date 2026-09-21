import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { createAgentTranslator } from '~/composables/agent/utils'
import {
  AGENT_COLUMN_TYPES,
  type NewColumn,
  addColumns,
  addColumnsPrecondition,
  formatAddOutcomes
} from './agent-add-column-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: { addColumns: 'Ajouter des colonnes' },
  en: { addColumns: 'Add columns' }
}

/**
 * Declaring the columns of an editable dataset, the one step of the creation
 * flow the agent could not take: it proposed a set of columns, the person
 * approved it, and then had to type them in one dialog at a time.
 *
 * Like every other schema tool here, it writes into the edited copy only.
 */
export function useAgentAddColumnTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  applyToSchema: (mutate: (schema: any[]) => void) => void
) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'add_columns',
    description: `Declare new columns on an editable (REST) dataset, which starts with none. Pass the columns in one call, each with the name the person would type and a type among: ${AGENT_COLUMN_TYPES.join(', ')}. The key is derived from the name, as the form derives it. Nothing is saved — the new columns appear flagged in the schema list and the user clicks Enregistrer. Their titles, descriptions and concepts are set afterwards with annotate_schema.`,
    annotations: { title: t('addColumns') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        columns: {
          type: 'array' as const,
          description: 'The columns to declare, in the order they should appear',
          items: {
            type: 'object' as const,
            properties: {
              name: { type: 'string' as const, description: 'The column name as a person would write it, e.g. "Date de dépôt"' },
              type: { type: 'string' as const, enum: AGENT_COLUMN_TYPES, description: 'One of the listed types' }
            },
            required: ['name', 'type'] as const
          }
        }
      },
      required: ['columns'] as const
    },
    execute: (params: { columns: NewColumn[] }) => {
      const why = addColumnsPrecondition(datasetData.value)
      if (why) return why
      let outcomes: ReturnType<typeof addColumns> = []
      applyToSchema(schema => { outcomes = addColumns(schema, params.columns ?? []) })
      return formatAddOutcomes(outcomes)
    }
  })
}
