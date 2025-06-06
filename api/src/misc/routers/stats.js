import express from 'express'
import * as cacheHeaders from '../utils/cache-headers.js'
import * as limitsUtils from '../utils/limits.ts'
import mongo from '#mongo'

const router = express.Router()

export default router

router.get('', cacheHeaders.noCache, async (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  res.send(await ownerStats(mongo.db, req.user.activeAccount))
})

async function ownerStats (db, owner) {
  const limits = await limitsUtils.getLimits(owner)
  return {
    limits,
    applications: await ownerCount(db, 'applications', owner)
  }
}

async function ownerCount (db, collection, owner) {
  return db.collection(collection).countDocuments({ 'owner.id': owner.id, 'owner.type': owner.type })
}
