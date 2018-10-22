const express = require('express')
const datasetUtils = require('../utils/dataset')
const asyncWrap = require('../utils/async-wrap')

const router = module.exports = express.Router()

router.get('', asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  const stats = { organizations: {} }
  if (!(req.user.isApiKey && req.user.organization)) {
    stats.user = await ownerStats(req.app.get('db'), { id: req.user.id, type: 'user' })
  }
  for (let orga of req.user.organizations) {
    stats.organizations[orga.id] = await ownerStats(req.app.get('db'), { id: orga.id, type: 'organization' })
  }
  res.send(stats)
}))

async function ownerStats(db, owner) {
  return {
    storage: await datasetUtils.storageSize(db, owner),
    datasets: await ownerCount(db, 'datasets', owner),
    applications: await ownerCount(db, 'applications', owner)
  }
}

async function ownerCount(db, collection, owner) {
  return db.collection(collection).countDocuments({ 'owner.id': owner.id, 'owner.type': owner.type })
}
