const createError = require('http-errors')
const i18n = require('i18n')

/**
 * create short ids for extensions that will be used as prefix of the properties ids in the schema
 * try to make something both readable and with little conflict risk (but not 0 risk)
 * @param {string} locale
 * @param {any[]} extensions
 * @param {any[]} oldExtensions
 */
exports.prepareExtensions = (locale, extensions, oldExtensions = []) => {
  for (const e of extensions) {
    if (e.type === 'remoteService' && !e.shortId && !e.propertyPrefix) {
      const oldExtension = oldExtensions.find((/** @type {any} */oldE) => oldE.remoteService === e.remoteService && oldE.action === e.action)
      if (oldExtension) {
        // do not reprocess already assigned shortIds / propertyPrefixes to prevent compatibility break
        if (oldExtension.shortId) e.shortId = oldExtension.shortId
        if (oldExtension.propertyPrefix) e.propertyPrefix = oldExtension.propertyPrefix
      } else {
        // only apply to new extensions to prevent compatibility break
        let propertyPrefix = e.action.toLowerCase()
        for (const term of ['masterdata', 'find', 'bulk', 'search']) {
          propertyPrefix = propertyPrefix.replace(term, '')
        }
        for (const char of [':', '-', '.', ' ']) {
          propertyPrefix = propertyPrefix.replace(char, '_')
        }
        if (propertyPrefix.startsWith('post')) propertyPrefix = propertyPrefix.replace('post', '')
        e.propertyPrefix = propertyPrefix.replace(/__/g, '_').replace(/^_/, '').replace(/_$/, '')
        e.propertyPrefix = '_' + e.propertyPrefix

        // TODO: also check if there is a conflict with an existing calculate property ?
      }
    }
  }
  const propertyPrefixes = extensions.filter(e => !!e.propertyPrefix).map(e => e.propertyPrefix)
  if (propertyPrefixes.length !== [...new Set(propertyPrefixes)].length) {
    throw createError(400, i18n.__({ locale, phrase: 'errors.extensionShortIdConflict' }))
  }
}
