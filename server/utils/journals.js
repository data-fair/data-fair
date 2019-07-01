const moment = require('moment')
const axios = require('axios')
const config = require('config')
const events = require('../../shared/events.json')

module.exports.log = async function(app, resource, event, type = 'dataset', noStoreEvent) {
  const db = app.get('db')
  event.date = moment().toISOString()

  if (!noStoreEvent) {
    await db.collection('journals')
      .updateOne({ id: resource.id, type }, { $push: { events: event } }, { upsert: true })
  }

  // websockets notifications
  await app.publish(`${type}s/${resource.id}/journal`, event)

  // webhooks notifications
  const settings = await db.collection('settings').findOne({ id: resource.owner.id, type: resource.owner.type }) || {}
  settings.webhooks = settings.webhooks || []
  settings.webhooks.forEach(webhook => {
    if (webhook.events && webhook.events.length && !webhook.events.includes(event.type)) return
    axios.post(webhook.url, {
      text: (resource.title || resource.id) + ' - ' + events[webhook.type][event.type].text + (event.href ? ' - ' + event.href : ''),
      href: `${config.publicUrl}/api/v1/${type}s/${resource.id}`,
      event: event.type
    })
  })
}
