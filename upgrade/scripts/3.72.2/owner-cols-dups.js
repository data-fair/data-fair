exports.description = 'remove columns "_owner" and "_ownerName" duplicates'

exports.exec = async (db, debug) => {
  // datasets without slug
  for await (const dataset of db.collection('datasets').find({ 'rest.lineOwnership': true }).project({ id: 1, schema: 1 })) {
    debug(`work on dataset ${dataset.id}`)
    const schema = dataset.schema.filter(p => p.key !== '_owner' && p.key !== '_ownerName')
    schema.push({
      key: '_owner',
      type: 'string',
      title: 'Propriétaire de la ligne',
      'x-capabilities': { insensitive: false, text: false, textStandard: false }
    })
    schema.push({
      key: '_ownerName',
      type: 'string',
      title: 'Nom du propriétaire de la ligne',
      'x-capabilities': { text: false }
    })
    await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { schema } })
  }
}
