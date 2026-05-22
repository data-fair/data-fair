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

const WORDS = [
  'données', 'analyse', 'résultat', 'population', 'commune', 'département', 'région',
  'emploi', 'transport', 'énergie', 'budget', 'école', 'santé', 'environnement',
  'agriculture', 'industrie', 'commerce', 'tourisme', 'culture', 'logement',
  'mobilité', 'climat', 'territoire', 'service', 'projet', 'infrastructure'
]

const CATEGORIES = [
  'cat-alpha', 'cat-beta', 'cat-gamma', 'cat-delta', 'cat-epsilon',
  'cat-zeta', 'cat-eta', 'cat-theta', 'cat-iota', 'cat-kappa'
]

/** Generate a single value for a column. */
function generateValue (col: GeneratedColumn, rand: () => number): unknown {
  switch (col.type) {
    case 'string':
      if (col.analyzed) {
        const n = 3 + Math.floor(rand() * 4)
        const words: string[] = []
        for (let k = 0; k < n; k++) words.push(WORDS[Math.floor(rand() * WORDS.length)])
        return words.join(' ')
      }
      return col.cardinality === 'low'
        ? CATEGORIES[Math.floor(rand() * CATEGORIES.length)]
        : `code-${Math.floor(rand() * 1_000_000)}`
    case 'integer':
      return col.cardinality === 'low' ? Math.floor(rand() * 10) : Math.floor(rand() * 1_000_000)
    case 'number':
      if (col.field.key === 'lat') return 41 + rand() * 10
      if (col.field.key === 'lon') return -5 + rand() * 15
      return Math.round(rand() * 1_000_000) / 100
    case 'date': {
      const y = 2018 + Math.floor(rand() * 7)
      const m = String(1 + Math.floor(rand() * 12)).padStart(2, '0')
      const d = String(1 + Math.floor(rand() * 28)).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    case 'boolean':
      return rand() < 0.5
  }
}

/** Lazily yield generated rows — used by the seeder to avoid holding millions of rows in memory. */
export function * rowIterator (spec: DatasetSpec, count = spec.rows): Generator<Row> {
  const columns = generateColumns(spec)
  const rand = mulberry32(spec.seed ?? 42)
  for (let i = 0; i < count; i++) {
    const row: Row = { _id: `row-${i}` }
    for (const col of columns) row[col.field.key] = generateValue(col, rand)
    yield row
  }
}

/** Eagerly generate rows (for tests / small datasets). */
export function generateRows (spec: DatasetSpec, count = spec.rows): Row[] {
  return [...rowIterator(spec, count)]
}

export interface SchemaContext {
  fields: SchemaField[]
  fullTextFields: string[]
  keywordFields: string[]
  numberFields: string[]
  dateFields: string[]
  booleanFields: string[]
  geoFields: string[]
}

/** The analyzed inner sub-fields a string column exposes (`.text`, `.text_standard`). */
export function analyzedSubfields (field: SchemaField): string[] {
  if (field.type !== 'string' || field.format) return []
  const caps = field['x-capabilities']
  const subs: string[] = []
  if (caps?.text ?? true) subs.push('text')
  if (caps?.textStandard ?? true) subs.push('text_standard')
  return subs
}

/** Derive field groupings from a generated schema, for use in experiment query bodies. */
export function schemaContext (schema: SchemaField[]): SchemaContext {
  const ctx: SchemaContext = {
    fields: schema,
    fullTextFields: [],
    keywordFields: [],
    numberFields: [],
    dateFields: [],
    booleanFields: [],
    geoFields: []
  }
  for (const f of schema) {
    const refersTo = f['x-refersTo'] ?? ''
    if (refersTo.includes('latitude') || refersTo.includes('longitude')) { ctx.geoFields.push(f.key); continue }
    if (f.type === 'boolean') ctx.booleanFields.push(f.key)
    else if (f.type === 'integer' || f.type === 'number') ctx.numberFields.push(f.key)
    else if (f.type === 'string' && f.format === 'date') ctx.dateFields.push(f.key)
    else if (f.type === 'string') {
      if (isAnalyzed(f['x-capabilities'])) ctx.fullTextFields.push(f.key)
      else ctx.keywordFields.push(f.key)
    }
  }
  return ctx
}
