import express from 'express'
import * as cacheHeaders from '../misc/utils/cache-headers.ts'
import * as limitsUtils from '../limits/service.ts'
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
    // kept for the API consumers, getLimits already counts the applications
    applications: limits.nb_applications!.consumption
  }
}
