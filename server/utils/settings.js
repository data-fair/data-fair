const i18nUtils = require('./i18n')

exports.getPrivateOwnerVocabulary = async (db, owner) => {
  const settings = await db.collection('settings')
    .findOne({ type: owner.type, id: owner.id }, { projection: { privateVocabulary: 1 } })
  return (settings && settings.privateVocabulary).map(pv => {
    const id = `${owner.type.slice(0, 1)}_${owner.id}_${pv.id}`
    return {
      ...pv,
      id
    }
  }) || []
}

exports.getFullOwnerVocabulary = async (db, owner, locale) => {
  if (!owner) return i18nUtils.vocabularyArray[locale]

  const privateVocabulary = await exports.getPrivateOwnerVocabulary(db, owner)

  return i18nUtils.vocabularyArray[locale].concat(privateVocabulary.map(pv => {
    // apply a owner prefix to make the concept id unique
    pv.identifiers = pv.identifiers.filter(i => !!i)
    // we do this to maintain compatibility for pieces of code that expect identifiers to be defined
    const identifiers = pv.identifiers.length ? pv.identifiers : [pv.id]
    return {
      ...pv,
      identifiers,
      private: true
    }
  }))
}
