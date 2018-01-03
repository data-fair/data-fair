const express = require('express')
const ajv = require('ajv')()
const settingSchema = require('../contract/settings.json')
const validate = ajv.compile(settingSchema)
const auth = require('./auth')
const permissions = require('./utils/permissions')

let router = express.Router()

const allowedTypes = new Set(['user', 'organization'])

// Middlewares
router.use('/:type/:id', auth.jwtMiddleware, async function(req, res, next) {
  if (!allowedTypes.has(req.params.type)) {
    return res.status(400).send('Invalid type, it must be one of the following : ' + Array.from(allowedTypes).join(', '))
  }
  if (!permissions.isOwner({
    type: req.params.type,
    id: req.params.id
  }, req.user)) {
    return res.sendStatus(403)
  }
  next()
})

// read settings
router.get('/:type/:id', auth.jwtMiddleware, async (req, res, next) => {
  const settings = req.app.get('db').collection('settings')
  try {
    const result = await settings.findOne({
      type: req.params.type,
      id: req.params.id
    }, {
      fields: {
        _id: 0,
        id: 0,
        type: 0
      }
    })
    res.status(200).send(result || {})
  } catch (err) {
    next(err)
  }
})

// update settings
router.put('/:type/:id', auth.jwtMiddleware, async (req, res, next) => {
  req.body.type = req.params.type
  req.body.id = req.params.id
  const valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)
  const settings = req.app.get('db').collection('settings')
  try {
    await settings.updateOne({
      type: req.params.type,
      id: req.params.id
    }, req.body, {
      upsert: true
    })
    delete req.body.type
    delete req.body.id
    res.status(200).send(req.body)
  } catch (err) {
    next(err)
  }
})

module.exports = router
