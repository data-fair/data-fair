exports.description = `Journal events are not restricted to datasets anymore. Add the type=dataset attribute to existing journals and webhooks.`

exports.exec = async (db, debug) => {
  // First journals
  await db.collection('journals').update({ type: { $exists: false } }, { $set: { type: 'dataset' } })

  // Then webhooks in settings
  const settingsCursor = db.collection('settings').find({})
  while (await settingsCursor.hasNext()) {
    const settings = await settingsCursor.next()
    const webhooks = settings.webhooks || []
    webhooks.forEach(webhook => {
      webhook.type = webhook.type || 'dataset'
    })
    await db.collection('settings').updateOne({ _id: settings._id }, { $set: { webhooks } })
  }
}
