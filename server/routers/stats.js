const express = require('express')
const config = require('config')
const datasetUtils = require('../utils/dataset')
const asyncWrap = require('../utils/async-wrap')
const cacheHeaders = require('../utils/cache-headers')

const router = module.exports = express.Router()

router.get('', cacheHeaders.noCache, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  res.send(await ownerStats(req.app.get('db'), req.user.activeAccount))
}))

async function ownerStats(db, owner) {
  const limits = await db.collection('limits')
    .findOne({ type: owner.type, id: owner.id })
  return {
    storage: await datasetUtils.totalStorage(db, owner),
    storageLimit: limits && limits.store_bytes && (limits.store_bytes.limit !== undefined) ? limits.store_bytes.limit : config.defaultLimits.totalStorage,
    datasets: await ownerCount(db, 'datasets', owner),
    applications: await ownerCount(db, 'applications', owner),
  }
}

async function ownerCount(db, collection, owner) {
  return db.collection(collection).countDocuments({ 'owner.id': owner.id, 'owner.type': owner.type })
}
