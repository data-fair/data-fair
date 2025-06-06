import type { Request as ExpressRequest } from 'express'
import type { Dataset } from './.type/index.js'
import type { Account } from '@data-fair/lib-express'
export * from './.type/index.js'

type Action = 'create' | 'update' | 'delete' | 'patch' | 'createOrUpdate'

export type RestDataset = Omit<Dataset, 'isRest' | 'rest' | 'schema'> & { isRest: true } & Required<Pick<Dataset, 'rest' | 'schema'>>
export const isRestDataset = (dataset: Dataset): dataset is RestDataset => {
  return !!dataset.isRest
}

export type VirtualDataset = Omit<Dataset, 'isVirtual' | 'virtual' | 'schema'> & { isVirtual: true, descendants?: string[] } & Required<Pick<Dataset, 'virtual' | 'schema'>>
export const isVirtualDataset = (dataset: Dataset): dataset is VirtualDataset => {
  return !!dataset.isVirtual
}

export type DatasetLine = {
  _id: string,
  _i?: number,
  _updatedAt?: Date,
  [key: string]: unknown
}

export type DatasetLineAction = DatasetLine & { _action?: Action }

export type DatasetLineRevision = {
  _lineId: string,
  _i?: number,
  _action: Action,
  _updatedAt?: Date,
  [key: string]: unknown
}

export type RequestWithDataset = ExpressRequest & { dataset: Dataset }
export type RequestWithRestDataset = ExpressRequest & { dataset: RestDataset, linesOwner?: Account }
