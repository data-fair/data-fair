import { createHash } from 'node:crypto'
import stableStringify from 'fast-json-stable-stringify'

export const INDEX_WIDTH = 9

export const padIndex = (i: number): string => String(i).padStart(INDEX_WIDTH, '0')

export type IntegrityClass = 'file' | 'metadata'
export const INTEGRITY_CLASSES: IntegrityClass[] = ['file', 'metadata']

export const revisionPrefix = (owner: { type: string, id: string }, datasetId: string, cls: IntegrityClass): string =>
  `data-fair/${owner.type}-${owner.id}/${datasetId}/${cls}/`

export const revisionKey = (owner: { type: string, id: string }, datasetId: string, cls: IntegrityClass, i: number): string =>
  `${revisionPrefix(owner, datasetId, cls)}${padIndex(i)}`

export const parseRevisionIndex = (key: string): number => {
  const last = key.split('/').pop() ?? ''
  return parseInt(last, 10)
}

export const parseRevisionClass = (key: string): IntegrityClass | undefined => {
  const cls = key.split('/').at(-2)
  return cls === 'file' || cls === 'metadata' ? cls : undefined
}

// The covered projection (spec §2): the whole doc minus underscore-prefixed fields and the
// operational denylist; a field added to the model later is covered by default (fail-loud).
const EXCLUDED_TOP_LEVEL = new Set([
  'status', 'draft', 'integrity', 'count', 'storage', 'esWarning', 'finalizedAt',
  'dataUpdatedAt', 'dataUpdatedBy', 'updatedAt', 'updatedBy', 'createdBy',
  'errorStatus', 'errorRetry', 'loaded', 'descendants'
])

export const coveredPatchKeys = (patch: Record<string, any>): string[] =>
  Object.keys(patch).filter((k) => !k.startsWith('_') && !EXCLUDED_TOP_LEVEL.has(k))

export const coveredMetadata = (dataset: Record<string, any>): Record<string, any> => {
  const covered: Record<string, any> = {}
  for (const key of coveredPatchKeys(dataset)) covered[key] = dataset[key]
  // worker-maintained churn nested inside covered fields, written raw by workers
  // (autoUpdateExtension / finalize propagation / TTL worker / syncApplications)
  if (Array.isArray(covered.extensions)) {
    covered.extensions = covered.extensions.map(({ needsUpdate, nextUpdate, ...rest }: any) => rest)
  }
  if (covered.rest?.ttl && 'checkedAt' in covered.rest.ttl) {
    const { checkedAt, ...ttl } = covered.rest.ttl
    covered.rest = { ...covered.rest, ttl }
  }
  if (covered.extras && 'applications' in covered.extras) {
    const { applications, ...extras } = covered.extras
    covered.extras = extras
  }
  return covered
}

export const metadataHash = (dataset: Record<string, any>): string =>
  createHash('sha256').update(stableStringify(coveredMetadata(dataset))).digest('hex')

export const nextIndex = (keys: string[]): number => {
  let max = -1
  for (const k of keys) {
    const i = parseRevisionIndex(k)
    if (!Number.isNaN(i) && i > max) max = i
  }
  return max + 1
}

export const latestKey = (keys: string[]): string | undefined => {
  if (!keys.length) return undefined
  return [...keys].sort().at(-1) // zero-padded ⇒ lexical sort == numeric order
}

export type RevisionOperation = 'create' | 'update' | 'enable' | 'fixIntegrity'
export type RevisionContext = { operation: RevisionOperation, originator: string, date: string, reason?: string }

export const buildContext = (
  operation: RevisionOperation,
  originator: string,
  date: string,
  reason?: string
): RevisionContext => ({ operation, originator, date, ...(reason ? { reason } : {}) })

export type HistorizeContextHint = { operation: RevisionOperation, originator: string, reason?: string }

// Merge the transactional-outbox stamp (spec §4) into a writer's own Mongo update, keeping the
// write single-document atomic. $addToSet creates the sub-doc on first touch.
export const stampHistorize = (
  update: { $set?: Record<string, any>, $addToSet?: Record<string, any>, [k: string]: any },
  classes: IntegrityClass[],
  context?: HistorizeContextHint
) => {
  update.$addToSet = { ...update.$addToSet, '_needsHistorizing.classes': { $each: classes } }
  if (context) update.$set = { ...update.$set, '_needsHistorizing.context': context }
  return update
}

export const RENEW_INTERVAL = 1 / 12 // ≈ monthly for a 1-year retention window (hardcoded)

// Renew once the current lock is "older" than `interval` of the full retention window.
// Each renewal resets retainUntil to now + window, so the lock's age = window − remaining.
export const needsRenewal = (
  retainUntil: string | undefined,
  now: number,
  retentionDays: number,
  interval = RENEW_INTERVAL
): boolean => {
  if (!retainUntil) return false // nothing anchored yet
  const windowMs = retentionDays * 24 * 3600 * 1000
  const remainingMs = new Date(retainUntil).getTime() - now
  const lockAgeMs = windowMs - remainingMs
  return lockAgeMs > windowMs * interval // i.e. remaining < window × (1 − interval)
}
