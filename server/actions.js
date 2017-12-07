const express = require('express')
const auth = require('./auth')

const router = module.exports = express.Router()
// Get the list of actions : search in external apis and datasets
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
    Object.assign(query, ...[{
      name: 'type',
      field: 'actions.type'
    }, {
      name: 'input',
      field: 'actions.input.concept'
    }, {
      name: 'output',
      field: 'actions.output.concept'
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
    documents.forEach(r => r.actions.forEach(a => {
      a.api = r.id
    }))
    res.json({
      results: [].concat(...documents.map(d => d.actions)),
      count: count
    })
  } catch (err) {
    next(err)
  }
})
