import { type OptionsDesMetadonneesDeJeuxDeDonnees } from '#types/settings/index.js'
import settingsSchema, { completenessGatedByMetadata } from '#types/settings/schema.js'

export type CompletenessKey = 'description' | 'summary' | 'license' | 'keywords' | 'topics' |
  'creator' | 'origin' | 'frequency' | 'spatial' | 'temporal' | 'conformsTo'

/**
 * Default points per criterion, used for any weight the owner did not override. Small integers
 * rather than shares of a percentage: the score is scaled on the sum of the APPLICABLE criteria, so
 * disabling one never forces a redistribution over the others.
 *
 * Read from the settings schema rather than copied here: the schema is what the settings form
 * prefills its inputs from, so a table of its own would let the score the API computes and the
 * denominator the form warns about drift apart without a single test failing.
 *
 * The title is deliberately absent. It is required at creation (`required` in the dataset schema,
 * and createDataset rejects a metadata-only dataset without one), so a presence criterion would be
 * satisfied by every dataset in perpetuity: one point added to both the numerator and the
 * denominator of everything, distinguishing nothing and making a 0% score unreachable.
 */
const weightsProperties = settingsSchema.properties.metadataCompleteness.properties.weights.properties as
  Record<CompletenessKey, { default: number }>
export const DEFAULT_WEIGHTS = Object.fromEntries(
  Object.entries(weightsProperties).map(([key, prop]) => [key, prop.default])
) as Record<CompletenessKey, number>

/** The criteria gated on the owner offering their field — the schema's list, see its comment. */
const GATED_BY_METADATA = new Set<string>(completenessGatedByMetadata)

/**
 * The dataset keys a patch has to touch for the score to be worth recomputing, and the tie-breaking
 * order of `missing`. Independent of the configured weights, which may reorder or zero any of them.
 */
export const COMPLETENESS_KEYS = Object.keys(DEFAULT_WEIGHTS) as CompletenessKey[]

/** Fallback length bounds. An absent max means the criterion only has a floor, as does a max of 0. */
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
  /**
   * The window each text criterion is measured against, for the criteria that count. Carried by the
   * dataset rather than left in the settings: it is what lets the interface say *why* a description
   * does not count and warn about the length while it is being typed, and it costs the dataset page
   * no settings read — the same reason the score itself is stored.
   */
  lengths?: Partial<Record<LengthKey, { min: number, max?: number }>>
}

/** Raw trimmed length: the description is markdown, and its syntax counts (see the design doc §2). */
const len = (value: unknown): number => typeof value === 'string' ? value.trim().length : 0

const weightOf = (key: CompletenessKey, config: CompletenessConfig): number =>
  config.weights?.[key] ?? DEFAULT_WEIGHTS[key]

/**
 * The window a text criterion is measured against. A bound of 0 does not constrain its side, the
 * same "0 means neutral" convention as the weights — and it is how an owner drops the upper bound at
 * all: the settings form fills a cleared number input back with its default, so an empty maximum is
 * not something they can express.
 */
const lengthWindow = (key: LengthKey, config: CompletenessConfig): { min: number, max?: number } => {
  const min = config[key]?.min ?? DEFAULT_LENGTHS[key].min
  const max = config[key]?.max ?? DEFAULT_LENGTHS[key].max
  return max ? { min, max } : { min }
}

const withinLength = (value: unknown, key: LengthKey, config: CompletenessConfig): boolean => {
  const length = len(value)
  // Presence first, and independently of the window. Clearing the floor drops the length
  // requirement, not the criterion: `0 >= 0` would otherwise credit the heaviest criterion of the
  // table to every dataset of the organization, description absent included.
  if (length === 0) return false
  const { min, max } = lengthWindow(key, config)
  return length >= min && (max === undefined || length <= max)
}

/**
 * Which criteria count, through the three cumulative gates of the design doc §3: a weight above
 * zero, a field actually offered to users, and — for topics — an organization that defined some.
 * Counting a field its owner deactivated would blame the dataset for something nobody can fill:
 * that score could never be raised.
 */
const isApplicable = (key: CompletenessKey, context: CompletenessContext): boolean => {
  if (weightOf(key, context.config) <= 0) return false
  if (key === 'topics') return context.hasTopics
  if (GATED_BY_METADATA.has(key)) return !!(context.datasetsMetadata as Record<string, { active?: boolean }>)?.[key]?.active
  return true
}

/** Each criterion is binary: this is a completeness, not a quality score. */
const isFilled = (key: CompletenessKey, dataset: CompletenessInput, config: CompletenessConfig): boolean => {
  switch (key) {
    case 'description': return withinLength(dataset.description, 'description', config)
    case 'summary': return withinLength(dataset.summary, 'summary', config)
    case 'license': return !!dataset.license?.href
    case 'keywords': return !!dataset.keywords?.length
    case 'topics': return !!dataset.topics?.length
    case 'temporal': return !!(dataset.temporal?.start || dataset.temporal?.end)
    // a version alone identifies nothing, the schema is referenced by its title or its URL
    case 'conformsTo': return !!(dataset.conformsTo?.title || dataset.conformsTo?.url)
    default: return len(dataset[key]) > 0
  }
}

/**
 * The denominator a configuration would produce, independently of any dataset. Zero means the score
 * cannot mean anything: every criterion is either weighted 0 or gated off. Checked at settings save
 * time so such a configuration is refused rather than written onto a whole organization.
 */
export const applicableWeight = (context: CompletenessContext): number => COMPLETENESS_KEYS
  .filter(key => isApplicable(key, context))
  .reduce((sum, key) => sum + weightOf(key, context.config), 0)

/**
 * The two cross-field rules a JSON schema cannot express, returned as a message to display or
 * undefined when the configuration holds. Both produce a score nobody can act on and both are
 * reachable from the API alone — the settings form guards the first one only, and only in the
 * browser — so they are checked again where the settings are written.
 */
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

/**
 * Metadata completeness of a dataset, from 0 to 100, scaled on the criteria the owner's settings
 * make applicable. `missing` lists the applicable criteria left unfilled, heaviest configured weight
 * first, so the interface can say what to fill without duplicating any of the logic above.
 *
 * Returns undefined when the applicable weights all sum to zero: nothing was measured, and a 0 %
 * would read as "you filled nothing" rather than "there is nothing to fill". Callers store no field
 * at all in that case — the same signal as the feature being off. `validateMetadataCompleteness`
 * refuses to save such a configuration, so this only catches one stored before that check.
 */
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
