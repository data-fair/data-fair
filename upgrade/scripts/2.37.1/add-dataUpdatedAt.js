exports.description = 'Dataset should have a dataUpdatedAt attribute.'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find({ dataUpdatedAt: { $exists: false } })
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    await db.collection('datasets').updateOne(
      { _id: dataset._id },
      { $set: { dataUpdatedAt: dataset.finalizedAt || dataset.dataUpdatedAt, dataUpdatedBy: dataset.updatedBy } })
  }
}
