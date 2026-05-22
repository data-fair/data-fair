// Deterministic schema + data generation for benchmark datasets.

/** Seeded PRNG (mulberry32) — deterministic across runs. */
export function mulberry32 (seed: number): () => number {
  return function () {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/** Per-column x-capabilities (subset relevant to the harness; see api/contract/capabilities.js). */
export type Capabilities = Partial<{
  text: boolean
  textStandard: boolean
  index: boolean
  values: boolean
  textAgg: boolean
  wildcard: boolean
}>

/** Named capability presets — keep DatasetSpec readable. */
export const capabilityPresets = {
  fullText: { text: true, textStandard: true, index: true, values: true },
  searchOnly: { text: true, textStandard: true, index: false, values: false },
  keywordOnly: { text: false, textStandard: false, index: true, values: true }
} satisfies Record<string, Capabilities>

export type ColumnType = 'string' | 'integer' | 'number' | 'date' | 'boolean'

export interface ColumnGroup {
  type: ColumnType
  count: number
  capabilities?: Capabilities
  cardinality?: 'low' | 'high'
}

export interface DatasetSpec {
  id: string
  columns: ColumnGroup[]
  geo?: boolean
  rows: number
  shards?: number
  seed?: number
}

/** A data-fair schema property. */
export interface SchemaField {
  key: string
  type: string
  format?: string
  'x-capabilities'?: Capabilities
  'x-refersTo'?: string
}

export type Row = Record<string, unknown>

interface GeneratedColumn {
  field: SchemaField
  type: ColumnType
  cardinality: 'low' | 'high'
  analyzed: boolean
}

const KEY_PREFIX: Record<ColumnType, string> = {
  string: 'text', integer: 'int', number: 'num', date: 'date', boolean: 'bool'
}

/** A string column gets analyzed sub-fields unless both text capabilities are off. */
function isAnalyzed (caps?: Capabilities): boolean {
  return (caps?.text ?? true) || (caps?.textStandard ?? true)
}

/** Map a column type to its data-fair JSON-schema type. */
function dfType (type: ColumnType): string {
  return type === 'date' ? 'string' : type
}

/** Expand a DatasetSpec into concrete columns with generation metadata. */
function generateColumns (spec: DatasetSpec): GeneratedColumn[] {
  const cols: GeneratedColumn[] = []
  const counters: Record<string, number> = {}
  for (const group of spec.columns) {
    const analyzed = group.type === 'string' ? isAnalyzed(group.capabilities) : false
    const cardinality = group.cardinality ?? 'high'
    for (let i = 0; i < group.count; i++) {
      const prefix = group.type === 'string'
        ? (analyzed ? 'text' : 'kw')
        : KEY_PREFIX[group.type]
      counters[prefix] = (counters[prefix] ?? 0) + 1
      const field: SchemaField = { key: `${prefix}${counters[prefix]}`, type: dfType(group.type) }
      if (group.type === 'date') field.format = 'date'
      if (group.capabilities) field['x-capabilities'] = { ...group.capabilities }
      cols.push({ field, type: group.type, cardinality, analyzed })
    }
  }
  if (spec.geo) {
    cols.push({ field: { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' }, type: 'number', cardinality: 'high', analyzed: false })
    cols.push({ field: { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }, type: 'number', cardinality: 'high', analyzed: false })
  }
  return cols
}

/** Produce the data-fair schema for a spec. */
export function generateSchema (spec: DatasetSpec): SchemaField[] {
  return generateColumns(spec).map(c => c.field)
}
