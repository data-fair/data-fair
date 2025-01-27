import config from '#config'
import i18n from 'i18n'
import { join } from 'path'
import vocabularyRaw from '../../contract/vocabulary.json' with {type: 'json'}

const defaultLocale = /** @type {'en' | 'fr'} */(config.i18n.defaultLocale)

i18n.configure({
  defaultLocale,
  directory: join(import.meta.dirname, './messages'),
  cookie: 'i18n_lang',
  objectNotation: true
})

export const middleware = i18n.init

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
