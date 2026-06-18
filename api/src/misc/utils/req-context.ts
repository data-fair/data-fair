// Typed request-scoped context, replacing ad-hoc mutation of req properties.
// Pattern follows @data-fair/lib-express session.ts / site.ts: symbol keys,
// typed accessors, casts contained in the factory, get() throws when the
// middleware that sets the value was not applied.
// This module hosts the factory, the req-free context helpers, AND the
// cross-cutting request-context accessors (resource / resourceType /
// bypassPermissions / publicOperation) consumed across modules. Those live here
// — not in their semantic-owner domain module (permissions.ts) — because this
// module is config-free: a config-free consumer (e.g. the unit-tested pure util
// query-advice.ts) must be able to import an accessor without transitively
// pulling in `#config` validation. Module-LOCAL accessors still live next to
// the code that owns them (e.g. reqSettingsParams in settings/middlewares.ts).
// See docs/architecture/code-conventions.md §2.
import type { IncomingMessage } from 'node:http'
import type { Request } from 'express'
import { reqSession, type User, type Account } from '@data-fair/lib-express'
import type { Resource, ResourceType, BypassPermissions, Dataset, RestDataset } from '#types'

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

// ---- cross-cutting request-context accessors ----
// resource / resourceType are the requested resource and its kind; bypassPermissions
// is set by api-key / application-key middlewares; publicOperation is set by the
// permissions middleware and read by cache-headers / query-advice / thumbnails.
// legacyProp keeps the legacy `req.<prop>` reads/writes working while datasets
// (Phase 6) and api-compat (Phase 7) still mutate them directly.
const resourceCtx = defineReqContext<Resource>('resource')
export const setReqResource = resourceCtx.set
export const reqResource = resourceCtx.get
export const reqResourceOptional = resourceCtx.getOptional

const resourceTypeCtx = defineReqContext<ResourceType>('resourceType')
export const setReqResourceType = resourceTypeCtx.set
export const reqResourceType = resourceTypeCtx.get

// the loaded dataset (draft merged when in draft mode). Defined here, in the config-free home, rather
// than module-local in datasets/middlewares.ts, because config-free pure code (query-advice.ts) and
// datasets/utils/* (which can't import middlewares.ts without a require cycle) read it. The owner module
// datasets/middlewares.ts re-exports these as a facade. reqRestDataset is for REST line routes whose
// dataset is guaranteed to be a RestDataset (single cast contained here, per §2). No legacyProp: every
// reader migrated to the accessor in Phase 7.
const datasetCtx = defineReqContext<Dataset>('dataset')
export const setReqDataset = datasetCtx.set
export const reqDataset = datasetCtx.get
export const reqDatasetOptional = datasetCtx.getOptional
export const reqRestDataset = (req: IncomingMessage) => datasetCtx.get(req) as RestDataset

const bypassPermissionsCtx = defineReqContext<BypassPermissions>('bypassPermissions', 'bypassPermissions')
export const setReqBypassPermissions = bypassPermissionsCtx.set
export const reqBypassPermissions = bypassPermissionsCtx.getOptional

const publicOperationCtx = defineReqContext<boolean>('publicOperation', 'publicOperation')
export const setReqPublicOperation = publicOperationCtx.set
export const reqPublicOperation = publicOperationCtx.getOptional

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
