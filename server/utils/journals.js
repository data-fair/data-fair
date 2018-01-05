const moment = require('moment')
const axios = require('axios')
const config = require('config')

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
  const settings = await db.collection('settings').findOne(dataset.owner) || {}
  settings.webhooks = settings.webhooks || []
  settings.webhooks.filter(webhook => webhook.events.indexOf(event.type) >= 0).forEach(webhook => {
    const text = 'Le jeux de données ' + (dataset.title || dataset.id) + (event.type === 'created' ? ' vient juste d\'être créé' : ' est maintenant indexé et consultable à l\'adresse : ' + config.publicUrl + '/dataset/' + dataset.id)
    axios.post(webhook.url, {
      text: text,
      href: config.publicUrl + '/api/v1/datasets/' + dataset.id
    })
  })
}
