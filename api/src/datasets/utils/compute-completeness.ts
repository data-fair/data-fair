import { type OptionsDesMetadonneesDeJeuxDeDonnees } from '#types/settings/index.js'
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
}

export interface CompletenessContext {
  config: CompletenessConfig
  datasetsMetadata: OptionsDesMetadonneesDeJeuxDeDonnees
  hasTopics: boolean
}

export type LengthKey = 'description' | 'summary'

export interface Completeness {
  score: number
  missing: CompletenessKey[]
  // window each text criterion counts against, stored so the interface needs no settings read
  lengths?: Partial<Record<LengthKey, { min: number, max?: number }>>
}

const len = (value: unknown): number => typeof value === 'string' ? value.trim().length : 0

const weightOf = (key: CompletenessKey, config: CompletenessConfig): number =>
  config.weights?.[key] ?? DEFAULT_WEIGHTS[key]

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

// applicable = weighted above 0, field offered by the owner, and (topics) the org defined some
const isApplicable = (key: CompletenessKey, context: CompletenessContext): boolean => {
  if (weightOf(key, context.config) <= 0) return false
  if (key === 'topics') return context.hasTopics
  if (GATED_BY_METADATA.has(key)) return !!(context.datasetsMetadata as Record<string, { active?: boolean }>)?.[key]?.active
  return true
}

const isFilled = (key: CompletenessKey, dataset: CompletenessInput, config: CompletenessConfig): boolean => {
  switch (key) {
    case 'description': return withinLength(dataset.description, 'description', config)
    case 'summary': return withinLength(dataset.summary, 'summary', config)
    case 'license': return !!dataset.license?.href
    case 'keywords': return !!dataset.keywords?.length
    case 'topics': return !!dataset.topics?.length
    case 'temporal': return !!(dataset.temporal?.start || dataset.temporal?.end)
    // a version alone identifies nothing; the schema is referenced by its title or its URL
    case 'conformsTo': return !!(dataset.conformsTo?.title || dataset.conformsTo?.url)
    default: return len(dataset[key]) > 0
  }
}

// the denominator a config would produce; 0 means a meaningless score, refused at save time
export const applicableWeight = (context: CompletenessContext): number => COMPLETENESS_KEYS
  .filter(key => isApplicable(key, context))
  .reduce((sum, key) => sum + weightOf(key, context.config), 0)

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

// 0–100, scaled on the applicable criteria. `missing` lists the unfilled ones, heaviest first.
// Returns undefined when nothing is applicable: callers store no field, same signal as the feature off.
export const computeCompleteness = (dataset: CompletenessInput, context: CompletenessContext): Completeness | undefined => {
  const { config } = context
  let applicable = 0
  let obtained = 0
  const missing: CompletenessKey[] = []
  const lengths: Partial<Record<LengthKey, { min: number, max?: number }>> = {}
  for (const key of COMPLETENESS_KEYS) {
    if (!isApplicable(key, context)) continue
    const weight = weightOf(key, config)
    applicable += weight
    if (key === 'description' || key === 'summary') lengths[key] = lengthWindow(key, config)
    if (isFilled(key, dataset, config)) obtained += weight
    else missing.push(key)
  }
  if (applicable === 0) return undefined
  missing.sort((a, b) =>
    weightOf(b, config) - weightOf(a, config) || COMPLETENESS_KEYS.indexOf(a) - COMPLETENESS_KEYS.indexOf(b))
  const result: Completeness = { score: Math.round(100 * obtained / applicable), missing }
  if (Object.keys(lengths).length) result.lengths = lengths
  return result
}
