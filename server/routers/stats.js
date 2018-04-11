const express = require('express')
const auth = require('./auth')
const datasetUtils = require('../utils/dataset')
const asyncWrap = require('../utils/async-wrap')

const router = module.exports = express.Router()

router.get('', auth.jwtMiddleware, asyncWrap(async(req, res) => {
  const stats = {
    user: {},
    organizations: {}
  }
  stats.user.storage = await datasetUtils.storageSize(req.app.get('db'), {id: req.user.id, type: 'user'})
  stats.user.datasets = await datasetUtils.ownerCount(req.app.get('db'), {id: req.user.id, type: 'user'})
  req.user.organizations.forEach(orga => {
    stats.organizations[orga.id] = {}
  })
  for (let owner of Object.keys(stats.organizations)) {
    stats.organizations[owner].storage = await datasetUtils.storageSize(req.app.get('db'), {id: owner, type: 'organization'})
    stats.organizations[owner].datasets = await datasetUtils.ownerCount(req.app.get('db'), {id: owner, type: 'organization'})
  }
  res.send(stats)
}))
