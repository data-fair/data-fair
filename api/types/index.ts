import type { User } from '@data-fair/lib-express'
import type { Request as ExpressRequest } from 'express'

export type { Application } from './application/index.js'
export type { AppConfig } from './app-config/index.js'
export type { BaseApp } from './base-app/index.js'
export type { Dataset, DatasetExt, RestDataset, DatasetLine, DatasetLineAction, DatasetLineRevision, VirtualDataset, SchemaProperty } from './dataset/index.ts'
export type { Event } from './event/index.js'
export { type Settings, resolvedSchema as settingsSchema } from './settings/index.js'
export type { Topic } from './topic/index.js'
export type { Vocabulary } from './vocabulary/index.js'
export type { Limits, Limit } from './limits/index.js'

export type Request = ExpressRequest & { user?: User } & { query: Record<string, string> } & { publicBaseUrl: string }
export type RequestWithAuth = Request & { user: User }

export type RestActionsSummary = { nbOk: number, nbNotModified: number, nbErrors: number, nbCreated: number, nbModified: number, nbDeleted: number, errors: { line: number, error: string, status: number }[], warnings: string[], cancelled?: boolean, dropped?: boolean, indexedAt?: string }
