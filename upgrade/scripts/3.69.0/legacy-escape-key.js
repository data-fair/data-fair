exports.description = 'the default algorithm for escaping keys is changed'

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ file: { $exists: true }, analysis: { $exists: false } }).project({ id: 1 })) {
    debug(`work on dataset ${dataset.id}`)
    await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { analysis: { escapeKeyAlgorithm: 'legacy' } } })
  }
}
