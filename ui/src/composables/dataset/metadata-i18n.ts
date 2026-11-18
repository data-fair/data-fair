// MOCKUP i18n of the dataset metadata: the base keyword holds the owner's default locale,
// the other locales go in x-i18n-<keyword>, as json-layout does for schemas
import type { InjectionKey, Ref } from 'vue'

export type MetadataI18nConfig = { active: boolean, defaultLocale: string, locales: string[] }

export type MetadataI18n = {
  config: Ref<MetadataI18nConfig | null>
  // locale being edited, shared by every section of the page
  editLocale: Ref<string>
  isDefault: Ref<boolean>
}

const key: InjectionKey<MetadataI18n> = Symbol('metadataI18n')

export const provideMetadataI18n = (owner: Ref<{ type: string, id: string } | undefined>) => {
  const fetch = useFetch<MetadataI18nConfig>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/metadata-i18n` : null)
  const config = computed(() => fetch.data.value?.active ? fetch.data.value : null)
  const selected = ref<string | null>(null)
  const editLocale = computed({
    get: () => selected.value ?? config.value?.defaultLocale ?? 'fr',
    set: (v: string) => { selected.value = v }
  })
  const isDefault = computed(() => !config.value || editLocale.value === config.value.defaultLocale)
  const state: MetadataI18n = { config, editLocale, isDefault }
  provide(key, state)
  return state
}

export const useMetadataI18n = () => inject(key, null)

export const i18nKey = (k: string) => `x-i18n-${k}`

/** the value of a text keyword in a locale, undefined when not translated */
export const getI18nText = (obj: any, k: string, locale: string, defaultLocale: string) => {
  if (!obj) return undefined
  return locale === defaultLocale ? obj[k] : obj[i18nKey(k)]?.[locale]
}

/** writes a text keyword in a locale, in place */
export const setI18nText = (obj: any, k: string, locale: string, defaultLocale: string, value: any) => {
  if (locale === defaultLocale) {
    obj[k] = value
    return
  }
  const translations = { ...obj[i18nKey(k)] }
  if (value == null || value === '') delete translations[locale]
  else translations[locale] = value
  if (Object.keys(translations).length) obj[i18nKey(k)] = translations
  else delete obj[i18nKey(k)]
}

/** reads a keyword in the user's locale with a fallback on the base keyword, for display */
export const localizedText = (obj: any, k: string, locale: string) => obj?.[i18nKey(k)]?.[locale] || obj?.[k]

/** value labels in a locale: base x-labels overridden by x-i18n-x-labels[locale] */
export const localizedLabels = (prop: any, locale: string): Record<string, string> | undefined => {
  const translated = prop?.['x-i18n-x-labels']?.[locale]
  if (!translated) return prop?.['x-labels']
  return { ...prop['x-labels'], ...translated }
}

/** translatable texts of the metadata card and of the schema, with their state in a locale */
export const metadataTextKeys = ['title', 'summary', 'description', 'creator', 'spatial'] as const

/** a custom metadata translated per language: a free text, never a value of a closed list */
export const isCustomText = (def: any) => (def?.type ?? 'string') === 'string' && !def?.enum?.length

/** the optional fields are only in the form when the owner settings activate them */
export const translatableKeys = (datasetsMetadata: any) => [...metadataTextKeys, 'keywords']
  .filter(k => !['creator', 'spatial', 'keywords'].includes(k) || datasetsMetadata?.[k]?.active)

export const countMetadataTranslations = (dataset: any, locale: string, datasetsMetadata?: any) => {
  const keys = translatableKeys(datasetsMetadata).filter(k => [dataset?.[k] ?? []].flat().length)
  const custom = Object.entries(dataset?.customMetadata ?? {})
    .filter(([k, v]) => typeof v === 'string' && v && isCustomText(datasetsMetadata?.custom?.find((d: any) => d.key === k)))
    .map(([k]) => k)
  const done = keys.filter(k => [dataset?.[i18nKey(k)]?.[locale] ?? []].flat().length).length +
    custom.filter(k => dataset?.['x-i18n-customMetadata']?.[locale]?.[k]).length
  return { done, total: keys.length + custom.length }
}

export const countSchemaTranslations = (schema: any[] | undefined, locale: string) => {
  let done = 0
  let total = 0
  for (const prop of schema ?? []) {
    if (prop.key.startsWith('_')) continue
    for (const k of ['title', 'description']) {
      if (!prop[k]) continue
      total++
      if (prop[i18nKey(k)]?.[locale]) done++
    }
    for (const value of Object.keys(prop['x-labels'] ?? {})) {
      total++
      if (prop['x-i18n-x-labels']?.[locale]?.[value]) done++
    }
  }
  return { done, total }
}

/** replaces in place the schema texts by their translation in a locale, for a read-only display */
export const localizeSchema = (schema: any[], locale: string) => {
  for (const prop of schema) {
    for (const k of ['title', 'description']) {
      const translated = prop[i18nKey(k)]?.[locale]
      if (translated) prop[k] = translated
    }
    const labels = prop['x-i18n-x-labels']?.[locale]
    if (labels) prop['x-labels'] = { ...prop['x-labels'], ...labels }
  }
}

/** vjsf drops the x-i18n-* objects it has no form for: put them back on the items it emits, matched by key */
export const restoreI18n = <T extends Record<string, any>>(items: T[] | undefined, previous: T[] | undefined, key: string): T[] | undefined => {
  if (!items || !previous) return items
  return items.map((item, i) => {
    const old = item[key] ? previous.find(p => p[key] === item[key]) : previous[i]
    if (!old) return item
    const kept = Object.fromEntries(Object.entries(old).filter(([k]) => k.startsWith('x-i18n-') && !(k in item)))
    return Object.keys(kept).length ? { ...item, ...kept } : item
  })
}

export const stripI18n = (o: any) => o && JSON.parse(JSON.stringify(o, (k, v) => k.startsWith('x-i18n-') ? undefined : v))
