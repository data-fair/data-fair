const express = require('express')
const asyncWrap = require('../utils/async-handler')
const cacheHeaders = require('../utils/cache-headers')
const limitsUtils = require('../utils/limits')

const router = module.exports = express.Router()

router.get('', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  res.send(await ownerStats(req.app.get('db'), req.user.activeAccount))
}))

async function ownerStats (db, owner) {
  const limits = await limitsUtils.getLimits(db, owner)
  return {
    limits,
    applications: await ownerCount(db, 'applications', owner)
  }
}

async function ownerCount (db, collection, owner) {
  return db.collection(collection).countDocuments({ 'owner.id': owner.id, 'owner.type': owner.type })
}
