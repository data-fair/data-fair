exports.description = 'Application error messages weren\'t propery cleaned before.'

exports.exec = async (db, debug) => {
  const appsCursor = db.collection('applications').find()
  while (await appsCursor.hasNext()) {
    const app = await appsCursor.next()
    if (app.status !== 'error' && !!app.errorMessage) {
      await db.collection('applications').updateOne({ id: app.id }, { $unset: { errorMessage: '' } })
    }
  }
}
