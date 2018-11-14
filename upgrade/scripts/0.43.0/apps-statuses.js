exports.description = `Application configurations now have a status.`

exports.exec = async (db, debug) => {
  const appsCursor = db.collection('applications').find()
  while (await appsCursor.hasNext()) {
    const app = await appsCursor.next()
    if (!app.status) {
      await db.collection('applications').updateOne({ id: app.id }, { $set: { status: app.configuration ? 'configured' : 'created' } })
    }
  }
}
