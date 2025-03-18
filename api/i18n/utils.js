import config from '#config'
import i18n from 'i18n'
import { join } from 'path'
import vocabularyRaw from '../contract/vocabulary.js'

const defaultLocale = /** @type {'en' | 'fr'} */(config.i18n.defaultLocale)

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
      i18n.init(this)
      return i18n.__.apply(this, arguments)
    }
    proto.getLocale = function () {
      i18n.init(this)
      return this.locale
    }
  }
  next()
}

/** @typedef {{identifiers: string[], title: string, description: string, tag: string | undefined}} LocalizedConcept */

/** @type {{en: LocalizedConcept[], fr: LocalizedConcept[]}} */
export const vocabularyArray = { en: [], fr: [] }

/** @type {{en: Record<string, LocalizedConcept>, fr: Record<string, LocalizedConcept>}} */
export const vocabulary = { en: {}, fr: {} }

for (const _locale of i18n.getLocales()) {
  const locale = /** @type {'en' | 'fr'} */(_locale)
  vocabularyArray[locale] = vocabularyRaw.map(concept => ({
    ...concept,
    title: /** @type {string} */(concept.title[locale] || concept.title[defaultLocale]),
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
