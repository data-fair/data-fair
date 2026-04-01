import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator } from '~/composables/agent/utils'
import capabilitiesSchema from '~/../../api/contract/capabilities.js'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readPropertyConfig: 'Lire la configuration des colonnes',
    setPropertyConfig: 'Configurer les types et capacités des colonnes',
    propertyConfigAdvisor: 'Optimiser les types et capacités des colonnes',
    propertyConfigAdvisorDesc: 'Analyser le schéma et les données pour suggérer des corrections de types et des optimisations de capacités.'
  },
  en: {
    readPropertyConfig: 'Read column configuration',
    setPropertyConfig: 'Configure column types and capabilities',
    propertyConfigAdvisor: 'Optimize column types and capabilities',
    propertyConfigAdvisorDesc: 'Analyze the schema and data to suggest type corrections and capability optimizations.'
  }
}

interface PropertyConfig {
  key: string
  typeOverride?: { type: string, format?: string } | null
  capabilities?: Record<string, boolean> | null
}

const capabilitiesProperties = capabilitiesSchema.properties as Record<string, { type: string, default: boolean, title: string, description: string }>
const capabilitiesDefaultFalse = Object.keys(capabilitiesProperties).filter(key => capabilitiesProperties[key].default === false)

function getRelevantCapabilities (type: string, format?: string, xRefersTo?: string): string[] {
  if (type === 'number' || type === 'integer' || type === 'boolean') {
    return ['index', 'textStandard', 'values']
  }
  if (type === 'string' && (format === 'date' || format === 'date-time')) {
    return ['index', 'textStandard', 'values']
  }
  if (xRefersTo === 'https://purl.org/geojson/vocab#geometry') {
    return ['geoShape', 'vtPrepare']
  }
  if (xRefersTo === 'http://schema.org/DigitalDocument') {
    return ['indexAttachment']
  }
  if (type === 'string') {
    return ['index', 'text', 'textStandard', 'textAgg', 'values', 'insensitive', 'wildcard']
  }
  return []
}

function resolveCapabilities (xCapabilities: Record<string, boolean> | undefined, relevant: string[]): Record<string, boolean> {
  const resolved: Record<string, boolean> = {}
  for (const key of relevant) {
    const defaultVal = !capabilitiesDefaultFalse.includes(key)
    resolved[key] = xCapabilities?.[key] ?? defaultVal
  }
  return resolved
}

/** Store only values that differ from defaults */
function diffCapabilities (capabilities: Record<string, boolean>): Record<string, boolean> {
  const diff: Record<string, boolean> = {}
  for (const [key, val] of Object.entries(capabilities)) {
    const defaultVal = !capabilitiesDefaultFalse.includes(key)
    if (val !== defaultVal) diff[key] = val
  }
  return diff
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

export function useAgentPropertyConfigTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  updatePropertyConfig: (configs: PropertyConfig[]) => void
) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'read_property_config',
    description: 'Read the dataset schema with current type overrides, capabilities, and sample data. Returns each column\'s detected type, type override, effective capabilities (with defaults resolved), and which capabilities are relevant for its type.',
    annotations: { title: t('readPropertyConfig'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      const dataset = datasetData.value
      if (!dataset) return 'Error: No dataset loaded'

      const isFile = !!dataset.file
      const isVirtual = !!dataset.isVirtual

      const schema = dataset.schema
        ?.filter((col: any) => !['_i', '_id', '_rand'].includes(col.key) && !col['x-calculated'])

      const rows = (schema || []).map((col: any) => {
        const effectiveType = col['x-transform']?.type || col.type
        const effectiveFormat = col['x-transform']?.format || col.format
        const relevant = getRelevantCapabilities(effectiveType, effectiveFormat, col['x-refersTo'])
        const resolved = resolveCapabilities(col['x-capabilities'], relevant)

        const capsStr = relevant.map(k => `${k}=${resolved[k]}`).join(', ')

        const parts: string[] = []
        if (col['x-refersTo']) parts.push(`concept: ${col['x-refersTo']}`)
        if (col['x-cardinality']) parts.push(`cardinality: ${col['x-cardinality']}`)

        const typeOverride = col['x-transform']?.type
          ? `${col['x-transform'].type}${col['x-transform'].format ? ' (' + col['x-transform'].format + ')' : ''}`
          : '(none)'

        return `| \`${col.key}\` | ${col.title || '(none)'} | ${col.type}${col.format ? ' (' + col.format + ')' : ''} | ${typeOverride} | ${capsStr} | ${parts.join(' — ')} |`
      })

      let sampleCsv = ''
      if (dataset.id) {
        try {
          const data = await $fetch<any>(`datasets/${encodeURIComponent(dataset.id)}/lines`, { query: { size: '5' } })
          const results = (data.results ?? []).map((row: any) => {
            const { _id, _i, _rand, ...clean } = row
            return clean
          })
          sampleCsv = toCsv(results)
        } catch {
          sampleCsv = '(failed to fetch sample data)'
        }
      }

      const sections = [
        `# Property Configuration: ${dataset.title}`,
        '',
        `Dataset type: ${isFile ? 'file' : isVirtual ? 'virtual' : 'REST'}`,
        isFile ? 'Type overrides are available for this dataset.' : 'Type overrides are NOT available (only for file datasets).',
        '',
        '| Key | Title | Detected type | Type override | Capabilities | Notes |',
        '|-----|-------|---------------|---------------|--------------|-------|',
        ...rows,
        '',
        '## Capabilities reference',
        ...Object.entries(capabilitiesProperties).map(([key, cap]) =>
          `- **${key}** (default: ${cap.default}): ${cap.description}`
        ),
        '',
        '## Sample data (5 rows)',
        sampleCsv
      ]
      return sections.join('\n')
    }
  })

  useAgentTool({
    name: 'set_property_config',
    description: 'Set type overrides and/or capabilities for one or more schema columns. For typeOverride, pass an object with type and optional format, or null to clear. For capabilities, pass an object with only the values that should differ from defaults, or null to reset to defaults.',
    annotations: { title: t('setPropertyConfig') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        configs: {
          type: 'array' as const,
          description: 'Array of property configurations to apply',
          items: {
            type: 'object' as const,
            properties: {
              key: { type: 'string' as const, description: 'The column key' },
              typeOverrideType: { type: 'string' as const, description: 'Override type: string, number, integer, or boolean. Omit to leave unchanged.' },
              typeOverrideFormat: { type: 'string' as const, description: 'Override format: date or date-time (only with type=string). Omit if not needed.' },
              clearTypeOverride: { type: 'boolean' as const, description: 'Set to true to clear any existing type override.' },
              capabilities: {
                type: 'object' as const,
                description: 'Capabilities to set. Pass only values differing from defaults (index=true, values=true, textStandard=true, text=true, insensitive=true, geoShape=true, indexAttachment=true, textAgg=false, wildcard=false, vtPrepare=false). Omit to leave unchanged.',
                additionalProperties: { type: 'boolean' as const }
              },
              resetCapabilities: { type: 'boolean' as const, description: 'Set to true to reset capabilities to defaults.' }
            },
            required: ['key'] as const
          }
        }
      },
      required: ['configs'] as const
    },
    execute: async (params: any) => {
      const dataset = datasetData.value
      if (!dataset) return 'Error: No dataset loaded'

      const hasTypeOverride = params.configs.some((c: any) => c.typeOverrideType)
      if (hasTypeOverride && !dataset.file) {
        return 'Error: Type overrides are only available for file datasets.'
      }

      // Validate keys exist
      const schemaKeys = new Set((dataset.schema || []).map((p: any) => p.key))
      const unknown = params.configs.filter((c: any) => !schemaKeys.has(c.key))
      if (unknown.length) {
        return `Error: Unknown column keys: ${unknown.map((c: any) => c.key).join(', ')}`
      }

      // Build PropertyConfig array from flat params
      const configs: PropertyConfig[] = params.configs.map((c: any) => {
        const result: PropertyConfig = { key: c.key }
        if (c.clearTypeOverride) {
          result.typeOverride = null
        } else if (c.typeOverrideType) {
          result.typeOverride = { type: c.typeOverrideType }
          if (c.typeOverrideFormat) result.typeOverride.format = c.typeOverrideFormat
        }
        if (c.resetCapabilities) {
          result.capabilities = null
        } else if (c.capabilities) {
          result.capabilities = diffCapabilities(c.capabilities)
        }
        return result
      })

      updatePropertyConfig(configs)

      const parts: string[] = []
      const typeCount = configs.filter(c => c.typeOverride !== undefined).length
      const capCount = configs.filter(c => c.capabilities !== undefined).length
      if (typeCount) parts.push(`${typeCount} type override${typeCount > 1 ? 's' : ''}`)
      if (capCount) parts.push(`${capCount} capability config${capCount > 1 ? 's' : ''}`)
      return `Successfully applied ${parts.join(' and ')}.`
    }
  })

  useAgentSubAgent({
    name: 'property_config_advisor',
    title: t('propertyConfigAdvisor'),
    description: t('propertyConfigAdvisorDesc'),
    model: 'summarizer',
    prompt: `You are a data configuration expert for Data Fair, an open data publishing platform. You help users optimize column types and indexing capabilities.

Task:
1. Call read_property_config to get the current schema, capabilities, and sample data.
2. Analyze each column's detected type vs. actual data content. Look for:
   - Dates stored as plain strings (suggest type override to date or date-time)
   - Numbers stored as strings (suggest type override to number or integer)
   - Booleans stored as strings (suggest type override to boolean)
   - Integers detected as numbers (suggest type override to integer)
3. Analyze capabilities for optimization opportunities:
   - Long text columns: disable \`index\` and \`values\` (exact match filtering and sorting are meaningless for long text)
   - Non-French text: disable \`text\` (French-specific analysis is wasteful)
   - Columns where word cloud/word stats may be useful: suggest enabling \`textAgg\`
   - Low-cardinality codes: \`wildcard\` is usually unnecessary
   - High-cardinality unique IDs: \`insensitive\` sort may be unnecessary
4. Present your suggestions with brief explanations for each.
5. Call set_property_config with all suggestions at once.
6. Return a summary of changes made.

Guidelines:
- Type overrides are only available for file datasets. Skip type suggestions if the dataset is not a file.
- For capabilities, only suggest changes that provide clear benefits. Don't change things that are already well configured.
- Only pass capabilities values that differ from defaults. The defaults are: index=true, values=true, textStandard=true, text=true, insensitive=true, geoShape=true, indexAttachment=true, textAgg=false, wildcard=false, vtPrepare=false.
- Do NOT write transform expressions. If a type override needs an expression (e.g., reformatting dates), mention it and tell the user to use the expression helper.
- Write in the same language as the dataset title and existing annotations.`,
    tools: ['read_property_config', 'set_property_config']
  })
}
