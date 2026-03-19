import express from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import { reqSession, assertAccountRole } from '@data-fair/lib-express'
import * as permissions from '../misc/utils/permissions.ts'
import { buildPostSearchPage, extractPortalId } from './operations.ts'

const router = express.Router()
export default router

router.use((req, res, next) => {
  if (req.mainPublicationSite) req.publicationSite = req.mainPublicationSite
  if (!req.publicationSite) {
    return next(httpError(400, 'search-pages API can only be used from a publication site, not the back-office'))
  }
  next()
})

router.use((req, res, next) => {
  const sessionState = reqSession(req)
  const owner = req.publicationSite.owner

  assertAccountRole(sessionState, owner, 'admin')
  next()
})

router.get('/', async (req, res) => {
  const siteFilter = `${req.publicationSite.type}:${req.publicationSite.id}`
  const portalId = extractPortalId(siteFilter)

  const searchPages = []

  const datasets = await mongo.datasets
    .find({
      publicationSites: siteFilter,
      $or: permissions.filter(reqSession(req), 'datasets')
    })
    .project({
      _id: 0,
      id: 1,
      owner: 1,
      permissions: 1,
      publicationSites: 1
    })
    .toArray()

  for (const dataset of datasets) {
    const sp = buildPostSearchPage(
      'datasets',
      {
        id: dataset.id,
        owner: dataset.owner,
        permissions: dataset.permissions
      },
      portalId,
      'toIndex'
    )
    searchPages.push(sp)
  }

  const applications = await mongo.applications
    .find({
      publicationSites: siteFilter,
      $or: permissions.filter(reqSession(req), 'applications')
    })
    .project({
      _id: 0,
      id: 1,
      owner: 1,
      permissions: 1,
      publicationSites: 1
    })
    .toArray()

  for (const application of applications) {
    const sp = buildPostSearchPage(
      'applications',
      {
        id: application.id,
        owner: application.owner,
        permissions: application.permissions
      },
      portalId,
      'toIndex'
    )
    searchPages.push(sp)
  }

  res.json(searchPages)
})
