import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { createAgentTranslator } from '~/composables/agent/utils'
import { formatReorderResult, reorderSchema } from './agent-schema-order-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: { reorderColumns: 'Réordonner les colonnes' },
  en: { reorderColumns: 'Reorder columns' }
}

/**
 * Column order is a whole-schema operation, so it gets its own tool instead of a field on
 * annotate_schema. It is also the only write with no natural visual trace — the column
 * chips flag a column whose content changed — which is why `dataset-columns-list.vue`
 * compares positions too.
 */
export function useAgentSchemaOrderTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  setSchema: (schema: any[]) => void
) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'reorder_columns',
    description: 'Reorder the dataset columns. Pass every editable column key exactly once, in the order you want: this tool moves columns, it never adds, drops or renames one, and it refuses an incomplete list. Internal columns keep their place at the end. Nothing is saved — the moved columns are flagged in the schema list and the user clicks Enregistrer.',
    annotations: { title: t('reorderColumns') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        keys: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Every editable column key, in the wanted order'
        }
      },
      required: ['keys'] as const
    },
    execute: (params: { keys: string[] }) => {
      const schema = datasetData.value?.schema
      if (!schema) return 'Error: No dataset loaded'
      const result = reorderSchema(schema, params.keys)
      if (result.schema) setSchema(result.schema)
      return formatReorderResult(result)
    }
  })
}
