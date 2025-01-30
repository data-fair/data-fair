import sanitizeHtml from '../../../../shared/sanitize-html.js'
import * as i18nUtils from '../../../i18n/utils.js'

export const getPrivateOwnerVocabulary = async (db, owner) => {
  const settings = await db.collection('settings')
    .findOne({ type: owner.type, id: owner.id }, { projection: { privateVocabulary: 1 } })
  return ((settings && settings.privateVocabulary) || []).map(pv => {
    // we do this to maintain compatibility for pieces of code that expect identifiers to be defined
    pv.identifiers = pv.identifiers.filter(i => !!i)
    const identifiers = pv.identifiers.length ? pv.identifiers : [pv.id]
    if (pv.description && typeof pv.description === 'string') {
      pv.description = sanitizeHtml(pv.description)
    }
    return { ...pv, identifiers }
  }) || []
}

/**
 *
 * @param {import('mongodb').Db} db
 * @param {any} owner
 * @param {'en' | 'fr'} locale
 * @returns
 */
export const getFullOwnerVocabulary = async (db, owner, locale) => {
  if (!owner) return i18nUtils.vocabularyArray[locale]

  const privateVocabulary = await getPrivateOwnerVocabulary(db, owner)

  return i18nUtils.vocabularyArray[locale].concat(privateVocabulary.map(pv => {
    return { ...pv, private: true }
  }))
}
