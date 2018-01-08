const express = require('express')
const auth = require('./auth')
const normalise = require('ajv-error-messages')
const moment = require('moment')
const shortid = require('shortid')
const soasLoader = require('soas')
const axios = require('axios')
const requestProxy = require('express-request-proxy')
const remoteServiceAPIDocs = require('../contract/remote-service-api-docs')

const ajv = require('ajv')()
const remoteServiceSchema = require('../contract/remote-service.js')
const validateRemoteService = ajv.compile(remoteServiceSchema)
const remoteServiceSchemaNoRequired = Object.assign(remoteServiceSchema)
delete remoteServiceSchemaNoRequired.required
const validateRemoteServiceNoRequired = ajv.compile(remoteServiceSchemaNoRequired)

const openApiSchema = require('../contract/openapi-3.0.json')
openApiSchema.$id = openApiSchema.$id + '-2' // dirty hack to handle ajv error
const validateOpenApi = ajv.compile(openApiSchema)

const permissions = require('./utils/permissions')
const usersUtils = require('./utils/users')
const findUtils = require('./utils/find')

const router = module.exports = express.Router()

// TODO: explain ? simplify ? hard to understand piece of code
const computeActions = (apiDoc) => {
  const actions = soasLoader(apiDoc).actions()
  actions.forEach(a => {
    a.input = Object.keys(a.input).map(concept => Object.assign({
      concept: concept
    }, a.input[concept]))
    a.output = Object.keys(a.output).map(concept => Object.assign({
      concept: concept
    }, a.output[concept]))
  })
  return actions
}

// Get the list of remote-services
router.get('', auth.optionalJwtMiddleware, async function(req, res, next) {
  const remoteServices = req.app.get('db').collection('remote-services')
  const query = findUtils.query(req.query, {
    'input-concepts': 'actions.input.concept',
    'output-concepts': 'actions.output.concept',
    'api-id': 'apiDoc.info.x-api-id'
  })
  const sort = findUtils.sort(req.query.sort)
  const [skip, size] = findUtils.pagination(req.query)
  query.$or = permissions.filter(req.user)
  let mongoQueries = [
    size > 0 ? remoteServices.find(query).limit(size).skip(skip).sort(sort).project({_id: 0, permissions: 0}).toArray() : Promise.resolve([]),
    remoteServices.find(query).count()
  ]
  try {
    const [results, count] = await Promise.all(mongoQueries)
    res.json({results, count})
  } catch (err) {
    next(err)
  }
})

// Create an remote Api
router.post('', auth.jwtMiddleware, async(req, res, next) => {
  // This id is temporary, we should have an human understandable id, or perhaps manage it UI side ?
  req.body.id = req.body.id || shortid.generate()
  req.body.owner = usersUtils.owner(req)
  if (!permissions.canDoForOwner(req.body.owner, 'postRemoteService', req.user, req.app.get('db'))) return res.sendStatus(403)
  var valid = validateRemoteService(req.body)
  if (!valid) return res.status(400).send(normalise(validateRemoteService.errors))
  const date = moment().toISOString()
  req.body.createdAt = date
  req.body.createdBy = req.user.id
  req.body.updatedAt = date
  req.body.updatedBy = req.user.id
  if (req.body.apiDoc) {
    if (req.body.apiDoc.info) {
      req.body.title = req.body.apiDoc.info.title
      req.body.description = req.body.apiDoc.info.description
    }
    req.body.actions = computeActions(req.body.apiDoc)
  }
  try {
    await req.app.get('db').collection('remote-services').insertOne(req.body)
    res.status(201).json(req.body)
  } catch (err) {
    return next(err)
  }
})

// Middlewares
router.use('/:remoteServiceId', auth.optionalJwtMiddleware, async function(req, res, next) {
  try {
    req.remoteService = await req.app.get('db').collection('remote-services').findOne({
      id: req.params.remoteServiceId
    }, {
      fields: {
        _id: 0
      }
    })
    if (!req.remoteService) return res.status(404).send('Remote Api not found')
    next()
  } catch (err) {
    next(err)
  }
})

router.use('/:remoteServiceId/permissions', permissions.router('remote-services', 'remoteService'))

// retrieve a remoteService by its id
router.get('/:remoteServiceId', (req, res, next) => {
  if (!permissions.can(req.remoteService, 'readDescription', req.user)) return res.sendStatus(403)
  delete req.remoteService.permissions
  res.status(200).send(req.remoteService)
})

// Update a remote service configuration
router.patch('/:remoteServiceId', async (req, res, next) => {
  try {
    if (!permissions.can(req.remoteService, 'writeDescription', req.user)) return res.sendStatus(403)
    var valid = validateRemoteServiceNoRequired(req.body)
    if (!valid) return res.status(400).send(validateRemoteServiceNoRequired.errors)

    const forbiddenKey = Object.keys(req.body).find(key => {
      return ['apiDoc', 'url', 'apiKey', 'server', 'description', 'title'].indexOf(key) === -1
    })
    if (forbiddenKey) return res.status(400).send('Only some parts of the remote service configuration can be modified through this route')

    req.body.updatedAt = moment().toISOString()
    req.body.updatedBy = req.user.id
    if (req.body.apiDoc) {
      req.body.actions = computeActions(req.body.apiDoc)
    }

    await req.app.get('db').collection('remote-services').updateOne({id: req.params.remoteServiceId}, {'$set': req.body})
    res.status(200).json(req.body)
  } catch (err) {
    return next(err)
  }
})

// Delete a remoteService
router.delete('/:remoteServiceId', async(req, res, next) => {
  if (!permissions.can(req.remoteService, 'delete', req.user)) return res.sendStatus(403)
  try {
    // TODO : Remove indexes
    await req.app.get('db').collection('remote-services').deleteOne({
      id: req.params.remoteServiceId
    })
    res.sendStatus(204)
  } catch (err) {
    return next(err)
  }
})

router.post('/:remoteServiceId/_update', async(req, res, next) => {
  if (!permissions.can(req.remoteService, 'writeDescription', req.user)) return res.sendStatus(403)
  if (req.remoteService.url) {
    try {
      const reponse = await axios.get(req.remoteService.url)
      var valid = validateOpenApi(reponse.data)
      if (!valid) return res.status(400).send(normalise(validateOpenApi.errors))
      req.remoteService.updatedAt = moment().toISOString()
      req.remoteService.updatedBy = req.user.id
      req.remoteService.apiDoc = reponse.data
      req.remoteService.actions = computeActions(req.remoteService.apiDoc)
      await req.app.get('db').collection('remote-services').updateOne({
        id: req.params.remoteServiceId
      }, req.remoteService)
      res.status(200).json(req.remoteService)
    } catch (err) {
      return next(err)
    }
  } else {
    res.sendStatus(204)
  }
})

router.use('/:remoteServiceId/proxy*', function(req, res, next) {
  const options = {
    url: req.remoteService.server + '*'
  }
  // TODO handle query & cookie header types
  if (req.remoteService.apiKey.in === 'header') {
    options.headers = {
      [req.remoteService.apiKey.name]: req.remoteService.apiKey.value
    }
  }
  requestProxy(options)(req, res, next)
})

router.post('/:remoteServiceId/actions/:actionId', async(req, res, next) => {
  console.log(req.params.actionId, req.body)
  // const soas = soasLoader(req.remoteService.apiDoc)
  // prepare input by reading req.body.inputConcept and prepare a stream of objects with these keys
  // for each object, generate an id or get the one generated by es ?
  // const output = await soas.execute(req.params.actionId, input)
  // output is a stream of json objects with an id and additionnal data
  res.sendStatus(201)
})

router.get('/:remoteServiceId/api-docs.json', (req, res) => {
  res.send(remoteServiceAPIDocs(req.remoteService))
})
