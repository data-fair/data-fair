const express = require('express')
const auth = require('./auth')
const ajv = require('ajv')()

const externalApiSchema = require('../contract/external-api.js')
const validateExternalApi = ajv.compile(externalApiSchema)
const openApiSchema = require('../contract/openapi-3.0.json')
openApiSchema.$id = openApiSchema.$id + '-2' // dirty hack to handle ajv error
const validateOpenApi = ajv.compile(openApiSchema)
const normalise = require('ajv-error-messages')

const permissions = require('./utils/permissions')
const moment = require('moment')
const shortid = require('shortid')
const soasLoader = require('soas')
const axios = require('axios')
const requestProxy = require('express-request-proxy')

const router = module.exports = express.Router()

const computeActions = (apiDoc) => {
  const actions = soasLoader(apiDoc).actions()
  actions.forEach(a => {
    a.input = Object.keys(a.input).map(concept => Object.assign({
      concept: concept
    }, a.input[concept][0]))
    a.output = Object.keys(a.output).map(concept => Object.assign({
      concept: concept
    }, a.output[concept][0]))
  })
  return actions
}

// Get the list of external-apis
router.get('', auth.optionalJwtMiddleware, async function(req, res, next) {
  const externalApis = req.app.get('db').collection('external-apis')
  let query = {}
  let sort = {}
  let size = 10
  let skip = 0
  if (req.query) {
    if (req.query.size && !isNaN(parseInt(req.query.size))) {
      size = parseInt(req.query.size)
    }
    if (req.query.skip && !isNaN(parseInt(req.query.skip))) {
      skip = parseInt(req.query.skip)
    }
    if (req.query.q) {
      query.$text = {
        $search: req.query.q
      }
    }
    Object.assign(query, ...[{
      name: 'owner-type',
      field: 'owner.type'
    }, {
      name: 'owner-id',
      field: 'owner.id'
    }, {
      name: 'input-concepts',
      field: 'actions.input.concept'
    }, {
      name: 'output-concepts',
      field: 'actions.output.concept'
    }, {
      name: 'api-id',
      field: 'apiDoc.info.x-api-id'
    }].filter(p => req.query[p.name] !== undefined).map(p => ({
      [p.field]: {
        $in: req.query[p.name].split(',')
      }
    })))
  }
  if (req.query.sort) {
    Object.assign(sort, ...req.query.sort.split(',').map(s => {
      let toks = s.split(':')
      return {
        [toks[0]]: Number(toks[1])
      }
    }))
  }
  // TODO : handle permissions and set the correct filter on the list
  if (req.user) {
    query.$or = []
    query.$or.push({
      'owner.type': 'user',
      'owner.id': req.user.id
    })
    query.$or.push({
      'owner.type': 'organization',
      'owner.id': {
        $in: req.user.organizations.map(o => o.id)
      }
    })
  }
  let mongoQueries = [
    size > 0 ? externalApis.find(query).limit(size).skip(skip).sort(sort).project({
      _id: 0,
      source: 0
    }).toArray() : Promise.resolve([]),
    externalApis.find(query).count()
  ]
  try {
    let [documents, count] = await Promise.all(mongoQueries)
    res.json({
      results: documents,
      count: count
    })
  } catch (err) {
    next(err)
  }
})

// Create an external Api
router.post('', auth.jwtMiddleware, async(req, res, next) => {
  // This id is temporary, we should have an human understandable id, or perhaps manage it UI side ?
  req.body.id = req.body.id || shortid.generate()
  var valid = validateExternalApi(req.body)
  if (!valid) return res.status(400).send(normalise(validateExternalApi.errors))
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
    await req.app.get('db').collection('external-apis').insertOne(req.body)
    res.status(201).json(req.body)
  } catch (err) {
    return next(err)
  }
})

// Middlewares
router.use('/:externalApiId', auth.optionalJwtMiddleware, async function(req, res, next) {
  try {
    req.externalApi = await req.app.get('db').collection('external-apis').findOne({
      id: req.params.externalApiId
    }, {
      fields: {
        _id: 0
      }
    })
    if (!req.externalApi) return res.status(404).send('External Api not found')
    next()
  } catch (err) {
    next(err)
  }
})

// retrieve a externalApi by its id
router.get('/:externalApiId', (req, res, next) => {
  if (!permissions(req.externalApi, 'readDescription', req.user)) return res.sendStatus(403)
  res.status(200).send(req.externalApi)
})

// update a externalApi
router.put('/:externalApiId', async(req, res, next) => {
  if (!permissions(req.externalApi, 'writeDescription', req.user)) return res.sendStatus(403)
  var valid = validateExternalApi(req.body)
  if (!valid) return res.status(400).send(normalise(validateExternalApi.errors))
  req.body.updatedAt = moment().toISOString()
  req.body.updatedBy = req.user.id
  req.body.id = req.params.externalApiId
  if (req.body.apiDoc) {
    req.body.actions = computeActions(req.body.apiDoc)
  }
  try {
    await req.app.get('db').collection('external-apis').updateOne({
      id: req.params.externalApiId
    }, req.body)
    res.status(200).json(req.body)
  } catch (err) {
    return next(err)
  }
})

// Delete a externalApi
router.delete('/:externalApiId', async(req, res, next) => {
  if (!permissions(req.externalApi, 'delete', req.user)) return res.sendStatus(403)
  try {
    // TODO : Remove indexes
    await req.app.get('db').collection('external-apis').deleteOne({
      id: req.params.externalApiId
    })
    res.sendStatus(204)
  } catch (err) {
    return next(err)
  }
})

router.post('/:externalApiId/_update', async(req, res, next) => {
  if (!permissions(req.externalApi, 'writeDescription', req.user)) return res.sendStatus(403)
  if (req.externalApi.url) {
    try {
      const reponse = await axios.get(req.externalApi.url)
      var valid = validateOpenApi(reponse.data)
      if (!valid) return res.status(400).send(normalise(validateOpenApi.errors))
      req.externalApi.updatedAt = moment().toISOString()
      req.externalApi.updatedBy = req.user.id
      req.externalApi.apiDoc = reponse.data
      req.externalApi.actions = computeActions(req.externalApi.apiDoc)
      await req.app.get('db').collection('external-apis').updateOne({
        id: req.params.externalApiId
      }, req.externalApi)
      res.status(200).json(req.externalApi)
    } catch (err) {
      return next(err)
    }
  } else {
    res.sendStatus(204)
  }
})

router.use('/:externalApiId/proxy*', function(req, res, next) {
  // TODO add API key
  const options = {
    url: req.externalApi.server + '*'
  }
  requestProxy(options)(req, res, next)
})

router.post('/:externalApiId/actions/:actionId', async(req, res, next) => {
  console.log(req.params.actionId, req.body)
  const soas = soasLoader(req.externalApi.apiDoc)
  // prepare input by reading req.body.inputConcept and prepare a stream of objects with these keys
  // for each object, generate an id or get the one generated by es ?
  // const output = await soas.execute(req.params.actionId, input)
  // output is a stream of json objects with an id and additionnal data
  res.sendStatus(201)
})
