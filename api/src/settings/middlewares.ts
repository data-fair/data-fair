import { type Request, type RequestHandler } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { reqSessionAuthenticated } from '@data-fair/lib-express'
import { reqHost } from '@data-fair/lib-express/req-origin.js'
import eventsLog from '@data-fair/lib-express/events-log.js'
import { defineReqContext, reqEventLogContext } from '../misc/utils/req-context.ts'
import * as permissions from '../misc/utils/permissions.ts'
import { parseOwnerParams, type SettingsParams } from './operations.ts'
import { type SettingsWriteContext } from './service.ts'

const settingsParams = defineReqContext<SettingsParams>('settings-params')
export const setReqSettingsParams = settingsParams.set
export const reqSettingsParams = settingsParams.get

export const settingsParamsMiddleware: RequestHandler = (req, res, next) => {
  if (typeof req.params.type !== 'string' || typeof req.params.id !== 'string') throw httpError(400, 'invalid path parameters')
  if (req.params.type !== 'user' && req.params.type !== 'organization') {
    res.status(400).type('text/plain').send('Invalid type, it must be one of the following : user, organization')
    return
  }
  setReqSettingsParams(req, parseOwnerParams(req.params.type, req.params.id))
  next()
}

export const isOwnerAdmin: RequestHandler = (req, res, next) => {
  const { owner } = reqSettingsParams(req)
  const sessionState = reqSessionAuthenticated(req)
  if (!sessionState.user.adminMode && permissions.getOwnerRole(owner, sessionState) !== 'admin') {
    eventsLog.alert('df.apikeys.permission', 'a user attempted to overwrite settings from another account', { req, account: owner })
    res.sendStatus(403)
    return
  }
  next()
}

export const isOwnerMember: RequestHandler = (req, res, next) => {
  const { owner } = reqSettingsParams(req)
  const sessionState = reqSessionAuthenticated(req)
  // do not check belonging to department, some settings are shared from top org to its departments
  if (!sessionState.user.adminMode && !permissions.getOwnerRole(owner, sessionState, true)) {
    res.sendStatus(403)
    return
  }
  next()
}

export const reqWriteContext = (req: Request): SettingsWriteContext => ({
  ...reqSettingsParams(req),
  sessionState: reqSessionAuthenticated(req),
  host: reqHost(req),
  logCtx: reqEventLogContext(req)
})
