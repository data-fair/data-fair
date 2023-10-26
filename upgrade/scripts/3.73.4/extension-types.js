exports.description = 'adding default extension type to existing dataset extensions'

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ extensions: { $elemMatch: { $or: [{ type: { $exists: false } }, { type: 'remoteServiceConcept' }] } } }).project({ id: 1, title: 1, extensions: 1 })) {
    dataset.extensions.forEach(e => {
      if (e.type === 'remoteServiceConcept') delete e.type
      e.type = e.type || 'remoteService'
    })
    debug('work on dataset ', dataset.id, dataset.title)
    await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { extensions: dataset.extensions } })
  }
}
