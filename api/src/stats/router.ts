import express from 'express'
import * as cacheHeaders from '../misc/utils/cache-headers.js'
import * as limitsUtils from '../limits/service.ts'
import mongo from '#mongo'
import { type Account, reqSessionAuthenticated } from '@data-fair/lib-express'

const router = express.Router()

export default router

router.get('', cacheHeaders.noCache, async (req, res) => {
  const sessionState = reqSessionAuthenticated(req)
  res.send(await ownerStats(sessionState.account))
})

async function ownerStats (owner: Account) {
  const limits = await limitsUtils.getLimits(owner)
  return {
    limits,
    applications: await ownerCount('applications', owner)
  }
}

async function ownerCount (collection: string, owner: Account) {
  return mongo.db.collection(collection).countDocuments({ 'owner.id': owner.id, 'owner.type': owner.type })
}
