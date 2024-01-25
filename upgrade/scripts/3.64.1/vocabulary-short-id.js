const i18nUtils = require('../../../server/i18n/utils')

exports.description = 'missing primary in x-concept of datasets upgraded by previous scripts'

exports.exec = async (db, debug) => {
  const ownerVocabularies = {}
  for await (const dataset of db.collection('datasets').find({ schema: { $exists: 1 } }).project({ _id: 1, owner: 1, schema: 1 })) {
    const vocabulary = ownerVocabularies[`${dataset.owner.type}:${dataset.owner.id}`] || i18nUtils.vocabularyArray.fr
    let changed = false
    for (const field of dataset.schema) {
      if (field['x-refersTo'] && (!field['x-concept'] || !field['x-concept'].primary)) {
        const concept = vocabulary.find(c => c.identifiers.includes(field['x-refersTo']))
        if (concept) {
          changed = true
          field['x-concept'] = {
            id: concept.id,
            title: concept.title,
            primary: true
          }
        }
      }
    }
    if (changed) {
      await db.collection('datasets').updateOne({ _id: dataset._id }, { $set: { schema: dataset.schema } })
    }
  }
}
