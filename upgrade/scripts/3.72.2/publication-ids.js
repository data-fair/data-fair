exports.description = 'adding publication ids (same as ids for existing resources)'

exports.exec = async (db, debug) => {
  try {
    await db.collection('datasets').dropIndex('slug')
  } catch (err) {}
  try {
    await db.collection('applications').dropIndex('slug')
  } catch (err) {}

  for await (const dataset of db.collection('datasets').find({ _uniqueRefs: { $exists: false } }).project({ owner: 1, id: 1, slug: 1 })) {
    debug(`work on dataset ${dataset.id}`)
    const slug = dataset.slug || dataset.id
    const _uniqueRefs = [dataset.id]
    if (slug !== dataset.id) _uniqueRefs.push(slug)
    await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { slug, _uniqueRefs } })
  }
  for await (const application of db.collection('applications').find({ _uniqueRefs: { $exists: false } }).project({ owner: 1, id: 1, slug: 1 })) {
    debug(`work on application ${application.id}`)
    const slug = application.slug || application.id
    const _uniqueRefs = [application.id]
    if (slug !== application.id) _uniqueRefs.push(slug)
    await db.collection('applications').updateOne({ id: application.id }, { $set: { slug, _uniqueRefs } })
  }
}
