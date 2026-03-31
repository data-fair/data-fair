import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator } from '~/composables/agent/utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    listDatasets: 'Lister les jeux de données',
    describeDataset: 'Décrire un jeu de données'
  },
  en: {
    listDatasets: 'List datasets',
    describeDataset: 'Describe a dataset'
  }
}

export function serializeDatasetInfo (dataset: any): string {
  const meta: string[] = [
    `# ${dataset.title}`,
    `- **ID:** \`${dataset.id}\``,
    `- **Status:** ${dataset.status || 'unknown'}`,
    `- **Rows:** ${dataset.count ?? '?'}`,
    `- **Owner:** ${dataset.owner?.name || '?'}`,
    `- **Visibility:** ${dataset.visibility || '?'}`
  ]
  if (dataset.slug) meta.push(`- **Slug:** ${dataset.slug}`)
  if (dataset.description) meta.push(`- **Description:** ${dataset.description.length > 2000 ? dataset.description.slice(0, 2000) + '…' : dataset.description}`)
  if (dataset.summary) meta.push(`- **Summary:** ${dataset.summary}`)
  if (dataset.topics?.length) meta.push(`- **Topics:** ${dataset.topics.map((t: any) => t.title).join(', ')}`)
  if (dataset.keywords?.length) meta.push(`- **Keywords:** ${dataset.keywords.join(', ')}`)
  if (dataset.license) meta.push(`- **License:** ${dataset.license.title}`)
  if (dataset.frequency) meta.push(`- **Frequency:** ${dataset.frequency}`)
  if (dataset.spatial) meta.push(`- **Spatial:** ${typeof dataset.spatial === 'string' ? dataset.spatial : JSON.stringify(dataset.spatial)}`)
  if (dataset.temporal) meta.push(`- **Temporal:** ${JSON.stringify(dataset.temporal)}`)
  if (Array.isArray(dataset.bbox) && dataset.bbox.length > 0) {
    meta.push(`- **Geolocalized:** yes (bbox: [${dataset.bbox.join(', ')}]). Geo filters (bbox, geoDistance) are available in search_data, aggregate_data, and calculate_metric.`)
  }
  if (dataset.timePeriod) {
    meta.push(`- **Temporal dataset:** yes (${dataset.timePeriod.startDate} to ${dataset.timePeriod.endDate}). The dateMatch filter is available in search_data, aggregate_data, and calculate_metric.`)
  }
  if (dataset.page) meta.push(`- **Link:** ${dataset.page}`)

  const schema = dataset.schema
    ?.filter((col: any) => !['_i', '_id', '_rand'].includes(col.key))
    .map((col: any) => {
      let line = `| \`${col.key}\` | ${col.type} | ${col.title || ''} |`
      const notes: string[] = []
      if (col.description) notes.push(col.description)
      if (col['x-concept']?.title) notes.push(`concept: ${col['x-concept'].title}`)
      if (col.enum) {
        const shown = col.enum.slice(0, 20).join(', ')
        notes.push(col.enum.length > 20 ? `enum: ${shown}… (${col.enum.length} total)` : `enum: ${shown}`)
      }
      line += ` ${notes.join(' — ')} |`
      return line
    })

  const sections = [...meta]
  if (schema?.length) {
    sections.push('', '## Schema', '| Key | Type | Title | Notes |', '|-----|------|-------|-------|', ...schema)
  }

  return sections.join('\n')
}

export function useAgentDatasetTools (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'list_datasets',
    description: 'List datasets accessible to the current user with optional text search. Returns id, title, status, row count, and last update.',
    annotations: { title: t('listDatasets'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        q: { type: 'string' as const, description: 'Optional text search keywords' },
        page: { type: 'number' as const, description: 'Page number (default 1)' },
        size: { type: 'number' as const, description: 'Page size (default 10, max 50)' }
      }
    },
    execute: async (params) => {
      const size = Math.min(Math.max(params.size || 10, 1), 50)
      const page = Math.max(params.page || 1, 1)
      const query: Record<string, string> = {
        select: 'title,status,topics,count,updatedAt',
        size: String(size),
        page: String(page)
      }
      if (params.q) query.q = params.q

      const data = await $fetch<any>('datasets', { query })

      const lines = data.results.map((d: any) => {
        const parts = [`- **${d.title || d.id}** (id: \`${d.id}\`)`,
          `  Status: ${d.status || 'unknown'}, ${d.count ?? '?'} rows, updated ${d.updatedAt || '?'}`]
        if (d.topics?.length) parts.push(`  Topics: ${d.topics.map((t: any) => t.title).join(', ')}`)
        return parts.join('\n')
      })

      return [
        `**${data.count}** datasets found (page ${page}, ${size} per page)`,
        '',
        ...lines
      ].join('\n')
    }
  })

  useAgentTool({
    name: 'describe_dataset',
    description: 'Get detailed metadata and column schema for a dataset. Returns title, description, status, owner, visibility, topics, and full column schema with types.',
    annotations: { title: t('describeDataset'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' }
      },
      required: ['datasetId'] as const
    },
    execute: async (params) => {
      const dataset = await $fetch<any>(`datasets/${encodeURIComponent(params.datasetId)}`)
      return serializeDatasetInfo(dataset)
    }
  })
}
