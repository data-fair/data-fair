const moment = require('moment')
const webhooks = require('./webhooks')

module.exports.log = async function(app, resource, event, type = 'dataset', noStoreEvent) {
  const db = app.get('db')
  event.date = moment().toISOString()

  if (!noStoreEvent) {
    await db.collection('journals')
      .updateOne({ id: resource.id, type }, { $push: { events: event } }, { upsert: true })
  }

  // websockets notifications
  await app.publish(`${type}s/${resource.id}/journal`, event)

  webhooks.trigger(db, type, resource, event)
}
