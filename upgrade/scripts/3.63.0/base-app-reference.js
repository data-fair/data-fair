
exports.description = 'applications contain a reference to their base application with some useful info'

exports.exec = async (db, debug) => {
  for await (const baseApp of db.collection('base-applications').find({})) {
    const baseAppReference = { id: baseApp.id, url: baseApp.url, meta: baseApp.meta }
    await db.collection('applications').updateMany({ url: baseApp.url }, { $set: { baseApp: baseAppReference } })
    await db.collection('applications').updateMany({ urlDraft: baseApp.url }, { $set: { baseAppDraft: baseAppReference } })
  }
}
