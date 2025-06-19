import mongo from '#mongo'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import * as i18nUtils from '../../../i18n/utils.js'
import { Account } from '@data-fair/lib-express'

export const getPrivateOwnerVocabulary = async (owner: Account) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type: owner.type, id: owner.id }, { projection: { privateVocabulary: 1 } })
  return ((settings && settings.privateVocabulary) || []).map((pv: any) => {
    // we do this to maintain compatibility for pieces of code that expect identifiers to be defined
    pv.identifiers = pv.identifiers.filter((i: string) => !!i)
    const identifiers = pv.identifiers.length ? pv.identifiers : [pv.id]
    if (pv.description && typeof pv.description === 'string') {
      pv.description = sanitizeHtml(pv.description)
    }
    return { ...pv, identifiers }
  }) || []
}

export const getFullOwnerVocabulary = async (owner?: Account, locale: 'en' | 'fr' = 'fr') => {
  if (!owner) return i18nUtils.vocabularyArray[locale]

  const privateVocabulary = await getPrivateOwnerVocabulary(owner)

  return i18nUtils.vocabularyArray[locale].concat(privateVocabulary.map((pv: any) => {
    return { ...pv, private: true }
  }))
}
