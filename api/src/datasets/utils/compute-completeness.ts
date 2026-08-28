import type { DatasetMetadataOptions } from '#types/settings/index.js'
import settingsSchema, { completenessGatedByMetadata } from '#types/settings/schema.js'

export type CompletenessKey = 'description' | 'summary' | 'license' | 'keywords' | 'topics' |
  'creator' | 'origin' | 'frequency' | 'spatial' | 'temporal' | 'conformsTo'

// read from the schema (not copied) so the form's denominator and the API's score can't drift.
// title is excluded on purpose: required at creation, it would score alike on every dataset.
const weightsProperties = settingsSchema.properties.metadataCompleteness.properties.weights.properties as
  Record<CompletenessKey, { default: number }>
export const DEFAULT_WEIGHTS = Object.fromEntries(
  Object.entries(weightsProperties).map(([key, prop]) => [key, prop.default])
) as Record<CompletenessKey, number>

const GATED_BY_METADATA = new Set<string>(completenessGatedByMetadata)

// also fixes the tie-break order of `missing`, independent of the configured weights
export const COMPLETENESS_KEYS = Object.keys(DEFAULT_WEIGHTS) as CompletenessKey[]

// an absent max, or a max of 0, means no upper bound
const DEFAULT_LENGTHS: Record<'description' | 'summary', { min: number, max?: number }> = {
  description: { min: 200 },
  summary: { min: 50, max: 250 }
}

export interface CompletenessConfig {
  active?: boolean
  weights?: Partial<Record<CompletenessKey, number>>
  description?: { min?: number, max?: number }
  summary?: { min?: number, max?: number }
}

export interface CompletenessInput {
  description?: string | null
  summary?: string | null
  license?: { title?: string, href?: string } | null
  keywords?: string[] | null
  topics?: { id?: string }[] | null
  creator?: string | null
  origin?: string | null
  frequency?: string | null
  spatial?: string | null
  temporal?: { start?: string, end?: string } | null
  conformsTo?: { title?: string, version?: string, url?: string } | null
  customMetadata?: Record<string, string> | null
}

export interface CompletenessContext {
  config: CompletenessConfig
  datasetsMetadata: DatasetMetadataOptions
  hasTopics: boolean
}

export type LengthKey = 'description' | 'summary'

// a custom criterion is whatever the owner defined in datasetsMetadata.custom with a weight above 0
type CustomMetadataCriterion = { key: string, title: string, weight: number }

export interface Completeness {
  score: number
  missing: (CompletenessKey | string)[]
  // window each text criterion counts against, stored so the interface needs no settings read
  lengths?: Partial<Record<LengthKey, { min: number, max?: number }>>
  // the owner's label for each weighted custom criterion, so the interface needs no settings read
  customLabels?: Record<string, string>
}

const len = (value: unknown): number => typeof value === 'string' ? value.trim().length : 0

// fixed keys read their weight from the config, custom ones from their definition — a key without a
// definition is weightless, so an abandoned key quietly drops out of the score
const weightOf = (key: string, context: CompletenessContext): number => {
  if (key in DEFAULT_WEIGHTS) return context.config.weights?.[key as CompletenessKey] ?? DEFAULT_WEIGHTS[key as CompletenessKey]
  return (context.datasetsMetadata.custom ?? []).find(c => c.key === key)?.weight ?? 0
}

// a key colliding with a fixed criterion is dropped rather than counted twice: the fixed one wins,
// since it is the one the dataset's own field (and the form's label) refers to
const customCriteria = (context: CompletenessContext): CustomMetadataCriterion[] =>
  (context.datasetsMetadata.custom ?? [])
    .map(c => ({ key: c.key ?? '', title: c.title, weight: c.weight ?? 0 }))
    .filter(c => c.key && c.weight > 0 && !(c.key in DEFAULT_WEIGHTS))

// the criteria that count under a context, in a stable order: fixed keys then the weighted custom
// ones as declared — this order is the equal-weight tie-break of `missing`
const criteriaKeys = (context: CompletenessContext): (CompletenessKey | string)[] => [
  ...COMPLETENESS_KEYS,
  ...customCriteria(context).map(c => c.key)
]

// a bound of 0 (or absent) does not constrain that side — and dropping the max is only expressible
// that way, since the settings form refills a cleared number input with its default
const lengthWindow = (key: LengthKey, config: CompletenessConfig): { min: number, max?: number } => {
  const min = config[key]?.min ?? DEFAULT_LENGTHS[key].min
  const max = config[key]?.max ?? DEFAULT_LENGTHS[key].max
  return max ? { min, max } : { min }
}

const withinLength = (value: unknown, key: LengthKey, config: CompletenessConfig): boolean => {
  const length = len(value)
  // presence is required regardless of the window: a min of 0 still does not credit an empty text
  if (length === 0) return false
  const { min, max } = lengthWindow(key, config)
  return length >= min && (max === undefined || length <= max)
}

// datasetsMetadata carries an index signature, so its options are reached through this single narrow
// cast rather than one per call site (the settings writer asks the same question to detect a change)
export const isMetadataOffered = (datasetsMetadata: DatasetMetadataOptions | undefined, key: string): boolean =>
  !!(datasetsMetadata as Record<string, { active?: boolean } | undefined> | undefined)?.[key]?.active

// applicable = weighted above 0, field offered by the owner, and (topics) the org defined some.
// A custom criterion is applicable by being defined with a weight, there is no separate switch.
const isApplicable = (key: string, context: CompletenessContext): boolean => {
  if (weightOf(key, context) <= 0) return false
  if (key === 'topics') return context.hasTopics
  if (GATED_BY_METADATA.has(key)) return isMetadataOffered(context.datasetsMetadata, key)
  return true
}

const isFilled = (key: string, dataset: CompletenessInput, config: CompletenessConfig): boolean => {
  // anything not named by a fixed criterion is a custom one, read off customMetadata
  if (!(key in DEFAULT_WEIGHTS)) return len(dataset.customMetadata?.[key]) > 0
  switch (key) {
    case 'description': return withinLength(dataset.description, 'description', config)
    case 'summary': return withinLength(dataset.summary, 'summary', config)
    case 'license': return !!dataset.license?.href
    case 'keywords': return !!dataset.keywords?.length
    case 'topics': return !!dataset.topics?.length
    case 'temporal': return !!(dataset.temporal?.start || dataset.temporal?.end)
    // a version alone identifies nothing; the schema is referenced by its title or its URL
    case 'conformsTo': return !!(dataset.conformsTo?.title || dataset.conformsTo?.url)
    default: return len(dataset[key as keyof CompletenessInput]) > 0
  }
}

// the denominator a context would produce; 0 means a meaningless score, refused at save time
export const applicableWeight = (context: CompletenessContext): number => criteriaKeys(context)
  .filter(key => isApplicable(key, context))
  .reduce((sum, key) => sum + weightOf(key, context), 0)

// the two cross-field rules a JSON schema can't express, re-checked here since the form guards them
// only in the browser. Returns a message to display, or undefined when the config holds.
export const validateMetadataCompleteness = (context: CompletenessContext): string | undefined => {
  if (!context.config.active) return undefined
  for (const key of ['description', 'summary'] as LengthKey[]) {
    const { min, max } = lengthWindow(key, context.config)
    if (max !== undefined && min > max) {
      return `La longueur minimale attendue (${min}) dépasse la longueur maximale (${max}) : aucun texte ne peut satisfaire ce critère.`
    }
  }
  if (applicableWeight(context) === 0) {
    return 'Au moins un critère proposé doit avoir un poids supérieur à 0 pour que le score ait un sens.'
  }
  return undefined
}

// 0-100, scaled on the applicable criteria. `missing` lists the unfilled ones, heaviest first.
// Returns undefined when nothing is applicable: callers store no field, same signal as the feature off.
export const computeCompleteness = (dataset: CompletenessInput, context: CompletenessContext): Completeness | undefined => {
  const { config } = context
  const keys = criteriaKeys(context)
  const custom = customCriteria(context)
  let applicable = 0
  let obtained = 0
  const missing: (CompletenessKey | string)[] = []
  const lengths: Partial<Record<LengthKey, { min: number, max?: number }>> = {}
  const customLabels: Record<string, string> = {}
  for (const key of keys) {
    if (!isApplicable(key, context)) continue
    const weight = weightOf(key, context)
    applicable += weight
    if (key === 'description' || key === 'summary') lengths[key] = lengthWindow(key, config)
    else if (!(key in DEFAULT_WEIGHTS)) customLabels[key] = custom.find(c => c.key === key)?.title ?? key
    if (isFilled(key, dataset, config)) obtained += weight
    else missing.push(key)
  }
  if (applicable === 0) return undefined
  missing.sort((a, b) =>
    weightOf(b, context) - weightOf(a, context) || keys.indexOf(a) - keys.indexOf(b))
  const result: Completeness = { score: Math.round(100 * obtained / applicable), missing }
  if (Object.keys(lengths).length) result.lengths = lengths
  if (Object.keys(customLabels).length) result.customLabels = customLabels
  return result
}
