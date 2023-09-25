exports.description = 'adding publication ids (same as ids for existing resources)'

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ slug: { $exists: false } }).project({ id: 1 })) {
    debug(`work on dataset ${dataset.id}`)
    await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { slug: dataset.id } })
  }
  for await (const application of db.collection('applications').find({ slug: { $exists: false } }).project({ id: 1 })) {
    debug(`work on application ${application.id}`)
    await db.collection('applications').updateOne({ id: application.id }, { $set: { slug: application.id } })
  }
}
