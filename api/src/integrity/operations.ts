import { createHash } from 'node:crypto'
import stableStringify from 'fast-json-stable-stringify'
// type-only import, erased at runtime: this file stays pure/config-free for the unit tests
import type { RevisionOperation, RevisionOrigin, HistorizeContextHint } from '#types/dataset/index.ts'

export type { RevisionOperation, RevisionOrigin, HistorizeContextHint }

export const INDEX_WIDTH = 9

export const padIndex = (i: number): string => String(i).padStart(INDEX_WIDTH, '0')

export const SERVICE_PREFIX = 'data-fair/'

export const revisionPrefix = (owner: { type: string, id: string }, datasetId: string): string =>
  `${SERVICE_PREFIX}${owner.type}-${owner.id}/${datasetId}/`

// `data-fair/organization-abc-def/` → { type: 'organization', id: 'abc-def' } — ids may contain
// '-', account types never do, so the first '-' is the separator. Returns undefined on a
// malformed segment (foreign object in the bucket): the caller skips it rather than guessing.
export const parseOwnerPrefix = (ownerPrefix: string): { type: 'user' | 'organization', id: string } | undefined => {
  if (!ownerPrefix.startsWith(SERVICE_PREFIX)) return undefined
  const segment = ownerPrefix.slice(SERVICE_PREFIX.length).replace(/\/$/, '')
  if (segment.includes('/')) return undefined
  const sep = segment.indexOf('-')
  if (sep <= 0 || sep === segment.length - 1) return undefined
  const type = segment.slice(0, sep)
  if (type !== 'user' && type !== 'organization') return undefined
  return { type, id: segment.slice(sep + 1) }
}

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

export type RevisionContext = { operation: RevisionOperation, origin: RevisionOrigin, date: string, reason?: string }

// ---------------------------------------------------------------------------------------------
// Trail coherence (round 3): the store's version stacks and provider dates are evidence the
// current view cannot show. These pure folds reconstruct the current view from a versions walk
// (marker-hidden keys resurface) and classify what should never exist in a healthy trail.
// ---------------------------------------------------------------------------------------------

export type TrailVersionEntry = { key: string, versionId?: string, lastModified?: Date, deleteMarker?: boolean, size?: number, etag?: string }

export type TrailAnomalyKind = 'delete-marker' | 'version-divergence' | 'date-skew' | 'sequence-gap'

export type TrailAnomaly = {
  kind: TrailAnomalyKind
  key: string
  confidence: 'confirmed' | 'suspect'
  detail?: string
  versionIds?: string[]
}

export type CurrentViewEntry = { key: string, versionId?: string, lastModified?: Date }

export type TrailFoldAcc = {
  current: Map<string, CurrentViewEntry>
  anomalies: TrailAnomaly[]
  pendingKey?: string
  pendingEntries: TrailVersionEntry[]
}

export const newTrailFold = (): TrailFoldAcc => ({ current: new Map(), anomalies: [], pendingEntries: [] })

const flushTrailKey = (acc: TrailFoldAcc): void => {
  if (!acc.pendingKey || !acc.pendingEntries.length) return
  const key = acc.pendingKey
  const markers = acc.pendingEntries.filter((e) => e.deleteMarker)
  const versions = acc.pendingEntries.filter((e) => !e.deleteMarker)
  if (markers.length) {
    // no code path of ours issues a versionless DELETE: a marker is attacker-made by definition
    acc.anomalies.push({ kind: 'delete-marker', key, confidence: 'confirmed', versionIds: markers.map((m) => m.versionId ?? '') })
  }
  if (versions.length) {
    // versions arrive newest-first within a key (S3 order, preserved by the store's stable page
    // sort): the first one is the current view — resurfaced even when a marker hides it
    acc.current.set(key, { key, versionId: versions[0].versionId, lastModified: versions[0].lastModified })
    if (versions.length > 1) {
      // legitimate multiplicity (crash-retry re-PUTs) is byte-identical: same size, same
      // md5-based ETag (single PUT, or multipart with fixed deterministic chunking). Anything
      // else is a same-key rewrite — the shadowing attack.
      const shapes = new Set(versions.map((e) => `${e.size ?? ''}|${e.etag ?? ''}`))
      if (shapes.size > 1) {
        acc.anomalies.push({ kind: 'version-divergence', key, confidence: 'confirmed', versionIds: versions.map((e) => e.versionId ?? '') })
      }
    }
  }
  acc.pendingEntries = []
}

// Feed one page of version entries (lexical key order, per-key adjacency). Call finishTrailFold
// once every page is consumed — a key's versions may straddle a page boundary.
export const foldTrailVersions = (acc: TrailFoldAcc, entries: TrailVersionEntry[]): void => {
  for (const entry of entries) {
    if (entry.key !== acc.pendingKey) {
      flushTrailKey(acc)
      acc.pendingKey = entry.key
    }
    acc.pendingEntries.push(entry)
  }
}

export const finishTrailFold = (acc: TrailFoldAcc): { current: Map<string, CurrentViewEntry>, anomalies: TrailAnomaly[] } => {
  flushTrailKey(acc)
  return { current: acc.current, anomalies: acc.anomalies }
}

// Mid-sequence holes only: the purge removes a *prefix* of the sequence (locks lapse in write
// order), so missing low indexes are normal aging-out — a hole between surviving indexes is not.
export const sequenceGapAnomalies = (prefix: string, indexes: number[]): TrailAnomaly[] => {
  const sorted = [...indexes].sort((a, b) => a - b)
  const anomalies: TrailAnomaly[] = []
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n] - sorted[n - 1] > 1) {
      const missing = sorted[n] - sorted[n - 1] === 2
        ? `${sorted[n - 1] + 1}`
        : `${sorted[n - 1] + 1}-${sorted[n] - 1}`
      anomalies.push({ kind: 'sequence-gap', key: `${prefix}${padIndex(sorted[n - 1] + 1)}`, confidence: 'suspect', detail: `missing revision(s) ${missing}` })
    }
  }
  return anomalies
}

// A revision claiming a write date far from the provider-stamped LastModified of its object was
// not written when it says it was. Suspect (not confirmed): relay retries legitimately delay the
// object write past the stamp date, hence the generous configurable tolerance.
export const dateSkewAnomaly = (key: string, contextDate: string, lastModified: Date | undefined, toleranceMs: number): TrailAnomaly | undefined => {
  if (!lastModified) return undefined
  const skewMs = Math.abs(lastModified.getTime() - new Date(contextDate).getTime())
  if (skewMs <= toleranceMs) return undefined
  return { kind: 'date-skew', key, confidence: 'suspect', detail: `context.date ${contextDate} vs stored ${lastModified.toISOString()}` }
}

// The ack fingerprint pins an anomaly to its exact version set: any later shadow/marker changes
// the fingerprint, so an old ack can never cover new tampering.
export const anomalyFingerprint = (anomaly: TrailAnomaly): string =>
  `${anomaly.kind}:${anomaly.key}:${[...(anomaly.versionIds ?? [])].sort().join(',')}`

export const filterAckedAnomalies = (anomalies: TrailAnomaly[], ackedFingerprints: string[]): TrailAnomaly[] => {
  const acked = new Set(ackedFingerprints)
  return anomalies.filter((a) => !acked.has(anomalyFingerprint(a)))
}

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

// Level-2 metadata restore (spec §C): compare the hot doc's *covered projection* against the
// snapshot per key, and write back only genuinely diverging keys. Comparing projections (not raw
// fields) means a field whose only difference is denormalized-name noise (owner/topics display
// names) is left untouched — normalized loss only happens where tampering actually happened.
export const restoreUpdate = (
  hot: Record<string, any>,
  snapshot: Record<string, any>
): { $set: Record<string, any>, $unset: Record<string, any> } => {
  const hotCovered = coveredMetadata(hot)
  const $set: Record<string, any> = {}
  const $unset: Record<string, any> = {}
  for (const key of Object.keys(snapshot)) {
    if (stableStringify(hotCovered[key] ?? null) !== stableStringify(snapshot[key] ?? null)) $set[key] = snapshot[key]
  }
  // covered keys present on the hot doc but absent from the snapshot were added out-of-band
  for (const key of Object.keys(hotCovered)) {
    if (!(key in snapshot)) $unset[key] = ''
  }
  return { $set, $unset }
}

// snapshots store topics as { id } only (D1 normalization); on restore, re-hydrate the display
// fields from their authoritative source (the owner's settings.topics). An id no longer present
// in settings stays bare — the same state a topic-deletion propagation would leave.
export const rehydrateTopics = (topics: Array<{ id: string }>, settingsTopics: any[]): any[] =>
  topics.map((t) => settingsTopics.find((st) => st.id === t.id) ?? t)

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
