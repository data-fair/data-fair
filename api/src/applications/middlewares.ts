import { type RequestHandler } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type AccountKeys, reqSessionAuthenticated, reqUserAuthenticated } from '@data-fair/lib-express'
import mongo from '#mongo'
import * as findUtils from '../misc/utils/find.ts'
import { clean as cleanBaseApp } from '../base-applications/operations.ts'
import * as permissions from '../misc/utils/permissions.ts'
import { reqPublicationSite, reqMainPublicationSite } from '../misc/utils/publication-sites.ts'
import { reqPublicBaseUrl } from '../misc/utils/public-base-url.ts'
import { defineReqContext, reqEventLogContext } from '../misc/utils/req-context.ts'
import * as usersUtils from '../misc/utils/users.ts'
import * as service from './service.ts'
import { matchApplicationKey } from './proxy-service.ts'
import { clean } from './utils.ts'
import type { Application, BaseApp } from '#types'

// `application` keeps its legacyProp dual-write: a vestigial reader remains in app.js
// (the `/app-sw.js` route reads `req.application`, where it is never set → undefined).
// Drop the second arg once app.js migrates in Phase 5.
const application = defineReqContext<Application>('application', 'application')
export const setReqApplication = application.set
export const reqApplication = application.get

// baseApp / isNewApplication / matchingApplicationKey are fully internal to the applications
// module; all readers/setters use the accessors, so the legacyProp dual-write was dropped (Task 7).
const baseApp = defineReqContext<BaseApp>('baseApp')
export const setReqBaseApp = baseApp.set
export const reqBaseApp = baseApp.get

const isNewApplication = defineReqContext<boolean>('isNewApplication')
export const setReqIsNewApplication = isNewApplication.set
export const reqIsNewApplication = isNewApplication.getOptional

const matchingApplicationKey = defineReqContext<string>('matchingApplicationKey')
export const setReqMatchingApplicationKey = matchingApplicationKey.set
export const reqMatchingApplicationKey = matchingApplicationKey.getOptional

export const readApplication: RequestHandler = async (req, res, next) => {
  const publicationSite = reqPublicationSite(req)
  const mainPublicationSite = reqMainPublicationSite(req)

  // req.params is cast to the shape getByUniqueRef expects (untyped find.js, typed via its caller);
  // ParamsDictionary values are strings at runtime for the :applicationId route. find.js → ts in Phase 5 removes this.
  const application = await findUtils.getByUniqueRef(publicationSite, mainPublicationSite, req.params as Record<string, string>, 'application', null) as Application | undefined
  if (!application) return res.status(404).send(req.__('errors.missingApp'))

  permissions.setReqResourceType(req, 'applications')
  permissions.setReqResource(req, application)
  setReqApplication(req, application)
  next()
}

// proxy-specific resource resolver: protected application can be given either as
// /applicationKey:applicationId or /applicationId?key=applicationKey
export const setProxyResource: RequestHandler = async (req, res, next) => {
  const publicationSite = reqPublicationSite(req)
  const mainPublicationSite = reqMainPublicationSite(req)
  const publicBaseUrl = reqPublicBaseUrl(req)

  // protected application can be given either as /applicationKey:applicationId or /applicationId?key=applicationKey
  let application = await findUtils.getByUniqueRef(publicationSite, mainPublicationSite, req.params as Record<string, string>, 'application', null) as Application | undefined
  let applicationKeyId = req.query.key as string | undefined
  if (!application && !applicationKeyId) {
    const keys = (req.params.applicationId as string).split(':')
    applicationKeyId = keys[0]
    const applicationIdCandidate = (req.params.applicationId as string).replace(keys[0] + ':', '')
    application = await findUtils.getByUniqueRef(publicationSite, mainPublicationSite, req.params as Record<string, string>, 'application', applicationIdCandidate) as Application | undefined
  }
  if (!application) return res.status(404).send(req.__('errors.missingApp'))
  const ownerFilter = {
    'owner.type': application.owner.type,
    'owner.id': application.owner.id,
    'owner.department': application.owner.department ? application.owner.department : { $exists: false }
  }
  if (applicationKeyId && await matchApplicationKey(application, applicationKeyId, ownerFilter)) {
    setReqMatchingApplicationKey(req, applicationKeyId)
  }
  findUtils.setResourceLinks(application, 'application', publicBaseUrl, null, encodeURIComponent(req.params.applicationId as string))

  permissions.setReqResourceType(req, 'applications')
  permissions.setReqResource(req, application)
  setReqApplication(req, application)
  next()
}

export const readBaseApp: RequestHandler = async (req, res, next) => {
  const baseApp = await mongo.db.collection('base-applications').findOne({ url: reqApplication(req).url }) as BaseApp | null
  if (!baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))
  cleanBaseApp(reqPublicBaseUrl(req), baseApp)
  setReqBaseApp(req, baseApp)
  next()
}

// PUT used to create or update: try insertion if the user is authorized,
// in case of conflict go on with the update scenario
export const attemptInsert: RequestHandler = async (req, res, next) => {
  if (typeof req.params.applicationId !== 'string') throw httpError(400, 'invalid path parameters')
  const { returnValid } = await import('#types/application/index.ts')
  // reqUserAuthenticated (below) throws 401 for an anonymous request — same as the legacy code,
  // where initNew() called reqUserAuthenticated() before the session/permission checks. So an
  // anonymous PUT 401s here, exactly as before; it does not fall through to readApplication.
  const newApplication = returnValid(await service.initNewApplication(req.body, usersUtils.owner(req) as AccountKeys, reqUserAuthenticated(req), req.params.applicationId)) as Application
  const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }

  permissions.initResourcePermissions(newApplication)

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newApplication.owner, 'applications', 'post', ctx.sessionState)) {
    const inserted = await service.tryInsertApplication(ctx, newApplication)
    if (inserted) {
      setReqIsNewApplication(req, true)
      res.status(201).json(clean(newApplication, reqPublicBaseUrl(req), reqPublicationSite(req)))
      return
    }
  }
  next()
}
