import type { Request as ExpressRequest } from 'express'
import type { Dataset } from './.type/index.js'
import { httpError, type Account } from '@data-fair/lib-express'
import type { InitFrom } from '#doc/datasets/post-req/index.js'
export * from './.type/index.js'

type Action = 'create' | 'update' | 'delete' | 'patch' | 'createOrUpdate'

export type RestDataset = Omit<Dataset, 'isRest' | 'rest' | 'schema'> & { isRest: true } & Required<Pick<Dataset, 'rest' | 'schema'>>
export const isRestDataset = (dataset: Dataset): dataset is RestDataset => {
  return !!dataset.isRest
}
export function assertRestDataset (dataset: Dataset): asserts dataset is RestDataset {
  if (!dataset.isRest) throw httpError(400, 'dataset is not "rest"')
}

export type VirtualDataset = Omit<Dataset, 'isVirtual' | 'virtual' | 'schema'> & { isVirtual: true, descendants?: string[] } & Required<Pick<Dataset, 'virtual' | 'schema'>>
export const isVirtualDataset = (dataset: Dataset): dataset is VirtualDataset => {
  return !!dataset.isVirtual
}

export type FileDataset = Omit<Dataset, 'file' | 'originalFile' | 'schema'> & Required<Pick<Dataset, 'file' | 'originalFile' | 'schema'>>
export const isFileDataset = (dataset: Dataset): dataset is FileDataset => {
  return !!dataset.file
}

export type DatasetExt = Dataset & { visibility: 'public' | 'private' | 'protected', public: 'boolean' }

export type DatasetInternal = Dataset & {
  loaded?: { attachments?: boolean, dataset?: Partial<FileDataset['originalFile']> } | null,
  descendants?: string[]
  descendantsFull?: DatasetInternal[]
  initFrom?: (InitFrom & { role: string, department?: string }) | null
  _partialRestStatus?: 'updated' | 'extended' | 'indexed'
  validateDraft?: boolean
  _newRestAttachments?: string[]
  _readApiKey?: { current: string, previous: string }
  // true when this dataset's current index carries the `_search` / `_search_boosted` catch-all
  // fields (set by the finalize worker); for virtual datasets: true iff every descendant has it.
  _esCopyToSearch?: boolean
  // `integrity` is part of the public Dataset schema (server-managed, readOnly)
  _needsHistorizing?: {
    classes: ('file' | 'metadata')[],
    context?: { operation: 'create' | 'update' | 'enable' | 'fixIntegrity', originator: string, reason?: string }
  }
  // keyword columns detected as having values truncated by ES ignore_above (set by finalize worker)
  _esIgnoredKeywordFields?: string[]
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
