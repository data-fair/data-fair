import type { Request as ExpressRequest } from 'express'
import type { Dataset } from './.type/index.js'
import { httpError, type Account } from '@data-fair/lib-express'
import type { InitFrom } from '#doc/datasets/post-req/index.js'
export * from './.type/index.js'

// canonical declaration (api/src/integrity/operations.ts re-exports it) — declared here because
// this package must not import from src (a src import drags API code into the UI's vue-tsc type graph)
// 'disable' (and 'delete' at dataset level) are the TERMINAL trail revisions (round 3 §S2);
// 'ackTrail' records a reviewed trail-anomaly acknowledgement carrying its fingerprints
export type RevisionOperation = 'create' | 'update' | 'delete' | 'enable' | 'fixIntegrity' | 'restore' | 'disable' | 'ackTrail'
// actor CATEGORY, never an identity: user ids are personal data and must not enter the
// undeletable WORM store — identity-level attribution lives in the events/journal system
export type RevisionOrigin = 'user' | 'superadmin' | 'worker' | 'propagation' | 'upgrade'
// per-revision attribution (the `.who` sibling, target 8): actor identity, unlike RevisionOrigin
// above, but bounded — it never rides the revision JSON itself, only the short-retention sibling.
// No name/email (minimization): a bare id, an opaque API-key ref, the client IP, and coarse geo
// from trusted reverse-proxy headers.
export type WhoHint = {
  user?: { id: string }
  apiKey?: { id: string }
  ip?: string
  geo?: { country?: string, asn?: number, asnOrg?: string }
}
export type HistorizeContextHint = {
  operation: RevisionOperation
  origin: RevisionOrigin
  reason?: string
  who?: WhoHint
}

type Action = 'create' | 'update' | 'delete' | 'patch' | 'createOrUpdate'

export type RestDataset = Omit<Dataset, 'isRest' | 'rest' | 'schema'> & { isRest: true } & Required<Pick<Dataset, 'rest' | 'schema'>>
export const isRestDataset = (dataset: Dataset): dataset is RestDataset => {
  return !!dataset.isRest
}
export function assertRestDataset (dataset: Dataset): asserts dataset is RestDataset {
  if (!dataset.isRest) throw httpError(400, 'dataset is not "rest"')
}

// mirrors VirtualFilter / QueryableDescendant in api/src/datasets/es/operations.ts — declared inline
// because this package must not import from src (a src import drags API code into the UI's vue-tsc
// type graph). One arrival of a non-virtual descendant of a virtual dataset, resolved by the single
// traversal in datasets/utils/virtual.ts and assigned to `dataset.descendants`; consumed by
// aliasName / prepareQuery (es/commons.ts) and parseFilters (api-compat/ods/operations.ts).
type DescendantsVirtualFilter = { key: string, operator?: 'in' | 'nin', values?: string[] }
export type QueryableDescendant = {
  id: string
  index: string
  filters?: DescendantsVirtualFilter[]
  [key: string]: any
}

export type VirtualDataset = Omit<Dataset, 'isVirtual' | 'virtual' | 'schema'> & { isVirtual: true, descendants?: QueryableDescendant[] } & Required<Pick<Dataset, 'virtual' | 'schema'>>
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
  descendants?: QueryableDescendant[]
  initFrom?: (InitFrom & { role: string, department?: string }) | null
  _partialRestStatus?: 'updated' | 'extended' | 'indexed'
  validateDraft?: boolean
  _newRestAttachments?: string[]
  _readApiKey?: { current: string, previous: string }
  // true when this dataset's current index carries the `_search` / `_search_boosted` catch-all
  // fields (set by the finalize worker); for virtual datasets: true iff every descendant has it.
  _esCopyToSearch?: boolean
  // `integrity` is part of the public Dataset schema (server-managed, readOnly)
  _needsHistorizing?: { context?: HistorizeContextHint }
  // work-queue hint for the per-line integrity relay (target 3): set BEFORE line stamps are
  // written (hint-first ordering) so a crash between the two leaves a harmless empty hint
  _needsHistorizingLines?: boolean
  // keyword columns detected as having values truncated by ES ignore_above (set by finalize worker)
  _esIgnoredKeywordFields?: string[]
}

export type DatasetLine = {
  _id: string,
  _i?: number,
  _updatedAt?: Date,
  _deleted?: boolean,
  _hash?: string | null,
  _needsHistorizing?: { context?: HistorizeContextHint },
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
