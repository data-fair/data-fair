exports.description = 'adding default extension type to existing dataset extensions'

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ extensions: { $elemMatch: { type: { $exists: false } } } }).project({ id: 1, extensions: 1 })) {
    dataset.extensions.forEach(e => {
      e.type = e.type || 'remoteService'
    })
    await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { extensions: dataset.extensions } })
  }
}
