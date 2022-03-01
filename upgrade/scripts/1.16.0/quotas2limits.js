exports.description = 'Old quotas API is replaced with similar limits API.'

exports.exec = async (db, debug) => {
  const cursor = db.collection('quotas').find({})
  while (await cursor.hasNext()) {
    const quotas = await cursor.next()
    const limit = await db.collection('limits').findOne({ type: quotas.type, id: quotas.id })
    if (limit) return
    const newLimit = {
      type: quotas.type,
      id: quotas.id,
      name: quotas.name,
      store_bytes: {
        limit: quotas.storage,
        consumption: quotas.consumption && quotas.consumption.storage
      }
    }
    await db.collection('limits').insertOne(newLimit)
  }
}
