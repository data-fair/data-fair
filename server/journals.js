const express = require('express')
const moment = require('moment')
const auth = require('./auth')

const router = module.exports.router = express.Router()

module.exports.log = async function(db, dataset, event) {
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
