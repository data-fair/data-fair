exports.description = 'Add owner to resources that lacked it until now'

exports.exec = async (db, debug) => {
  const appsKeysCursor = db.collection('applications-keys').find({ owner: { $exists: false } })
  for await (const appKey of appsKeysCursor) {
    debug('missing owner for application key', appKey)
    const app = await db.collection('applications').findOne({ id: appKey._id })
    await db.collection('applications-keys').updateOne({ _id: appKey._id }, { $set: { owner: app.owner } })
  }

  const journalsCursor = db.collection('journals').find({ owner: { $exists: false } })
  for await (const journal of journalsCursor) {
    debug('missing owner for journal', journal)
    if (journal.type === 'application') {
      const app = await db.collection('applications').findOne({ id: journal.id })
      await db.collection('journals').updateOne({ _id: journal._id }, { $set: { owner: app.owner } })
    }
    if (journal.type === 'dataset') {
      const dataset = await db.collection('datasets').findOne({ id: journal.id })
      await db.collection('journals').updateOne({ _id: journal._id }, { $set: { owner: dataset.owner } })
    }
  }
}
