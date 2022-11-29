exports.description = 'small changes in dataset attachments contract'

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ attachments: { $elemMatch: { type: { $exists: false } } } })) {
    debug(`${dataset.id}`)
    dataset.attachments.forEach(a => {
      a.type = a.type || 'file'
      if (!a.title && a.name) a.title = a.name
    })
    await db.collection('datasets').updateOne(
      { id: dataset.id },
      { $set: { attachments: dataset.attachments } }
    )
  }
}
