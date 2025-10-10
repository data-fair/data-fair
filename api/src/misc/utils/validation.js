import i18n from 'i18n'
import slugify from 'slugify'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import compatOdsEscapeKey from '../../api-compat/ods/escape-key.ts'

/**
 *
 * @param {string} locale
 * @param {string | null | undefined} value
 * @param {string | null | undefined} algorithm
 * @returns
 */
export const validateURLFriendly = (locale, value, algorithm) => {
  if (!value) return
  let slug
  if (algorithm === 'compat-ods') slug = compatOdsEscapeKey(value)
  else slug = slugify(value, { lower: true, strict: true })
  if (slug !== value) throw httpError(400, i18n.__({ locale, phrase: 'errors.urlFriendly' }, { value, slug }))
}
