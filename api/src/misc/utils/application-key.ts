// a midleware to check if the endpoint is called from an application with an unauthenticated readOnly application key
import requestIp from 'request-ip'
import config from '#config'
import mongo from '#mongo'
import * as rateLimiting from './rate-limiting.ts'
import { type Request, type Response, type NextFunction } from 'express'
import { type ApplicationKey, type RequestWithResource } from '#types'
import { reqUser, setReqUser } from '@data-fair/lib-express/session.js'

const matchingHost = (req: Request) => {
  if (!req.headers.origin) return true
  if ((req as Request & { publicBaseUrl: string }).publicBaseUrl.startsWith(req.headers.origin)) return true
  return false
}

export default async (req: RequestWithResource, res: Response, next: NextFunction) => {
  const referer = (req.headers.referer || req.headers.referrer) as string | undefined
  if (!referer) return next()
  let refererUrl
  try {
    refererUrl = new URL(referer)
  } catch (err) {
    // invalid URL in referer header, it happens
  }
  if (!refererUrl) return next()

  const dataset = req.resource

  const ownerFilter = {
    'owner.type': dataset.owner.type,
    'owner.id': dataset.owner.id,
    'owner.department': dataset.owner.department ? dataset.owner.department : { $exists: false }
  }
  const datasetHref = `${config.publicUrl}/api/v1/datasets/${dataset.id}`
  let appId: string | undefined
  let applicationKey: ApplicationKey | null = null

  if (refererUrl.pathname.startsWith('/data-fair/embed/dataset/')) {
    let refererDatasetId = decodeURIComponent(refererUrl.pathname.replace('/data-fair/embed/dataset/', '').split('/')[0])
    let applicationKeyId = refererUrl.searchParams && refererUrl.searchParams.get('key')
    if (refererDatasetId !== dataset.id) {
      const keys = refererDatasetId.split(':')
      if (keys.length > 1) {
        applicationKeyId = keys[0]
        refererDatasetId = refererDatasetId.replace(keys[0] + ':', '')
      }
    }
    if (!applicationKeyId) return next()
    applicationKey = await mongo.applicationsKeys.findOne({ 'keys.id': applicationKeyId, ...ownerFilter })
    if (!applicationKey) return next()
    appId = applicationKey._id
    const isParentApplicationKey = await mongo.db.collection('applications')
      .count({
        id: applicationKey._id,
        $or: [{ 'configuration.datasets.href': datasetHref }, { 'configuration.datasets.id': dataset.id }],
        ...ownerFilter
      })
    if (!isParentApplicationKey) return next()
  }

  if (refererUrl.pathname.startsWith('/data-fair/app/')) {
    appId = decodeURIComponent(refererUrl.pathname.replace('/data-fair/app/', '').split('/')[0])
    let applicationKeyId = refererUrl.searchParams && refererUrl.searchParams.get('key')
    if (!applicationKeyId) {
      const keys = appId.split(':')
      if (keys.length > 1) {
        applicationKeyId = keys[0]
        appId = appId.replace(keys[0] + ':', '')
      }
    }
    if (!applicationKeyId) return next()
    applicationKey = await mongo.applicationsKeys.findOne({ 'keys.id': applicationKeyId, ...ownerFilter })
    if (!applicationKey) return next()
    if (applicationKey._id !== appId) {
      // the application key can be matched to a parent application key (case of dashboards, etc)
      const isParentApplicationKey = await mongo.db.collection('applications')
        .count({ id: applicationKey._id, 'configuration.applications.id': appId, ...ownerFilter })
      if (!isParentApplicationKey) return next()
    }
  }

  if (applicationKey && appId) {
    const matchingApplication = await mongo.applications
      .findOne({
        id: appId,
        $or: [{ 'configuration.datasets.href': datasetHref }, { 'configuration.datasets.id': dataset.id }],
        ...ownerFilter
      }, { projection: { 'configuration.datasets': 1 } })
    if (matchingApplication) {
      // this is basically the "crowd-sourcing" use case
      // we apply some anti-spam protection
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // 1rst level of anti-spam prevention, no cross origin requests on this route
        if (!matchingHost(req)) {
          return res.status(405).send(req.__('errors.noCrossDomain'))
        }

        // 2nd level of anti-spam protection, validate that the user was present on the page for a few seconds before sending
        const { verifyToken } = req.app.get('session')
        const anonymousToken = req.get('x-anonymousToken')
        let tokenContent
        if (!anonymousToken) return res.status(401).type('text/plain').send(req.__('errors.requireAnonymousToken'))
        try {
          tokenContent = await verifyToken(anonymousToken)
        } catch (err: any) {
          if (err.name === 'NotBeforeError') {
            return res.status(429).type('text/plain').send(req.__('errors.looksLikeSpam'))
          } else {
            return res.status(401).type('text/plain').send('Invalid token')
          }
        }
        if (!tokenContent.anonymousAction) throw new Error('wrong type of token used for anonymous action')

        // 3rd level of anti-spam protection, simple rate limiting based on ip
        if (!rateLimiting.consume(req, 'postApplicationKey', tokenContent.id ?? tokenContent.iat)) {
          console.warn('Rate limit error for application key', requestIp.getClientIp(req), req.originalUrl)
          return res.status(429).type('text/plain').send(req.__('errors.exceedAnonymousRateLimiting'))
        }
      }

      // apply some permissions based on app configuration
      // some dataset might need to be readable, some other writable only for createLine, etc
      const matchingApplicationDataset = matchingApplication.configuration?.datasets?.find(d => d && d.href === datasetHref)
      if (!matchingApplicationDataset) return next()
      req.bypassPermissions = matchingApplicationDataset.applicationKeyPermissions || { classes: ['read'] }
      if (!reqUser(req)) {
        setReqUser(
          req,
          { id: applicationKey.id, name: applicationKey.title, email: '', organizations: [] },
          undefined, undefined, undefined,
          { isApplicationKey: true }
        )
      }
    }
  }
  next()
}
