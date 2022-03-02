exports.description = 'Delete all duplicated journals'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find()
  for await (const dataset of cursor) {
    const journals = await db.collection('journals').find({ type: 'dataset', id: dataset.id, 'owner.type': dataset.owner.type, 'owner.id': dataset.owner.id }).toArray()
    for (const journal of journals.slice(1)) {
      debug('remove duplicate journal', journal)
      await db.collection('journals').deleteOne({ _id: journal._id })
    }
  }
}
