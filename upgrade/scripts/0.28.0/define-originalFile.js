exports.description = 'Dataset should have a originalFile property defined by the converter worker on new datasets.'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    if (dataset.file && !dataset.originalFile) {
      await db.collection('datasets').updateOne({ _id: dataset._id }, { $set: { originalFile: dataset.file } })
    }
  }
}
