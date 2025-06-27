import config from '#config'
import i18n from 'i18n'
import { join } from 'path'
import vocabularyRaw from '../contract/vocabulary.js'

export type Locale = 'fr' | 'en'

export type LocalizedConcept = { identifiers: string[], title: string, description: string, tag: string | undefined }

export const vocabularyArray: { en: LocalizedConcept[], fr: LocalizedConcept[] } = { en: [], fr: [] }

export const vocabulary: { en: Record<string, LocalizedConcept>, fr: Record<string, LocalizedConcept> } = { en: {}, fr: {} }

const defaultLocale = config.i18n.defaultLocale as Locale

i18n.configure({
  defaultLocale,
  directory: join(import.meta.dirname, './messages'),
  cookie: 'i18n_lang',
  objectNotation: true
})

// export const middleware = i18n.init
export const middleware = (req, res, next) => {
  // optimization that only applies i18n.init middleware on demand and initially only binds to the Request prototype
  // eslint-disable-next-line no-proto
  const proto = req.__proto__
  if (!proto.__) {
    proto.__ = function () {
      // @ts-ignore
      i18n.init(this)
      return i18n.__.apply(this, arguments)
    }
    proto.getLocale = function () {
      // @ts-ignore
      i18n.init(this)
      return this.locale
    }
  }
  next()
}

for (const _locale of i18n.getLocales()) {
  const locale = _locale as Locale
  vocabularyArray[locale] = vocabularyRaw.map(concept => ({
    ...concept,
    title: concept.title[locale] || concept.title[defaultLocale],
    description: concept.description[locale] || concept.description[defaultLocale],
    tag: concept.tag[locale] || concept.tag[defaultLocale]
  }))
  vocabulary[locale] = {}
  for (const concept of vocabularyArray[locale]) {
    for (const id of concept.identifiers) {
      vocabulary[locale][id] = concept
    }
  }
}
