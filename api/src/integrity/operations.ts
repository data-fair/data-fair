import { createHash } from 'node:crypto'
import stableStringify from 'fast-json-stable-stringify'

export const INDEX_WIDTH = 9

export const padIndex = (i: number): string => String(i).padStart(INDEX_WIDTH, '0')

export const revisionPrefix = (owner: { type: string, id: string }, datasetId: string): string =>
  `data-fair/${owner.type}-${owner.id}/${datasetId}/`

export const revisionKey = (owner: { type: string, id: string }, datasetId: string, i: number): string =>
  `${revisionPrefix(owner, datasetId)}${padIndex(i)}`

export const parseRevisionIndex = (key: string): number => {
  const last = key.split('/').pop() ?? ''
  return parseInt(last, 10)
}

// Level-2 file payloads are sibling objects `{revisionKey}.file` under the dataset prefix;
// every consumer of a prefix listing must distinguish them from revision JSONs.
export const PAYLOAD_SUFFIX = '.file'

export const payloadKey = (owner: { type: string, id: string }, datasetId: string, i: number): string =>
  revisionKey(owner, datasetId, i) + PAYLOAD_SUFFIX

export const isPayloadKey = (key: string): boolean => key.endsWith(PAYLOAD_SUFFIX)

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
  if (covered.readApiKey && ('expiresAt' in covered.readApiKey || 'renewAt' in covered.readApiKey)) {
    // renewApiKey worker patches these on its own clock (every interval/2); anchoring them would
    // churn a new locked WORM revision on every renewal for no security value. active/interval stay covered.
    const { expiresAt, renewAt, ...readApiKey } = covered.readApiKey
    covered.readApiKey = readApiKey
  }
  // D1 (simplification design): denormalized display names are synced wholesale from their
  // authoritative sources (simple-directory, settings.topics) — hash the identifying keys only,
  // so a name propagation is not a covered change and needs no outbox stamp
  if (covered.owner) {
    const { type, id, department } = covered.owner
    covered.owner = { type, id, ...(department ? { department } : {}) }
  }
  if (Array.isArray(covered.topics)) covered.topics = covered.topics.map(({ id }: any) => ({ id }))
  if (Array.isArray(covered.permissions)) {
    covered.permissions = covered.permissions.map(({ name, ...rest }: any) => rest)
  }
  if (Array.isArray(covered.masterData?.shareOrgs)) {
    covered.masterData = { ...covered.masterData, shareOrgs: covered.masterData.shareOrgs.map(({ id }: any) => ({ id })) }
  }
  return covered
}

export const metadataHash = (dataset: Record<string, any>): string =>
  createHash('sha256').update(stableStringify(coveredMetadata(dataset))).digest('hex')

export const nextIndex = (keys: string[]): number => {
  let max = -1
  for (const k of keys) {
    if (isPayloadKey(k)) continue
    const i = parseRevisionIndex(k)
    if (!Number.isNaN(i) && i > max) max = i
  }
  return max + 1
}

export const latestKey = (keys: string[]): string | undefined => {
  const revisionKeys = keys.filter((k) => !isPayloadKey(k))
  if (!revisionKeys.length) return undefined
  return revisionKeys.sort().at(-1) // zero-padded ⇒ lexical sort == numeric order
}

export type RevisionOperation = 'create' | 'update' | 'enable' | 'fixIntegrity'
// actor CATEGORY, never an identity: user ids are personal data and must not enter the
// undeletable WORM store — identity-level attribution lives in the events/journal system
export type RevisionOrigin = 'user' | 'superadmin' | 'worker' | 'propagation' | 'upgrade'
export type RevisionContext = { operation: RevisionOperation, origin: RevisionOrigin, date: string, reason?: string }
export type HistorizeContextHint = { operation: RevisionOperation, origin: RevisionOrigin, reason?: string }

// Merge the transactional-outbox stamp (spec §4) into a writer's own Mongo update, keeping the
// write single-document atomic. A stamp means "re-anchor this dataset" (every anchor covers both
// the file and metadata hashes since the joint-anchor simplification).
export const stampHistorize = (
  update: { $set?: Record<string, any>, [k: string]: any },
  context?: HistorizeContextHint
) => {
  update.$set = { ...update.$set, _needsHistorizing: context ? { context } : {} }
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
