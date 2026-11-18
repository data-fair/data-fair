// MOCKUP i18n of the datasets metadata: the base keyword holds the owner's default locale,
// the other locales go in x-i18n-<keyword>[locale] (see docs/architecture/metadata-i18n.md)
import { httpError } from '@data-fair/lib-utils/http-errors.js'

export const localePattern = /^[a-z]{2,3}$/

export const datasetTextKeys = ['title', 'summary', 'description', 'creator', 'spatial', 'keywords'] as const
// the texts of a column and of an attachment
const itemTextKeys = ['title', 'description'] as const

const isI18nKey = (k: string) => k.startsWith('x-i18n-')

const cleanText = (v: unknown) => typeof v === 'string' ? v.trim() : undefined
const cleanKeywords = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(cleanText).filter(Boolean))] as string[] : undefined

/** trims every translation of a { locale: value } map, drops the empty ones, undefined if none is left */
const cleanLocales = (translations: any, cleanValue: (v: unknown) => any) => {
  if (!translations || typeof translations !== 'object') return undefined
  const result: Record<string, any> = {}
  for (const [locale, value] of Object.entries(translations)) {
    const cleaned = cleanValue(value)
    if (cleaned === undefined || cleaned === '' || (Array.isArray(cleaned) && !cleaned.length) || (typeof cleaned === 'object' && !Object.keys(cleaned).length)) continue
    result[locale] = cleaned
  }
  return Object.keys(result).length ? result : undefined
}

const cleanTextsMap = (v: unknown) => cleanLocales(v, cleanText)

/**
 * Trims the translations of a dataset (or of a patch) and removes the empty ones, in place.
 * An emptied top-level map becomes null in a patch (unset) and is removed otherwise.
 */
export const cleanDatasetTranslations = (dataset: any, isPatch: boolean) => {
  const set = (obj: any, k: string, value: any) => {
    if (value !== undefined) obj[k] = value
    else if (isPatch) obj[k] = null
    else delete obj[k]
  }
  for (const k of datasetTextKeys) {
    const key = `x-i18n-${k}`
    if (dataset[key] == null) continue
    set(dataset, key, cleanLocales(dataset[key], k === 'keywords' ? cleanKeywords : cleanText))
  }
  if (dataset['x-i18n-customMetadata'] != null) set(dataset, 'x-i18n-customMetadata', cleanLocales(dataset['x-i18n-customMetadata'], cleanTextsMap))
  for (const item of [...dataset.schema ?? [], ...dataset.attachments ?? []]) {
    for (const k of itemTextKeys) {
      if (item[`x-i18n-${k}`] == null) continue
      const cleaned = cleanLocales(item[`x-i18n-${k}`], cleanText)
      if (cleaned) item[`x-i18n-${k}`] = cleaned
      else delete item[`x-i18n-${k}`]
    }
  }
  for (const prop of dataset.schema ?? []) {
    if (prop['x-i18n-x-labels'] != null) {
      // a label translated for a value the column no longer labels is dropped with it
      const known = prop['x-labels'] ?? {}
      const cleaned = cleanLocales(prop['x-i18n-x-labels'], (labels: any) => cleanLocales(
        Object.fromEntries(Object.entries(labels ?? {}).filter(([value]) => value in known)), cleanText))
      if (cleaned) prop['x-i18n-x-labels'] = cleaned
      else delete prop['x-i18n-x-labels']
    }
  }
}

/** the lang query parameter asking for a localized response, undefined when absent */
export const reqLang = (query: Record<string, any>): string | undefined => {
  const lang = query.lang
  if (lang === undefined || lang === '') return undefined
  if (typeof lang !== 'string' || !localePattern.test(lang)) throw httpError(400, 'lang must be a 2 or 3 lowercase letters language code')
  return lang
}

const dropI18n = (obj: any) => {
  for (const k of Object.keys(obj)) if (isI18nKey(k)) delete obj[k]
}

const localizeItem = (item: any, lang: string) => {
  for (const k of itemTextKeys) {
    const translated = item[`x-i18n-${k}`]?.[lang]
    if (translated) item[k] = translated
  }
}

/** replaces in place the schema texts by their translation in lang, the base texts being the fallback */
export const localizeSchema = (schema: any[], lang: string) => {
  for (const prop of schema) {
    localizeItem(prop, lang)
    const labels = prop['x-i18n-x-labels']?.[lang]
    if (labels && prop['x-labels']) prop['x-labels'] = { ...prop['x-labels'], ...labels }
    dropI18n(prop)
  }
  return schema
}

/** replaces in place the metadata texts by their translation in lang, a monolingual document without x-i18n-* */
export const localizeDataset = (dataset: any, lang: string) => {
  for (const k of datasetTextKeys) {
    const translated = dataset[`x-i18n-${k}`]?.[lang]
    if (translated?.length) dataset[k] = translated
  }
  const custom = dataset['x-i18n-customMetadata']?.[lang]
  if (custom && dataset.customMetadata) {
    // only a free text is translated, a value of a closed list keeps the stored one
    for (const [k, v] of Object.entries(custom)) {
      if (typeof dataset.customMetadata[k] === 'string') dataset.customMetadata[k] = v
    }
  }
  for (const topic of dataset.topics ?? []) {
    const translated = topic['x-i18n-title']?.[lang]
    if (translated) topic.title = translated
    dropI18n(topic)
  }
  if (dataset.schema) localizeSchema(dataset.schema, lang)
  for (const attachment of dataset.attachments ?? []) {
    localizeItem(attachment, lang)
    dropI18n(attachment)
  }
  dropI18n(dataset)
  return dataset
}

/** a list select of base keywords completed with their translations, so they can be localized */
export const i18nSelect = (select: string) => {
  const keys = select.split(',')
  const extra = keys.filter(k => (datasetTextKeys as readonly string[]).includes(k) || k === 'customMetadata').map(k => `x-i18n-${k}`)
  return [...keys, ...extra].join(',')
}
