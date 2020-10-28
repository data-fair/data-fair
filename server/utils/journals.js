const moment = require('moment')
const webhooks = require('./webhooks')

module.exports.log = async function(app, resource, event, type = 'dataset', noStoreEvent) {
  try {
    const db = app.get('db')
    event.date = moment().toISOString()

    if (!noStoreEvent) {
      await db.collection('journals')
        .updateOne({ id: resource.id, type, owner: resource.owner }, { $push: { events: event } }, { upsert: true })
    }

    // websockets notifications
    await app.publish(`${type}s/${resource.id}/journal`, event)

    webhooks.trigger(db, type, resource, event)
  } catch (err) {
    // errors when writing to journal are never blocking for the actual task
    console.warn('Failure when writing event to journal')
  }
}
