// A middleware that accepts an api key from the settings of a user/orga
// and create a session with a pseudo user
import crypto from 'crypto'
import config from '#config'
import mongo from '#mongo'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type RequestWithResource } from '#types'
import { type OrganizationMembership, type SessionState, setReqSession, type Account } from '@data-fair/lib-express'
import { type NextFunction, type Response, type Request } from 'express'
import { isDepartmentSettings, isUserSettings } from '../routers/settings.ts'
import dayjs from 'dayjs'

export const readApiKey = async (rawApiKey: string, scopes: string[], asAccount?: Account | string, req?: RequestWithResource): Promise<SessionState & { isApiKey: true }> => {
  if (req?.resource?._readApiKey && (req.resource._readApiKey.current === rawApiKey || req.resource._readApiKey.previous === rawApiKey)) {
    req.bypassPermissions = { classes: ['read'] }
    const user = {
      id: 'readApiKey',
      name: 'Read API key for specifc resource',
      email: '',
      organizations: []
    }
    return {
      lang: 'fr',
      isApiKey: true,
      user,
      account: { type: 'user', id: user.id, name: user.name },
      accountRole: config.adminRole
    }
  } else {
    const hash = crypto.createHash('sha512')
    hash.update(rawApiKey)
    const hashedApiKey = hash.digest('hex')
    const settings = await mongo.settings
      .findOne({ 'apiKeys.key': hashedApiKey }, { projection: { _id: 0, id: 1, type: 1, department: 1, name: 1, email: 1, 'apiKeys.$': 1 } })
    if (!settings) throw httpError(401, 'Cette clé d\'API est inconnue.')
    const apiKey = settings.apiKeys?.[0]
    if (!apiKey) throw httpError(401, 'Cette clé d\'API est inconnue.')
    if (apiKey.expireAt && apiKey.expireAt < dayjs().format('YYYY-MM-DD')) {
      throw httpError(403, 'Cette clé d\'API est expirée.')
    }
    const sessionState: SessionState & { isApiKey: true } = {
      lang: 'fr',
      isApiKey: true
    }

    if (!apiKey.scopes.length && apiKey.email) {
      // an api key without scope acts as a single separate user (not an org member)
      // so that only individual email based permissions can apply
      sessionState.user = {
        id: apiKey.id as string,
        name: `${settings.name} (${apiKey.title})`,
        email: apiKey.email,
        organizations: []
      }
      sessionState.account = { type: 'user', id: sessionState.user.id, name: sessionState.user.name }
      sessionState.accountRole = config.adminRole
      return sessionState
    }
    if (!apiKey.scopes.some(scope => scopes.includes(scope))) {
      throw httpError(403, 'Cette clé d\'API n\'a pas la portée nécessaire.')
    }

    if (apiKey.adminMode && apiKey.asAccount) {
      if (!asAccount) throw httpError(403, 'Cette clé d\'API requiert de spécifier le compte à incarner')
      let account: Account
      if (typeof asAccount === 'string') {
        account = JSON.parse(asAccount) as Account
        if (account.name) account.name = decodeURIComponent(account.name)
        if (account.departmentName) account.departmentName = decodeURIComponent(account.departmentName)
      } else {
        account = asAccount
      }
      if (account.type === 'user') {
        sessionState.user = {
          id: account.id,
          name: `${account.name} (${apiKey.title})`,
          email: '',
          organizations: []
        }
        sessionState.account = { type: 'user', id: sessionState.user.id, name: sessionState.user.name }
        sessionState.accountRole = config.adminRole
      } else {
        const userOrg: OrganizationMembership = { id: account.id, name: account.name, role: config.adminRole }
        if (account.department) {
          userOrg.department = account.department
          if (account.departmentName) userOrg.departmentName = account.departmentName
        }
        sessionState.user = {
          id: 'apiKey:' + apiKey.id,
          name: apiKey.title,
          email: '',
          organizations: [userOrg]
        }
        sessionState.organization = userOrg
        sessionState.account = { type: 'organization', ...userOrg }
        // @ts-ignore
        delete sessionState.account.role
        sessionState.accountRole = userOrg.role
      }
    } else {
      if (asAccount) throw httpError(403, 'Cette clé d\'API ne supporte pas de spécifier le compte à incarner')
      if (isUserSettings(settings)) {
        sessionState.user = {
          id: settings.id,
          name: `${settings.name} (${apiKey.title})`,
          email: '',
          organizations: []
        }
        // this should always be defined from now own, but not in older settings
        if (settings.email) sessionState.user.email = settings.email
        sessionState.account = { type: 'user', id: sessionState.user.id, name: sessionState.user.name }
        sessionState.accountRole = config.adminRole
      } else {
        const userOrg: OrganizationMembership = { id: settings.id, name: settings.name, role: config.adminRole }
        if (isDepartmentSettings(settings)) {
          userOrg.department = settings.department
          if (settings.departmentName) userOrg.departmentName = settings.departmentName
        }
        sessionState.user = {
          id: 'apiKey:' + apiKey.id,
          name: apiKey.title,
          email: '',
          organizations: [userOrg]
        }
        // this should always be defined from now own, but not in older api keys
        if (apiKey.email) sessionState.user.email = apiKey.email
        sessionState.organization = userOrg
        sessionState.account = { type: 'organization', ...userOrg }
        // @ts-ignore
        delete sessionState.account.role
        sessionState.accountRole = userOrg.role
      }
      if (apiKey.adminMode && sessionState.user) sessionState.user.adminMode = 1
    }
    return sessionState
  }
}

export const middleware = (scopes: string[] | string) => {
  if (typeof scopes === 'string') scopes = [scopes]
  return async (_req: Request, res: Response, next: NextFunction) => {
    const req = _req as RequestWithResource
    const reqApiKey = req.get('x-apiKey') || req.get('x-api-key') || req.query.apiKey
    const asAccountStr = req.get('x-account') || req.query.account
    if (typeof reqApiKey === 'string') {
      const sessionState = await readApiKey(reqApiKey, scopes, asAccountStr, req)
      setReqSession(req, sessionState)
    }
    next()
  }
}
