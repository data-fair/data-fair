exports.description = 'Remote services now have public and privateAccess attributes, same as base-applications.'

exports.exec = async (db, debug) => {
  const servicesCursor = db.collection('remote-services').find({ public: { $exists: false }, owner: { $exists: false } })
  while (await servicesCursor.hasNext()) {
    const remoteService = await servicesCursor.next()
    await db.collection('remote-services').updateOne({ _id: remoteService._id }, { $set: { public: true } })
  }
}
