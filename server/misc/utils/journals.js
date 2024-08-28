const moment = require('moment')
const webhooks = require('./webhooks')

module.exports.log = async function (app, resource, event, type = 'dataset', noStoreEvent = false) {
  try {
    const db = app.get('db')
    event.date = moment().toISOString()
    if (resource.draftReason) event.draft = true

    if (!noStoreEvent) {
      await db.collection('journals')
        .updateOne(
          { id: resource.id, type, 'owner.type': resource.owner.type, 'owner.id': resource.owner.id },
          { $push: { events: event } },
          { upsert: true }
        )
    }

    // websockets notifications
    await app.publish(`${type}s/${resource.id}/journal`, { ...event, store: !noStoreEvent })

    webhooks.trigger(db, type, resource, event)
  } catch (err) {
    // errors when writing to journal are never blocking for the actual task
    console.warn('Failure when writing event to journal')
  }
}

module.exports.hasErrorRetry = async function (db, resource, type = 'dataset') {
  const journal = await db.collection('journals')
    .findOne(
      { id: resource.id, type, 'owner.type': resource.owner.type, 'owner.id': resource.owner.id },
      { projection: { events: 1 } }
    )

  if (!journal || !journal.events) return false

  // check that we have error-retry message and that no task was succesfully finished since then
  let hasErrorRetry = false
  for (const event of journal.events) {
    if (event.type.endsWith('-end')) hasErrorRetry = false
    if (event.type === 'error-retry') hasErrorRetry = true
  }
  return hasErrorRetry
}
