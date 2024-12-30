
import i18n from 'i18n'
import slugify from 'slugify'
import createError from 'http-errors'

/**
 *
 * @param {string} locale
 * @param {string} value
 * @returns
 */
export const validateURLFriendly = (locale, value) => {
  if (!value) return
  const slug = slugify(value, { lower: true, strict: true })
  if (slug !== value) throw createError(400, i18n.__({ locale, phrase: 'errors.urlFriendly' }, { value, slug }))
}
