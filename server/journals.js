const express = require('express')
const moment = require('moment')
const auth = require('./auth')
const axios = require('axios')
const config = require('config')

const router = module.exports.router = express.Router()

module.exports.log = async function(db, dataset, event) {
  event.date = moment().toISOString()
  const settings = await db.collection('settings').findOne(dataset.owner) || {}
  settings.webhooks = settings.webhooks || []
  settings.webhooks.filter(webhook => webhook.events.indexOf(event.type) >= 0).forEach(webhook => {
    const text = 'Le jeux de données ' + (dataset.title || dataset.id) + (event.type === 'created' ? ' vient juste d\'être créé' : ' est maintenant indexé et consultable à l\'adresse : ' + config.publicUrl + '/dataset/' + dataset.id)
    axios.post(webhook.url, {
      text: text
    })
  })
  await db.collection('journals').update({
    id: dataset.id
  }, {
    $push: {
      events: event
    }
  }, {
    upsert: true
  })
}

router.get('/:datasetId', auth.jwtMiddleware, async(req, res, next) => {
  try {
    const journal = await req.app.get('db').collection('journals').findOne({
      id: req.params.datasetId
    })
    if (!journal) return res.sendStatus(404)
    journal.events.reverse()
    res.json(journal.events)
  } catch (err) {
    next(err)
  }
})
