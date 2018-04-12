const moment = require('moment')
const axios = require('axios')
const config = require('config')
const events = require('../../shared/events.json')

module.exports.log = async function(app, dataset, event) {
  const db = app.get('db')
  event.date = moment().toISOString()

  await db.collection('journals').update({
    id: dataset.id
  }, {
    $push: {
      events: event
    }
  }, {
    upsert: true
  })

  // websockets notifications
  await app.publish('datasets/' + dataset.id + '/journal', event)

  // webhooks notifications
  const settings = await db.collection('settings').findOne({id: dataset.owner.id, type: dataset.owner.type}) || {}
  settings.webhooks = settings.webhooks || []
  settings.webhooks.forEach(webhook => {
    if (webhook.events && webhook.events.length && !webhook.events.includes(event.type)) return
    axios.post(webhook.url, {
      text: (dataset.title || dataset.id) + ' - ' + events[event.type].text + (event.href ? ' - ' + event.href : ''),
      href: config.publicUrl + '/api/v1/datasets/' + dataset.id,
      event: event.type
    })
  })
}
