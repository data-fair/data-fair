const sanitizeHtml = require('../../../shared/sanitize-html')
const i18nUtils = require('./i18n')

exports.getPrivateOwnerVocabulary = async (db, owner) => {
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

exports.getFullOwnerVocabulary = async (db, owner, locale) => {
  if (!owner) return i18nUtils.vocabularyArray[locale]

  const privateVocabulary = await exports.getPrivateOwnerVocabulary(db, owner)

  return i18nUtils.vocabularyArray[locale].concat(privateVocabulary.map(pv => {
    return { ...pv, private: true }
  }))
}
