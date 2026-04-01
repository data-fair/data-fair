import { toCsv } from '../agent/utils-logic.js'
import capabilitiesSchema from '../../../../api/contract/capabilities.js'

export interface PropertyConfig {
  key: string
  typeOverride?: { type: string, format?: string } | null
  capabilities?: Record<string, boolean> | null
}

export const capabilitiesProperties = capabilitiesSchema.properties as Record<string, { type: string, default: boolean, title: string, description: string }>
export const capabilitiesDefaultFalse = Object.keys(capabilitiesProperties).filter(key => capabilitiesProperties[key].default === false)

export function getRelevantCapabilities (type: string, format?: string, xRefersTo?: string): string[] {
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

export function resolveCapabilities (xCapabilities: Record<string, boolean> | undefined, relevant: string[]): Record<string, boolean> {
  const resolved: Record<string, boolean> = {}
  for (const key of relevant) {
    const defaultVal = !capabilitiesDefaultFalse.includes(key)
    resolved[key] = xCapabilities?.[key] ?? defaultVal
  }
  return resolved
}

/** Store only values that differ from defaults */
export function diffCapabilities (capabilities: Record<string, boolean>): Record<string, boolean> {
  const diff: Record<string, boolean> = {}
  for (const [key, val] of Object.entries(capabilities)) {
    const defaultVal = !capabilitiesDefaultFalse.includes(key)
    if (val !== defaultVal) diff[key] = val
  }
  return diff
}

type FetchSampleRowsFn = (datasetId: string, size?: number) => Promise<{ total: number, rows: Record<string, any>[] }>

export async function executeReadPropertyConfig (dataset: any, fetchSampleRowsFn: FetchSampleRowsFn) {
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
      const { rows } = await fetchSampleRowsFn(dataset.id, 5)
      sampleCsv = toCsv(rows)
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

export function executeSetPropertyConfig (
  params: { configs: any[] },
  dataset: any,
  updatePropertyConfigFn: (configs: PropertyConfig[]) => void
): string {
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

  updatePropertyConfigFn(configs)

  const parts: string[] = []
  const typeCount = configs.filter(c => c.typeOverride !== undefined).length
  const capCount = configs.filter(c => c.capabilities !== undefined).length
  if (typeCount) parts.push(`${typeCount} type override${typeCount > 1 ? 's' : ''}`)
  if (capCount) parts.push(`${capCount} capability config${capCount > 1 ? 's' : ''}`)
  return `Successfully applied ${parts.join(' and ')}.`
}
