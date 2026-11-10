import settingsSchema from './settings/schema.js'
import type { Dataset } from './dataset/.type/index.js'
import type { Settings } from './settings/.type/index.js'
import { isCustomMetadataEmpty } from './custom-metadata.ts'

type ScoreSettings = { active?: boolean, weight?: number, recommendedMin?: number, recommendedMax?: number }
type DatasetsMetadata = NonNullable<Settings['datasetsMetadata']>

export type Completeness = NonNullable<Dataset['completeness']>
export type CompletenessCriterion = Completeness['criteria'][number]

const metadataSchema = settingsSchema.properties.datasetsMetadata.properties as Record<string, any>
const customSchema = metadataSchema.custom.items.properties

/** Dataset fields the score reads: the datasetsMetadata entries carrying a weight. */
export const scoredFields = Object.keys(metadataSchema).filter(key => metadataSchema[key].properties?.weight)

const isEmpty = (value: any): boolean => {
  if (value == null) return true
  if (typeof value === 'string') return !value.trim()
  if (Array.isArray(value)) return !value.length
  if (typeof value === 'object') return Object.values(value).every(isEmpty)
  return false
}

const sizeOf = (value: any) => typeof value === 'string' ? value.trim().length : Array.isArray(value) ? value.length : undefined

// an absent setting falls back on the schema default, the settings forms never write it
const withDefaults = (settings: ScoreSettings, defaults: Record<string, any>) => (['weight', 'recommendedMin', 'recommendedMax'] as const)
  .map(prop => settings[prop] ?? defaults[prop]?.default)

/** Size recommended for a dataset field (characters of a text, values of a list): the owner's setting while the score is active (the form hides it otherwise), else the platform default. */
export const recommendedSize = (key: string, datasetsMetadata?: DatasetsMetadata | null) => {
  const settings = datasetsMetadata?.completeness?.active ? datasetsMetadata[key] as ScoreSettings | undefined : undefined
  const [, min, max] = withDefaults(settings ?? {}, metadataSchema[key]?.properties ?? {})
  return { min, max }
}

/** The settings the stored scores depend on, undefined when the score is off: other changes (titles, tooltips, groups) do not rescore. */
export const scoreInputs = (datasetsMetadata?: DatasetsMetadata | null) => {
  if (!datasetsMetadata?.completeness?.active) return undefined
  const fields = scoredFields.map(key => {
    const { active, weight, recommendedMin, recommendedMax } = (datasetsMetadata[key] as ScoreSettings | undefined) ?? {}
    return { active, weight, recommendedMin, recommendedMax }
  })
  // type, multiple and enum changes remove values from the datasets (updateDatasetsMetadata)
  const custom = (datasetsMetadata.custom ?? []).map(({ key, type, multiple, enum: values, weight, recommendedMin, recommendedMax }) =>
    ({ key, type, multiple, values, weight, recommendedMin, recommendedMax }))
  return { fields, custom }
}

const rate = (key: string, custom: boolean, value: unknown, settings: ScoreSettings, defaults: Record<string, any>): CompletenessCriterion => {
  const [weight, recommendedMin, recommendedMax] = withDefaults(settings, defaults)
  const size = sizeOf(value)
  const outside = size !== undefined && ((recommendedMin !== undefined && size < recommendedMin) || (recommendedMax !== undefined && size > recommendedMax))
  // a custom value is empty by the rule its save applies (a link without url is dropped)
  const empty = custom ? isCustomMetadataEmpty(value) : isEmpty(value)
  return { key, custom, weight: weight ?? 0, size, recommendedMin, recommendedMax, note: empty ? 0 : outside ? 0.5 : 1 }
}

/** The metadata a dataset is scored on, as shown to its owner: active and weighted above 0. */
export const completenessCriteria = (dataset: Record<string, any>, datasetsMetadata?: DatasetsMetadata | null): CompletenessCriterion[] => {
  const criteria: CompletenessCriterion[] = []
  for (const key of scoredFields) {
    const settings = (datasetsMetadata?.[key] as ScoreSettings | undefined) ?? {}
    const defaults = metadataSchema[key].properties
    if (!(settings.active ?? defaults.active.default)) continue
    criteria.push(rate(key, false, dataset[key], settings, defaults))
  }
  for (const settings of datasetsMetadata?.custom ?? []) {
    if (settings.key) criteria.push(rate(settings.key, true, dataset.customMetadata?.[settings.key], settings, customSchema))
  }
  return criteria.filter(c => c.weight > 0)
}

/** Score from 0 to 100 and its criteria, undefined when the owner did not activate it or weighted nothing. */
export const computeCompleteness = (dataset: Record<string, any>, datasetsMetadata?: DatasetsMetadata | null): Completeness | undefined => {
  // a fragment is never published on its own, its catalog metadata are not edited
  if (!datasetsMetadata?.completeness?.active || dataset.partOf) return undefined
  const criteria = completenessCriteria(dataset, datasetsMetadata)
  const total = criteria.reduce((sum, c) => sum + c.weight, 0)
  if (!total) return undefined
  return { score: Math.round(100 * criteria.reduce((sum, c) => sum + c.note * c.weight, 0) / total), criteria }
}
