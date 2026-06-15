import { type RequestHandler } from 'express'
import mongo from '#mongo'
import * as findUtils from '../misc/utils/find.js'
import { clean as cleanBaseApp } from '../base-applications/operations.ts'
import { setReqResource, setReqResourceType } from '../misc/utils/permissions.ts'
import { reqPublicationSite, reqMainPublicationSite } from '../misc/utils/publication-sites.ts'
import { defineReqContext } from '../misc/utils/req-context.ts'
import type { Application, BaseApp } from '#types'

const application = defineReqContext<Application>('application', 'application')
export const setReqApplication = application.set
export const reqApplication = application.get

const baseApp = defineReqContext<BaseApp>('baseApp', 'baseApp')
export const setReqBaseApp = baseApp.set
export const reqBaseApp = baseApp.get

const isNewApplication = defineReqContext<boolean>('isNewApplication', 'isNewApplication')
export const setReqIsNewApplication = isNewApplication.set
export const reqIsNewApplication = isNewApplication.getOptional

const matchingApplicationKey = defineReqContext<string>('matchingApplicationKey', 'matchingApplicationKey')
export const setReqMatchingApplicationKey = matchingApplicationKey.set
export const reqMatchingApplicationKey = matchingApplicationKey.getOptional

export const readApplication: RequestHandler = async (req, res, next) => {
  const publicationSite = reqPublicationSite(req)
  const mainPublicationSite = reqMainPublicationSite(req)

  // req.params is cast to the shape getByUniqueRef expects (untyped find.js, typed via its caller);
  // ParamsDictionary values are strings at runtime for the :applicationId route. find.js → ts in Phase 5 removes this.
  const application = await findUtils.getByUniqueRef(publicationSite, mainPublicationSite, req.params as Record<string, string>, 'application', null) as Application | undefined
  if (!application) return res.status(404).send(req.__('errors.missingApp'))

  setReqResourceType(req, 'applications')
  setReqResource(req, application)
  setReqApplication(req, application)
  next()
}

export const readBaseApp: RequestHandler = async (req, res, next) => {
  const baseApp = await mongo.db.collection('base-applications').findOne({ url: reqApplication(req).url }) as BaseApp | null
  if (!baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))
  cleanBaseApp(req.publicBaseUrl, baseApp)
  setReqBaseApp(req, baseApp)
  next()
}
