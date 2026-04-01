import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator } from '~/composables/agent/utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readSchemaForAnnotation: 'Lire le schéma pour annotation',
    annotateSchema: 'Annoter les colonnes du schéma',
    schemaAnnotator: 'Annoter le schéma d\'un jeu de données',
    schemaAnnotatorDesc: 'Lire le schéma et des exemples de données, puis suggérer des libellés et descriptions pour les colonnes.'
  },
  en: {
    readSchemaForAnnotation: 'Read schema for annotation',
    annotateSchema: 'Annotate schema columns',
    schemaAnnotator: 'Annotate a dataset schema',
    schemaAnnotatorDesc: 'Read the schema and sample data, then suggest titles and descriptions for columns.'
  }
}

function csvEscape (value: any): string {
  if (value == null) return ''
  const s = String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv (rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  return [keys.map(csvEscape).join(','), ...rows.map(row => keys.map(k => csvEscape(row[k])).join(','))].join('\n')
}

export function useAgentSchemaAnnotationTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  updateProperties: (annotations: Array<{ key: string, title?: string, description?: string }>) => void
) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'read_schema_for_annotation',
    description: 'Read the dataset schema with current annotations and sample data. Returns each column\'s key, type, current title, description, original name, cardinality, enum values, and labels, plus 5 sample rows.',
    annotations: { title: t('readSchemaForAnnotation'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      const dataset = datasetData.value
      if (!dataset) return 'Error: No dataset loaded'

      const schema = dataset.schema
        ?.filter((col: any) => !['_i', '_id', '_rand'].includes(col.key) && !col['x-calculated'])
        .map((col: any) => {
          const notes: string[] = []
          if (col['x-originalName'] && col['x-originalName'] !== col.key) notes.push(`original: ${col['x-originalName']}`)
          if (col.description) notes.push(`desc: ${col.description}`)
          if (col['x-concept']?.title) notes.push(`concept: ${col['x-concept'].title}`)
          if (col['x-cardinality']) notes.push(`cardinality: ${col['x-cardinality']}`)
          if (col.enum) {
            const shown = col.enum.slice(0, 10).join(', ')
            notes.push(col.enum.length > 10 ? `enum: ${shown}… (${col.enum.length} total)` : `enum: ${shown}`)
          }
          if (col['x-labels']) {
            const entries = Object.entries(col['x-labels'])
            const shown = entries.slice(0, 5).map(([k, v]) => `${k}=${v}`).join(', ')
            notes.push(entries.length > 5 ? `labels: ${shown}… (${entries.length} total)` : `labels: ${shown}`)
          }
          return `| \`${col.key}\` | ${col.type}${col.format ? ' (' + col.format + ')' : ''} | ${col.title || '(none)'} | ${notes.join(' — ')} |`
        })

      let sampleCsv = ''
      if (dataset.id) {
        try {
          const data = await $fetch<any>(`datasets/${encodeURIComponent(dataset.id)}/lines`, { query: { size: '5' } })
          const rows = (data.results ?? []).map((row: any) => {
            const { _id, _i, _rand, ...clean } = row
            return clean
          })
          sampleCsv = toCsv(rows)
        } catch {
          sampleCsv = '(failed to fetch sample data)'
        }
      }

      const sections = [
        `# Schema: ${dataset.title}`,
        '',
        '| Key | Type | Current title | Notes |',
        '|-----|------|---------------|-------|',
        ...(schema || []),
        '',
        '## Sample data (5 rows)',
        sampleCsv
      ]
      return sections.join('\n')
    }
  })

  useAgentTool({
    name: 'annotate_schema',
    description: 'Set titles and/or descriptions for one or more schema columns. Only set values that you are suggesting — omit fields you want to leave unchanged.',
    annotations: { title: t('annotateSchema') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        annotations: {
          type: 'array' as const,
          description: 'Array of column annotations to apply',
          items: {
            type: 'object' as const,
            properties: {
              key: { type: 'string' as const, description: 'The column key' },
              title: { type: 'string' as const, description: 'Short human-readable label for the column' },
              description: { type: 'string' as const, description: 'Brief description of the column content' }
            },
            required: ['key'] as const
          }
        }
      },
      required: ['annotations'] as const
    },
    execute: async (params) => {
      updateProperties(params.annotations)
      const count = params.annotations.length
      return `Successfully annotated ${count} column${count > 1 ? 's' : ''}.`
    }
  })

  useAgentSubAgent({
    name: 'schema_annotator',
    title: t('schemaAnnotator'),
    description: t('schemaAnnotatorDesc'),
    model: 'summarizer',
    prompt: `You are a data documentation expert for Data Fair, an open data publishing platform. You help users annotate dataset schemas with clear, human-readable titles and descriptions.

Task:
1. Call read_schema_for_annotation to get the current schema and sample data.
2. Analyze each column: its key, type, original name, existing title, sample values, and any enum/labels.
3. For columns that have no title, a cryptic title, or a title that is just the key name repeated, suggest a clear human-readable title.
4. For columns that have no description, suggest a brief description based on the data content.
5. Do NOT overwrite titles or descriptions that are already good and informative.
6. Call annotate_schema with all your suggestions at once.
7. Return a summary of the annotations you made.

Guidelines:
- Titles should be short (2-5 words), capitalized naturally (e.g. "Montant HT", "Date de naissance")
- Descriptions should be 1-2 sentences explaining what the column contains
- Write in the same language as the dataset title and existing annotations
- Use the sample data to understand what each column actually contains
- For columns with enum values or labels, mention the possible values in the description`,
    tools: ['read_schema_for_annotation', 'annotate_schema']
  })
}
