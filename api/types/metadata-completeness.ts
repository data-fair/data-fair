import settingsSchema from './settings/schema.js'

type ScoreSettings = { active?: boolean, weight?: number, recommendedMin?: number, recommendedMax?: number }
type DatasetsMetadata = Record<string, any> & {
  completeness?: { active?: boolean }
  custom?: (ScoreSettings & { key?: string, title: string })[]
}

export type CompletenessCriterion = {
  // a dataset field, or a custom metadata key when custom is true
  key: string
  custom: boolean
  weight: number
  // characters of a text, values of a list, nothing for other values
  size?: number
  recommendedMin?: number
  recommendedMax?: number
  // 0 empty, 0.5 outside the recommended bounds, 1 filled
  note: 0 | 0.5 | 1
}

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

const rate = (key: string, custom: boolean, value: unknown, settings: ScoreSettings, defaults: Record<string, any>): CompletenessCriterion => {
  const [weight, recommendedMin, recommendedMax] = (['weight', 'recommendedMin', 'recommendedMax'] as const)
    .map(prop => settings[prop] ?? defaults[prop]?.['x-default'])
  const size = sizeOf(value)
  const outside = size !== undefined && ((recommendedMin !== undefined && size < recommendedMin) || (recommendedMax !== undefined && size > recommendedMax))
  return { key, custom, weight: weight ?? 0, size, recommendedMin, recommendedMax, note: isEmpty(value) ? 0 : outside ? 0.5 : 1 }
}

/** The metadata a dataset is scored on, as shown to its owner: active and weighted above 0. */
export const completenessCriteria = (dataset: Record<string, any>, datasetsMetadata?: DatasetsMetadata | null): CompletenessCriterion[] => {
  const criteria: CompletenessCriterion[] = []
  for (const key of scoredFields) {
    const settings: ScoreSettings = datasetsMetadata?.[key] ?? {}
    const defaults = metadataSchema[key].properties
    if (!(settings.active ?? defaults.active?.default ?? true)) continue
    criteria.push(rate(key, false, dataset[key], settings, defaults))
  }
  for (const settings of datasetsMetadata?.custom ?? []) {
    if (settings.key) criteria.push(rate(settings.key, true, dataset.customMetadata?.[settings.key], settings, customSchema))
  }
  return criteria.filter(c => c.weight > 0)
}

/** Score from 0 to 100, undefined when the owner did not activate it or weighted nothing. */
export const computeCompleteness = (dataset: Record<string, any>, datasetsMetadata?: DatasetsMetadata | null) => {
  // a fragment is never published on its own, its catalog metadata are not edited
  if (!datasetsMetadata?.completeness?.active || dataset.partOf) return undefined
  const criteria = completenessCriteria(dataset, datasetsMetadata)
  const total = criteria.reduce((sum, c) => sum + c.weight, 0)
  if (!total) return undefined
  return Math.round(100 * criteria.reduce((sum, c) => sum + c.note * c.weight, 0) / total)
}
