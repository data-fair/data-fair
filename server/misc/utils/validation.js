const i18n = require('i18n')
const slugify = require('slugify')
const createError = require('http-errors')

/**
 *
 * @param {string} locale
 * @param {string} value
 * @returns
 */
exports.validateURLFriendly = (locale, value) => {
  if (!value) return
  const slug = slugify(value, { lower: true, strict: true })
  if (slug !== value) throw createError(400, i18n.__({ locale, phrase: 'errors.urlFriendly' }, { value, slug }))
}
