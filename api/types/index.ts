import type { Request as ExpressRequest } from 'express'
import type { Dataset } from './dataset/index.ts'

export type { Application } from './application/index.js'
export type { AppConfig } from './app-config/index.js'
export type { BaseApp } from './base-app/index.js'
export type { Dataset, RestDataset, DatasetLine, DatasetLineAction, DatasetLineRevision, VirtualDataset } from './dataset/index.ts'
export type { Event } from './event/index.js'
export { type Settings, resolvedSchema as settingsSchema } from './settings/index.js'
export type { Topic } from './topic/index.js'
export type { Vocabulary } from './vocabulary/index.js'
export type { Limits, Limit } from './limits/index.js'
export type { Permission } from './permissions/index.js'

export type Request = ExpressRequest & { query: Record<string, string> } & { publicBaseUrl: string }

export type ResourceType = 'datasets' | 'applications' | 'catalogs'
export type Resource = Pick<Dataset, 'id' | 'title' | 'owner' | 'permissions'>
export type BypassPermissions = {
  operations?: string[],
  classes?: string[]
}
export type RequestWithResource = Request & {
  resourceType: ResourceType,
  resource: Resource,
  bypassPermissions?: BypassPermissions,
  publicOperation?: boolean
}

export function assertRequestWithResource (req: ExpressRequest): asserts req is RequestWithResource {
  if (!(req as any).resource) throw new Error('missing req.resource')
}

export type ApplicationKey = {
  _id: string,
  id: string,
  title: string,
  keys: { id: string }[]
}
