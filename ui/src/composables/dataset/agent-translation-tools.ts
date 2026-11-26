// MOCKUP i18n: the assistant translates the metadata card and the schema texts into the
// form being edited, the human reviews them in that locale and clicks Enregistrer
import type { Ref } from 'vue'
import { useAgentTool, useAgentSkill } from '@data-fair/lib-vue-agents'
import { createAgentTranslator } from '~/composables/agent/utils'
import { type MetadataI18n, i18nKey, metadataTextKeys, setI18nText } from './metadata-i18n'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readTranslations: 'Lire les textes à traduire',
    setTranslations: 'Saisir des traductions'
  },
  en: {
    readTranslations: 'Read the texts to translate',
    setTranslations: 'Set translations'
  }
}

const skillBodies: Record<string, string> = {
  en: `# Translate a dataset's metadata

The organization enters its datasets metadata in a default language and translates it into other supported languages. Only the descriptive texts are translated: never the data values, never the column keys.

1. Call read_dataset_translations with the target locale: it lists every translatable text in the default language, with its current translation if any.
2. Translate each text that has no translation yet (and fix an existing one only if the user asked). Keep the meaning and the register of the source, keep markdown formatting, keep proper nouns, acronyms, codes and units as they are.
3. Value labels: translate the label, never the coded value it labels (the value is a key in the data).
   Keywords: write a natural keyword list for the target language (not a word-for-word copy). Custom metadata: translate free texts only, never a value from a closed list.
4. Write all translations in ONE call to set_dataset_translations. Nothing is saved: the fields light up in the form, the user reviews them in that language and clicks Enregistrer.
5. Tell the user in one or two sentences what you translated and what you left (empty source texts are skipped).`,
  fr: `# Traduire les métadonnées d'un jeu de données

L'organisation saisit les métadonnées de ses jeux de données dans une langue par défaut et les traduit dans les autres langues supportées. Seuls les textes descriptifs sont traduits : jamais les valeurs des données, jamais les clés de colonnes.

1. Appelle read_dataset_translations avec la langue cible : il liste chaque texte traduisible dans la langue par défaut, avec sa traduction actuelle s'il y en a une.
2. Traduis chaque texte qui n'a pas encore de traduction (ne corrige une traduction existante que si l'utilisateur l'a demandé). Garde le sens et le registre de la source, la mise en forme markdown, les noms propres, sigles, codes et unités tels quels.
3. Libellés de valeurs : traduis le libellé, jamais la valeur codée qu'il désigne (la valeur est une clé dans les données).
   Mots-clés : écris une liste naturelle dans la langue cible (pas un mot à mot). Métadonnées personnalisées : traduis seulement les textes libres, jamais une valeur de liste fermée.
4. Écris toutes les traductions en UN SEUL appel à set_dataset_translations. Rien n'est enregistré : les champs s'allument dans le formulaire, l'utilisateur les relit dans cette langue et clique sur Enregistrer.
5. Dis à l'utilisateur en une ou deux phrases ce que tu as traduit et ce que tu as laissé (les textes source vides sont ignorés).`
}

type TranslationsInput = {
  locale: string
  metadata?: { title?: string, summary?: string, description?: string, creator?: string, spatial?: string, keywords?: string[], customMetadata?: Record<string, string> }
  columns?: { key: string, title?: string, description?: string, labels?: Record<string, string> }[]
}

export function useAgentTranslationTools (
  locale: Ref<string>,
  i18n: MetadataI18n,
  metadataData: Ref<any>,
  structureData: Ref<any>,
  applyToSchema: (mutate: (schema: any[]) => void) => void
) {
  const t = createAgentTranslator(messages, locale)

  const checkLocale = (target: string) => {
    const config = i18n.config.value
    if (!config) return 'Error: multilingual metadata is not enabled for this organization (settings > features).'
    if (target === config.defaultLocale) return `Error: "${target}" is the default language, translate into one of ${config.locales.filter(l => l !== config.defaultLocale).join(', ')}.`
    if (!config.locales.includes(target)) return `Error: "${target}" is not a supported language, use one of ${config.locales.filter(l => l !== config.defaultLocale).join(', ')}.`
    return null
  }

  useAgentTool({
    name: 'read_dataset_translations',
    description: 'List every translatable text of the dataset being edited (metadata card title, summary, description, producer, geographical coverage; column titles, descriptions and value labels) in the default language, with its current translation in the target locale. Call this before set_dataset_translations.',
    annotations: { title: t('readTranslations'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      required: ['locale'],
      properties: { locale: { type: 'string' as const, description: 'Target locale code, e.g. "en"' } }
    },
    execute: async (params: any) => {
      const error = checkLocale(params.locale)
      if (error) return error
      const config = i18n.config.value!
      const lines = [`Default language: ${config.defaultLocale}. Target: ${params.locale}.`, '', '## Metadata card']
      for (const k of metadataTextKeys) {
        const source = metadataData.value?.[k]
        if (!source) continue
        const current = metadataData.value?.[i18nKey(k)]?.[params.locale]
        lines.push(`- ${k}: ${JSON.stringify(source)}${current ? ` — current translation: ${JSON.stringify(current)}` : ' — not translated'}`)
      }
      const keywords: string[] = metadataData.value?.keywords ?? []
      if (keywords.length) {
        const current = metadataData.value?.['x-i18n-keywords']?.[params.locale]
        lines.push(`- keywords: ${JSON.stringify(keywords)}${current?.length ? ` — current: ${JSON.stringify(current)}` : ' — not translated'} (a free list in the target language, not necessarily one per source keyword)`)
      }
      for (const [k, v] of Object.entries<any>(metadataData.value?.customMetadata ?? {})) {
        if (typeof v !== 'string') continue
        const current = metadataData.value?.['x-i18n-customMetadata']?.[params.locale]?.[k]
        lines.push(`- customMetadata.${k}: ${JSON.stringify(v)}${current ? ` — current: ${JSON.stringify(current)}` : ' — not translated'} (skip it if it is a value from a closed list)`)
      }
      lines.push('', '## Columns')
      for (const prop of structureData.value?.schema ?? []) {
        if (prop.key.startsWith('_')) continue
        const parts: string[] = []
        for (const k of ['title', 'description']) {
          if (!prop[k]) continue
          const current = prop[i18nKey(k)]?.[params.locale]
          parts.push(`  - ${k}: ${JSON.stringify(prop[k])}${current ? ` — current: ${JSON.stringify(current)}` : ' — not translated'}`)
        }
        for (const [value, label] of Object.entries<string>(prop['x-labels'] ?? {})) {
          const current = prop['x-i18n-x-labels']?.[params.locale]?.[value]
          parts.push(`  - label of value ${JSON.stringify(value)}: ${JSON.stringify(label)}${current ? ` — current: ${JSON.stringify(current)}` : ' — not translated'}`)
        }
        if (parts.length) lines.push(`- \`${prop.key}\``, ...parts)
      }
      return lines.join('\n')
    }
  })

  useAgentTool({
    name: 'set_dataset_translations',
    description: 'Write translations of the dataset metadata into the form being edited, for one target locale. Pass only the texts you translate. Nothing is saved: the editing language switches to the target locale, the translated fields are highlighted and the user clicks Enregistrer.',
    annotations: { title: t('setTranslations') },
    inputSchema: {
      type: 'object' as const,
      required: ['locale'],
      properties: {
        locale: { type: 'string' as const, description: 'Target locale code, e.g. "en"' },
        metadata: {
          type: 'object' as const,
          properties: {
            title: { type: 'string' as const },
            summary: { type: 'string' as const },
            description: { type: 'string' as const, description: 'Markdown, same structure as the source' },
            creator: { type: 'string' as const, description: 'The producer, translate a name only when it has an official translation' },
            spatial: { type: 'string' as const, description: 'The geographical coverage' },
            keywords: { type: 'array' as const, items: { type: 'string' as const }, description: 'Keywords in the target language, replaces the whole list' },
            customMetadata: { type: 'object' as const, additionalProperties: { type: 'string' as const }, description: 'Free text custom metadata translations, keyed by the custom metadata key' }
          }
        },
        columns: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            required: ['key'],
            properties: {
              key: { type: 'string' as const, description: 'Column key, unchanged' },
              title: { type: 'string' as const },
              description: { type: 'string' as const },
              labels: { type: 'object' as const, additionalProperties: { type: 'string' as const }, description: 'Translated labels keyed by the coded value, the value itself unchanged' }
            }
          }
        }
      }
    },
    execute: async (input: any) => {
      const params = input as TranslationsInput
      const error = checkLocale(params.locale)
      if (error) return error
      const { defaultLocale } = i18n.config.value!
      const done: string[] = []
      const refused: string[] = []
      if (params.metadata && metadataData.value) {
        const next = { ...metadataData.value }
        for (const k of metadataTextKeys) {
          const value = params.metadata[k]
          if (value == null) continue
          if (!next[k]) { refused.push(`metadata ${k}: no source text`); continue }
          setI18nText(next, k, params.locale, defaultLocale, value)
          done.push(`metadata ${k}`)
        }
        if (params.metadata.keywords?.length) {
          setI18nText(next, 'keywords', params.locale, defaultLocale, params.metadata.keywords)
          done.push('metadata keywords')
        }
        for (const [k, v] of Object.entries(params.metadata.customMetadata ?? {})) {
          if (typeof next.customMetadata?.[k] !== 'string') { refused.push(`customMetadata ${k}: no free text source value`); continue }
          const all = { ...next['x-i18n-customMetadata'] }
          all[params.locale] = { ...all[params.locale], [k]: v }
          next['x-i18n-customMetadata'] = all
          done.push(`customMetadata ${k}`)
        }
        metadataData.value = next
      }
      if (params.columns?.length) {
        applyToSchema((schema) => {
          for (const col of params.columns!) {
            const index = schema.findIndex(p => p.key === col.key)
            if (index === -1) { refused.push(`column ${col.key}: unknown`); continue }
            const prop = schema[index] = { ...schema[index] }
            for (const k of ['title', 'description'] as const) {
              if (col[k] == null) continue
              setI18nText(prop, k, params.locale, defaultLocale, col[k])
              done.push(`${col.key} ${k}`)
            }
            if (col.labels) {
              const known = prop['x-labels'] ?? {}
              const all = { ...prop['x-i18n-x-labels'] }
              const translated = { ...all[params.locale] }
              for (const [value, label] of Object.entries(col.labels)) {
                if (!(value in known)) { refused.push(`${col.key} label ${value}: no such value label`); continue }
                translated[value] = label
                done.push(`${col.key} label ${value}`)
              }
              all[params.locale] = translated
              prop['x-i18n-x-labels'] = all
            }
          }
        })
      }
      i18n.editLocale.value = params.locale
      return [
        `${done.length} translation(s) written in the form (${params.locale}), not saved yet.`,
        ...(refused.length ? ['Refused:', ...refused.map(r => `- ${r}`)] : [])
      ].join('\n')
    }
  })

  useAgentSkill({
    name: 'translate-dataset',
    description: 'How to translate the current dataset\'s metadata (title, summary, description, column titles and descriptions, value labels) into another supported language. Load it before translating.',
    body: skillBodies[locale.value] ?? skillBodies.en
  })
}
