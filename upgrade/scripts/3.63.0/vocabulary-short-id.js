const i18nUtils = require('../../../server/utils/i18n')

exports.description = 'vocabulary concepts now have a short id'

exports.exec = async (db, debug) => {
  const ownerVocabularies = {}
  for await (const settings of db.collection('settings').find({ privateVocabulary: { $exists: 1 } }).project({ _id: 1, type: 1, id: 1, privateVocabulary: 1 })) {
    if (!settings.privateVocabulary.length) continue
    ownerVocabularies[`${settings.type}:${settings.id}`] = i18nUtils.vocabularyArray.fr.concat(settings.privateVocabulary.map(pv => {
      const id = `${settings.type.slice(0, 1)}_${settings.id}_${pv.id}`
      // apply a owner prefix to make the concept id unique
      pv.identifiers = pv.identifiers.filter(i => !!i)
      // we do this to maintain compatibility for pieces of code that expect identifiers to be defined
      const identifiers = pv.identifiers.length ? pv.identifiers : [id]
      return {
        ...pv,
        id,
        identifiers,
        private: true
      }
    }))
    debug('work on private vocabulary', settings)
    let changed = false
    for (const concept of settings.privateVocabulary) {
      if (concept.id) continue
      if (!concept.identifiers.length) continue
      concept.id = concept.identifiers[0].split('/').pop()
      changed = true
    }
    if (changed) {
      await db.collection('settings').updateOne({ _id: settings._id }, { $set: { privateVocabulary: settings.privateVocabulary } })
    }
  }

  for await (const dataset of db.collection('datasets').find({ schema: { $exists: 1 } }).project({ _id: 1, owner: 1, schema: 1 })) {
    const vocabulary = ownerVocabularies[`${dataset.owner.type}:${dataset.owner.id}`] || i18nUtils.vocabularyArray.fr
    let changed = false
    for (const field of dataset.schema) {
      if (field['x-refersTo'] && !field['x-concept']) {
        const concept = vocabulary.find(c => c.identifiers.includes(field['x-refersTo']))
        if (concept) {
          changed = true
          field['x-concept'] = {
            id: concept.id,
            title: concept.title
          }
        }
      }
    }
    if (changed) {
      await db.collection('datasets').updateOne({ _id: dataset._id }, { $set: { schema: dataset.schema } })
    }
  }
}
