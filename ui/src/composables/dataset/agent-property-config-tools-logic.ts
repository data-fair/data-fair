import { toCsv } from '../agent/utils-logic.js'
import capabilitiesSchema from '../../../../api/contract/capabilities.js'

export interface PropertyConfig {
  key: string
  typeOverride?: { type: string, format?: string } | null
  capabilities?: Record<string, boolean> | null
  /** Language meta for the materialized analyzed field (plain string columns only). null clears it. */
  language?: string | null
}

export const capabilitiesProperties = capabilitiesSchema.properties as Record<string, { type: string, default: boolean, title: string, description: string }>
export const capabilitiesDefaultFalse = Object.keys(capabilitiesProperties).filter(key => capabilitiesProperties[key].default === false)

// `text`/`textStandard` are deprecated-but-accepted forever (they are now the storage encoding of
// the searchable+language pair below) — they are intentionally excluded from the "relevant"
// capabilities a caller is expected to read/write directly. Mirrors
// ui/src/components/dataset/dataset-property-capabilities.vue's relevantCapabilities.
export function getRelevantCapabilities (type: string, format?: string, xRefersTo?: string): string[] {
  if (type === 'number' || type === 'integer' || type === 'boolean') {
    return ['index', 'values']
  }
  if (type === 'string' && (format === 'date' || format === 'date-time')) {
    return ['index', 'values']
  }
  if (xRefersTo === 'https://purl.org/geojson/vocab#geometry') {
    return ['geoShape', 'vtPrepare']
  }
  if (xRefersTo === 'http://schema.org/DigitalDocument') {
    return ['indexAttachment']
  }
  if (type === 'string') {
    return ['index', 'textAgg', 'values', 'insensitive', 'wildcard']
  }
  return []
}

// A plain string column (no format, or the uri-reference format) is the only kind that carries a
// `language` meta — mirrors resolveSearchField's isPlainString in api/src/datasets/es/operations.ts.
export function isPlainStringType (type: string, format?: string): boolean {
  return type === 'string' && (!format || format === 'uri-reference')
}

// Which text-search shape applies to this column type: 'language' (toggle + language),
// 'plain' (bare toggle mapping to textStandard alone), or 'none' (no text-search capability).
// Mirrors dataset-property-capabilities.vue's textSearchKind.
export function getTextSearchKind (type: string, format?: string, xRefersTo?: string): 'language' | 'plain' | 'none' {
  if (xRefersTo === 'https://purl.org/geojson/vocab#geometry') return 'none'
  if (xRefersTo === 'http://schema.org/DigitalDocument') return 'none'
  if (type === 'number' || type === 'integer' || type === 'boolean') return 'plain'
  if (type === 'string') return isPlainStringType(type, format) ? 'language' : 'plain'
  return 'none'
}

/** Read-back per spec §5.4: toggle = any-of gate, selector = effective language. */
export function resolveTextSearch (
  xCapabilities: Record<string, boolean> | undefined,
  language: string | undefined,
  kind: 'language' | 'plain' | 'none'
): { searchable: boolean, language?: string | null } {
  if (kind === 'none') return { searchable: false }
  const textOn = xCapabilities?.text !== false
  const standardOn = xCapabilities?.textStandard !== false
  const searchable = textOn || standardOn
  if (kind === 'plain') return { searchable }
  return { searchable, language: (searchable && textOn) ? (language ?? null) : null }
}

/**
 * Serialize a searchable+language choice into the deprecated `text`/`textStandard` capability
 * pair per spec §5.4: off -> text:false, textStandard:false; on+language -> both absent (true);
 * on+standard -> text:false only. For 'plain' columns, only textStandard is meaningful.
 */
export function buildTextSearchPatch (
  kind: 'language' | 'plain' | 'none',
  searchable: boolean,
  language?: string | null
): { capabilities: Record<string, boolean>, language?: string | null } {
  if (kind === 'plain') return { capabilities: { textStandard: searchable } }
  if (kind === 'language') {
    if (!searchable) return { capabilities: { text: false, textStandard: false }, language: null }
    if (language) return { capabilities: { text: true, textStandard: true }, language }
    return { capabilities: { text: false, textStandard: true }, language: null }
  }
  return { capabilities: {} }
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

    const textSearchKind = getTextSearchKind(effectiveType, effectiveFormat, col['x-refersTo'])
    const textSearch = resolveTextSearch(col['x-capabilities'], col.language, textSearchKind)
    const textSearchStr = textSearchKind === 'none'
      ? ''
      : textSearchKind === 'plain'
        ? `, searchable=${textSearch.searchable}`
        : `, searchable=${textSearch.searchable}, language=${textSearch.language ?? 'standard'}`

    const capsStr = relevant.map(k => `${k}=${resolved[k]}`).join(', ') + textSearchStr

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
    ...Object.entries(capabilitiesProperties)
      .filter(([key]) => key !== 'text' && key !== 'textStandard')
      .map(([key, cap]) => `- **${key}** (default: ${cap.default}): ${cap.description}`),
    '- **searchable** (default: true): full text search, shown for every column that supports it. Serializes to the deprecated `text`/`textStandard` capabilities.',
    '- **language** (plain string columns only, default: platform language): language used for text analysis when searchable is true; omit/null for a standard (language-less) analysis.',
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
  const schemaByKey = new Map((dataset.schema || []).map((p: any) => [p.key, p]))
  const unknown = params.configs.filter((c: any) => !schemaByKey.has(c.key))
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
    } else {
      const capabilities: Record<string, boolean> = c.capabilities ? { ...c.capabilities } : {}
      let touched = !!c.capabilities
      if (c.searchable !== undefined) {
        const prop: any = schemaByKey.get(c.key)
        const effectiveType = prop['x-transform']?.type || prop.type
        const effectiveFormat = prop['x-transform']?.format || prop.format
        const kind = getTextSearchKind(effectiveType, effectiveFormat, prop['x-refersTo'])
        const patch = buildTextSearchPatch(kind, c.searchable, c.language)
        Object.assign(capabilities, patch.capabilities)
        if ('language' in patch) result.language = patch.language ?? null
        touched = true
      }
      if (touched) result.capabilities = diffCapabilities(capabilities)
    }

    return result
  })

  updatePropertyConfigFn(configs)

  const parts: string[] = []
  const typeCount = configs.filter(c => c.typeOverride !== undefined).length
  const capCount = configs.filter(c => c.capabilities !== undefined).length
  const langCount = configs.filter(c => c.language !== undefined).length
  if (typeCount) parts.push(`${typeCount} type override${typeCount > 1 ? 's' : ''}`)
  if (capCount) parts.push(`${capCount} capability config${capCount > 1 ? 's' : ''}`)
  if (langCount) parts.push(`${langCount} language config${langCount > 1 ? 's' : ''}`)
  return `Successfully applied ${parts.join(' and ')}.`
}
