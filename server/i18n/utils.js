const config = /** @type {any} */(require('config'))
const i18n = require('i18n')

const defaultLocale = /** @type {'en' | 'fr'} */(config.i18n.defaultLocale)

i18n.configure({
  defaultLocale,
  directory: require('path').join(__dirname, './messages'),
  cookie: 'i18n_lang',
  objectNotation: true
})

exports.middleware = i18n.init

/** @typedef {{identifiers: string[], title: string, description: string, tag: string | undefined}} LocalizedConcept */

/** @type {{en: LocalizedConcept[], fr: LocalizedConcept[]}} */
exports.vocabularyArray = { en: [], fr: [] }

/** @type {{en: Record<string, LocalizedConcept>, fr: Record<string, LocalizedConcept>}} */
exports.vocabulary = { en: {}, fr: {} }

for (const _locale of i18n.getLocales()) {
  const locale = /** @type {'en' | 'fr'} */(_locale)
  exports.vocabularyArray[locale] = require('../../contract/vocabulary.json').map(concept => ({
    ...concept,
    title: /** @type {string} */(concept.title[locale] || concept.title[defaultLocale]),
    description: concept.description[locale] || concept.description[defaultLocale],
    tag: concept.tag[locale] || concept.tag[defaultLocale]
  }))
  exports.vocabulary[locale] = {}
  for (const concept of exports.vocabularyArray[locale]) {
    for (const id of concept.identifiers) {
      exports.vocabulary[locale][id] = concept
    }
  }
}
