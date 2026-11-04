import { type Request, type RequestHandler } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { reqSessionAuthenticated, secretKeyMatches, markScopeChecked, type SessionStateAuthenticated } from '@data-fair/lib-express'
import config from '#config'
import { reqHost } from '@data-fair/lib-express/req-origin.js'
import log from '@data-fair/lib-node/log.js'
import { ownerLogFields } from '../misc/utils/log-fields.ts'
import { defineReqContext } from '../misc/utils/req-context.ts'
import * as permissions from '../misc/utils/permissions.ts'
import { parseOwnerParams, parseActingUser, actingSessionState, type SettingsParams } from './operations.ts'
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
    log.alert('a user attempted to overwrite settings from another account', { code: 'df.apikeys.permission', ...ownerLogFields(owner) })
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

// set when a publication-site write came with the portals secret key instead of a session
const portalsSecretSession = defineReqContext<SessionStateAuthenticated>('portals-secret-session')
export const reqPortalsSecret = (req: Request) => !!portalsSecretSession.getOptional(req)

/**
 * Publication-site writes: portals syncs the sites of its agent (scoped) sessions with its shared
 * secret key (x-secret-key) and the user it acts for (x-acting-user), without a session. Without a
 * matching key this is isOwnerAdmin, whatever the headers: the session path is unchanged.
 */
export const portalsSecretOrOwnerAdmin: RequestHandler = (req, res, next) => {
  if (!secretKeyMatches(req.get('x-secret-key'), config.secretKeys.portals)) {
    isOwnerAdmin(req, res, next)
    return
  }
  const { owner } = reqSettingsParams(req)
  portalsSecretSession.set(req, actingSessionState(owner, parseActingUser(req.get('x-acting-user'))))
  // a session-less call: the key, not a scope, is what allows it
  markScopeChecked(req)
  next()
}

export const reqWriteContext = (req: Request): SettingsWriteContext => {
  const secretSession = portalsSecretSession.getOptional(req)
  // a call on the private url has no x-forwarded-host, the public host stands for it
  if (secretSession) return { ...reqSettingsParams(req), sessionState: secretSession, host: new URL(config.publicUrl).host }
  return { ...reqSettingsParams(req), sessionState: reqSessionAuthenticated(req), host: reqHost(req) }
}
