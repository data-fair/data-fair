import { formatSchemaColumns, cleanRow, toCsv, datasetIdProperty } from './_utils.ts'

export const annotations = {
  fr: { title: 'Décrire un jeu de données' },
  en: { title: 'Describe a dataset' }
} as const

const schemaColumnProperty = {
  type: 'object' as const,
  properties: {
    key: { type: 'string' as const, description: 'Column identifier' },
    type: { type: 'string' as const, description: 'Data type of the column' },
    title: { type: 'string' as const, description: 'Human-readable column title' },
    description: { type: 'string' as const, description: 'Column description' },
    enum: { type: 'array' as const, items: {}, description: 'List of all possible values for this column' },
    enumTruncated: { type: 'boolean' as const, description: 'Whether the enum list was truncated because it exceeded 20 values' },
    enumTotal: { type: 'number' as const, description: 'Total number of enum values before truncation' },
    labels: { type: 'object' as const, description: 'Object mapping actual data values (keys) to human-readable labels (values). Use keys for filters.' },
    concept: { type: 'string' as const, description: 'Semantic concept associated with the column' }
  }
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
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' as const, description: 'Unique dataset Id (required for search_data tools)' },
      slug: { type: 'string' as const, description: 'Human-readable unique identifier for the dataset, used in URLs' },
      title: { type: 'string' as const, description: 'Dataset title' },
      summary: { type: 'string' as const, description: 'A brief summary of the dataset content' },
      description: { type: 'string' as const, description: 'A markdown description of the dataset content' },
      page: { type: 'string' as const, description: 'Link to the dataset page (must be included in responses as citation source)' },
      count: { type: 'number' as const, description: 'Total number of data rows in the dataset' },
      keywords: { type: 'array' as const, items: { type: 'string' as const }, description: 'Keywords associated with the dataset' },
      origin: { type: 'string' as const, description: 'Source or provider of the dataset' },
      license: {
        type: 'object' as const,
        properties: {
          href: { type: 'string' as const, description: 'URL to the license text' },
          title: { type: 'string' as const, description: 'License name/title' }
        },
        description: 'Dataset license information (must be included in responses)'
      },
      topics: { type: 'array' as const, items: { type: 'string' as const }, description: 'Topics/categories the dataset belongs to' },
      spatial: { description: 'Spatial coverage information' },
      temporal: { description: 'Temporal coverage information' },
      frequency: { type: 'string' as const, description: 'Update frequency of the dataset' },
      geolocalized: { type: 'boolean' as const, description: 'Whether the dataset has geographic data' },
      bbox: { type: 'array' as const, items: { type: 'number' as const }, description: 'Geographic bounding box [lonMin, latMin, lonMax, latMax]' },
      temporalDataset: { type: 'boolean' as const, description: 'Whether the dataset has temporal data' },
      timePeriod: {
        type: 'object' as const,
        properties: {
          startDate: { type: 'string' as const, description: 'Start date of the time period' },
          endDate: { type: 'string' as const, description: 'End date of the time period' }
        },
        description: 'Time period covered by the dataset'
      },
      schema: {
        type: 'array' as const,
        items: schemaColumnProperty,
        description: 'Dataset column schema with types and metadata'
      },
      sampleLines: {
        type: 'array' as const,
        items: { type: 'object' as const },
        description: 'Array of 3 sample data rows showing real values from the dataset. Use these examples to understand exact formatting, casing, and typical values for _eq and _search filters.'
      }
    },
    required: ['id', 'title', 'page', 'count'] as const
  }
} as const

/**
 * Build structuredContent from raw API dataset + sample lines data.
 */
export function buildStructuredContent (fetchedData: any, sampleLines?: any[]): Record<string, any> {
  const dataset: any = {
    id: fetchedData.id,
    title: fetchedData.title,
    page: fetchedData.page,
    count: fetchedData.count
  }

  if (fetchedData.slug) dataset.slug = fetchedData.slug
  if (fetchedData.summary) dataset.summary = fetchedData.summary
  if (fetchedData.description) {
    dataset.description = fetchedData.description.length > 2000
      ? fetchedData.description.slice(0, 2000) + '… (truncated, see dataset page for full description)'
      : fetchedData.description
  }
  if (fetchedData.keywords) dataset.keywords = fetchedData.keywords
  if (fetchedData.origin) dataset.origin = fetchedData.origin
  if (fetchedData.license) dataset.license = fetchedData.license
  if (fetchedData.topics) dataset.topics = fetchedData.topics.map((topic: any) => topic.title)
  if (fetchedData.spatial) dataset.spatial = fetchedData.spatial
  if (fetchedData.temporal) dataset.temporal = fetchedData.temporal
  if (fetchedData.frequency) dataset.frequency = fetchedData.frequency

  if (Array.isArray(fetchedData.bbox) && fetchedData.bbox.length > 0) {
    dataset.geolocalized = true
    dataset.bbox = fetchedData.bbox
  }

  if (fetchedData.timePeriod) {
    dataset.temporalDataset = true
    dataset.timePeriod = fetchedData.timePeriod
  }

  if (fetchedData.schema) {
    dataset.schema = fetchedData.schema
      .filter((col: any) => !['_i', '_id', '_rand'].includes(col.key))
      .map((col: any) => {
        const colResult: any = { key: col.key, type: col.type }
        if (col.title) colResult.title = col.title
        if (col.description) colResult.description = col.description
        if (col['x-concept']?.title || col['x-concept']?.id) {
          colResult.concept = col['x-concept']?.title || col['x-concept']?.id
        }
        if (col.enum) {
          if (col.enum.length <= 20) {
            colResult.enum = col.enum
          } else {
            colResult.enum = col.enum.slice(0, 20)
            colResult.enumTruncated = true
            colResult.enumTotal = col.enum.length
          }
        }
        if (col['x-labels']) colResult.labels = col['x-labels']
        return colResult
      })
  }

  if (sampleLines) {
    dataset.sampleLines = sampleLines.map(cleanRow)
  }

  return dataset
}

/**
 * Serialize full dataset metadata + schema into markdown.
 * Used by describe_dataset and read_dataset_info tools.
 */
export function formatResult (fetchedData: any, options?: { includeOwner?: boolean, sampleLines?: any[] }): { text: string, structuredContent: Record<string, any> } {
  const structuredContent = buildStructuredContent(fetchedData, options?.sampleLines)

  const meta: string[] = [
    `# ${fetchedData.title}`,
    `- **ID:** \`${fetchedData.id}\``,
    `- **Status:** ${fetchedData.status || 'unknown'}`,
    `- **Rows:** ${fetchedData.count ?? '?'}`
  ]
  if (options?.includeOwner) meta.push(`- **Owner:** ${fetchedData.owner?.name || '?'}`)
  meta.push(`- **Visibility:** ${fetchedData.visibility || '?'}`)
  if (fetchedData.slug) meta.push(`- **Slug:** ${fetchedData.slug}`)
  if (fetchedData.description) meta.push(`- **Description:** ${fetchedData.description.length > 2000 ? fetchedData.description.slice(0, 2000) + '…' : fetchedData.description}`)
  if (fetchedData.summary) meta.push(`- **Summary:** ${fetchedData.summary}`)
  if (fetchedData.topics?.length) meta.push(`- **Topics:** ${fetchedData.topics.map((t: any) => t.title).join(', ')}`)
  if (fetchedData.keywords?.length) meta.push(`- **Keywords:** ${fetchedData.keywords.join(', ')}`)
  if (fetchedData.license) meta.push(`- **License:** ${fetchedData.license.title}`)
  if (fetchedData.frequency) meta.push(`- **Frequency:** ${fetchedData.frequency}`)
  if (fetchedData.spatial) meta.push(`- **Spatial:** ${typeof fetchedData.spatial === 'string' ? fetchedData.spatial : JSON.stringify(fetchedData.spatial)}`)
  if (fetchedData.temporal) meta.push(`- **Temporal:** ${JSON.stringify(fetchedData.temporal)}`)
  if (Array.isArray(fetchedData.bbox) && fetchedData.bbox.length > 0) {
    meta.push(`- **Geolocalized:** yes (bbox: [${fetchedData.bbox.join(', ')}]). Geo filters (bbox, geoDistance) are available in search_data, aggregate_data, and calculate_metric.`)
  }
  if (fetchedData.timePeriod) {
    meta.push(`- **Temporal dataset:** yes (${fetchedData.timePeriod.startDate} to ${fetchedData.timePeriod.endDate}). The dateMatch filter is available in search_data, aggregate_data, and calculate_metric.`)
  }
  if (fetchedData.page) meta.push(`- **Link:** ${fetchedData.page}`)

  const schemaRows = formatSchemaColumns(fetchedData.schema)
  const sections = [...meta]
  if (schemaRows?.length) {
    sections.push('', '## Schema', '| Key | Type | Title | Notes |', '|-----|------|-------|-------|', ...schemaRows)
  }

  if (structuredContent.sampleLines?.length) {
    sections.push('', '## Sample data', toCsv(structuredContent.sampleLines))
  }

  return { text: sections.join('\n'), structuredContent }
}
