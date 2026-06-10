// Typed request-scoped context, replacing ad-hoc mutation of req properties.
// Pattern follows @data-fair/lib-express session.ts / site.ts: symbol keys,
// typed accessors, casts contained in this module, get() throws when the
// middleware that sets the value was not applied.
import type { IncomingMessage } from 'node:http'
import type { Request } from 'express'
import { reqSession, type User, type Account } from '@data-fair/lib-express'
import type { Resource, ResourceType, BypassPermissions } from '#types'

export type ReqContext<T> = {
  set: (req: IncomingMessage, value: T) => void
  get: (req: IncomingMessage) => T
  getOptional: (req: IncomingMessage) => T | undefined
}

// legacyProp: name of the legacy mutated req property to fall back to while
// setters are migrated module by module. Remove the argument (and the legacy
// member in api/types) once `grep -rnE "req\.<prop> *= [^=]" api/src` is empty.
// While legacyProp is set, set() dual-writes the legacy property so readers and setters can migrate in any order.
export const defineReqContext = <T>(name: string, legacyProp?: string): ReqContext<T> => {
  const key = Symbol(name)
  return {
    set: (req, value) => {
      (req as any)[key] = value
      if (legacyProp) (req as any)[legacyProp] = value
    },
    get: (req) => {
      const value = (req as any)[key] ?? (legacyProp ? (req as any)[legacyProp] : undefined)
      if (value === undefined) throw new Error(`req context "${name}" was not set (middleware missing?)`)
      return value
    },
    getOptional: (req) => (req as any)[key] ?? (legacyProp ? (req as any)[legacyProp] : undefined)
  }
}

// ---- cross-cutting contexts (read by permissions, cache-headers, find, …) ----
// Setters stay where they are today (app.js, module middlewares) until the
// owning module's phase switches them from mutation to set*().

const resource = defineReqContext<Resource>('resource', 'resource')
export const setReqResource = resource.set
export const reqResource = resource.get
export const reqResourceOptional = resource.getOptional

const resourceType = defineReqContext<ResourceType>('resourceType', 'resourceType')
export const setReqResourceType = resourceType.set
export const reqResourceType = resourceType.get

const bypassPermissions = defineReqContext<BypassPermissions>('bypassPermissions', 'bypassPermissions')
export const setReqBypassPermissions = bypassPermissions.set
export const reqBypassPermissions = bypassPermissions.getOptional

const publicOperation = defineReqContext<boolean>('publicOperation', 'publicOperation')
export const setReqPublicOperation = publicOperation.set
export const reqPublicOperation = publicOperation.getOptional

const noCache = defineReqContext<boolean>('noCache', 'noCache')
export const setReqNoCache = noCache.set
export const reqNoCache = noCache.getOptional

const publicBaseUrl = defineReqContext<string>('publicBaseUrl', 'publicBaseUrl')
export const setReqPublicBaseUrl = publicBaseUrl.set
export const reqPublicBaseUrl = publicBaseUrl.get

const publicWsBaseUrl = defineReqContext<string>('publicWsBaseUrl', 'publicWsBaseUrl')
export const setReqPublicWsBaseUrl = publicWsBaseUrl.set
export const reqPublicWsBaseUrl = publicWsBaseUrl.get

// publicationSite / mainPublicationSite are loose shapes today; typed any until
// a PublicationSite-with-owner type is extracted in Phase 5
const publicationSite = defineReqContext<any>('publicationSite', 'publicationSite')
export const setReqPublicationSite = publicationSite.set
export const reqPublicationSite = publicationSite.getOptional

const mainPublicationSite = defineReqContext<any>('mainPublicationSite', 'mainPublicationSite')
export const setReqMainPublicationSite = mainPublicationSite.set
export const reqMainPublicationSite = mainPublicationSite.getOptional

// ---- audit-log context without req (same EventLog output as passing { req }) ----
export type LogContext = { user?: User, account?: Account, ip?: string, host?: string }
export const reqEventLogContext = (req: Request): LogContext => {
  const session = reqSession(req)
  return {
    user: session.user,
    account: session.account,
    ip: req.get('X-Client-IP'),
    host: req.get('Host')
  }
}
