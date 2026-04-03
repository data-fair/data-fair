import { formatSchemaColumns, datasetIdProperty } from './_utils.ts'

export const annotations = {
  fr: { title: 'Décrire un jeu de données' },
  en: { title: 'Describe a dataset' }
} as const

export const schema = {
  name: 'describe_dataset',
  description: 'Get detailed metadata and column schema for a dataset. Returns title, description, status, owner, visibility, topics, and full column schema with types.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: datasetIdProperty
    },
    required: ['datasetId'] as const
  }
} as const

/**
 * Serialize full dataset metadata + schema into markdown.
 * Used by describe_dataset and read_dataset_info tools.
 */
export function formatResult (dataset: any, options?: { includeOwner?: boolean }): string {
  const meta: string[] = [
    `# ${dataset.title}`,
    `- **ID:** \`${dataset.id}\``,
    `- **Status:** ${dataset.status || 'unknown'}`,
    `- **Rows:** ${dataset.count ?? '?'}`
  ]
  if (options?.includeOwner) meta.push(`- **Owner:** ${dataset.owner?.name || '?'}`)
  meta.push(`- **Visibility:** ${dataset.visibility || '?'}`)
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

  const schemaRows = formatSchemaColumns(dataset.schema)
  const sections = [...meta]
  if (schemaRows?.length) {
    sections.push('', '## Schema', '| Key | Type | Title | Notes |', '|-----|------|-------|-------|', ...schemaRows)
  }

  return sections.join('\n')
}
