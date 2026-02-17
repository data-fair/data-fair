import mongo from '#mongo'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import * as i18nUtils from '../../../i18n/utils.ts'
import { type Account } from '@data-fair/lib-express'
import memoize from 'memoizee'

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

export const getFullOwnerVocabulary = async (owner?: Account, locale: i18nUtils.Locale = 'fr') => {
  if (!owner) return i18nUtils.vocabularyArray[locale]

  const privateVocabulary = await getPrivateOwnerVocabulary(owner)

  return i18nUtils.vocabularyArray[locale].concat(privateVocabulary.map((pv: any) => {
    return { ...pv, private: true }
  }))
}

const getPublicationSiteSettings = async (publicationSiteUrl: string, publicationSiteQuery: string) => {
  const elemMatch = publicationSiteQuery
    ? { type: publicationSiteQuery.split(':')[0], id: publicationSiteQuery.split(':')[1] }
    : { $or: [{ url: publicationSiteUrl }, { draftUrl: publicationSiteUrl }] }
  return mongo.settings.findOne({ publicationSites: { $elemMatch: elemMatch } }, {
    projection: {
      type: 1,
      id: 1,
      department: 1,
      name: 1,
      publicationSites: { $elemMatch: elemMatch }
    }
  })
}
export const memoizedGetPublicationSiteSettings = memoize(getPublicationSiteSettings, {
  profileName: 'getPublicationSiteSettings',
  promise: true,
  primitive: true,
  max: 10000,
  maxAge: 1000 * 60, // 1 minute
  length: 2 // only use publicationSite, not db as cache key
})
