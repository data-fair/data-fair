import { test, expect } from '@playwright/test'
import * as ops from '../../../api/src/integrity/operations.ts'
import datasetSchema from '../../../api/types/dataset/schema.js'

const owner = { type: 'organization', id: 'acme' }

test('padIndex zero-pads to width 9', () => {
  expect(ops.padIndex(0)).toBe('000000000')
  expect(ops.padIndex(42)).toBe('000000042')
})

test('revisionPrefix and revisionKey follow the joint-anchor layout', () => {
  expect(ops.revisionPrefix(owner, 'ds1')).toBe('data-fair/organization-acme/ds1/')
  expect(ops.revisionKey(owner, 'ds1', 7)).toBe('data-fair/organization-acme/ds1/000000007')
})

test('parseRevisionIndex extracts from a key', () => {
  expect(ops.parseRevisionIndex('data-fair/organization-acme/ds1/000000007')).toBe(7)
})

test('nextIndex returns 0 for an empty store and max+1 otherwise', () => {
  expect(ops.nextIndex([])).toBe(0)
  expect(ops.nextIndex([
    'data-fair/organization-acme/ds1/000000000',
    'data-fair/organization-acme/ds1/000000002'
  ])).toBe(3)
})

test('latestKey returns the highest-index key via lexical sort', () => {
  expect(ops.latestKey([])).toBeUndefined()
  expect(ops.latestKey([
    'data-fair/organization-acme/ds1/000000002',
    'data-fair/organization-acme/ds1/000000010',
    'data-fair/organization-acme/ds1/000000009'
  ])).toBe('data-fair/organization-acme/ds1/000000010')
})

test('needsRenewal is false without a retainUntil and while the lock is fresh', () => {
  const now = Date.parse('2026-07-06T00:00:00.000Z')
  const day = 24 * 3600 * 1000
  expect(ops.needsRenewal(undefined, now, 365)).toBe(false)
  // a fresh 1-year lock: age ~0 → not due
  expect(ops.needsRenewal(new Date(now + 365 * day).toISOString(), now, 365)).toBe(false)
})

test('needsRenewal triggers once the lock is older than RENEW_INTERVAL of the window', () => {
  const now = Date.parse('2026-07-06T00:00:00.000Z')
  const day = 24 * 3600 * 1000
  // 1-year window, RENEW_INTERVAL = 1/12 → due when age > ~30.4d, i.e. remaining < ~334.6d
  expect(ops.needsRenewal(new Date(now + 334 * day).toISOString(), now, 365)).toBe(true)  // age ~31d
  expect(ops.needsRenewal(new Date(now + 336 * day).toISOString(), now, 365)).toBe(false) // age ~29d
})

test('needsRenewal scales to a 1-day (dev/test) window', () => {
  const now = Date.parse('2026-07-06T00:00:00.000Z')
  const hour = 3600 * 1000
  // 1-day window → due when age > 2h, i.e. remaining < 22h
  expect(ops.needsRenewal(new Date(now + 21 * hour).toISOString(), now, 1)).toBe(true)
  expect(ops.needsRenewal(new Date(now + 23 * hour).toISOString(), now, 1)).toBe(false)
})

test('coveredMetadata drops underscore fields and the operational denylist', () => {
  const doc = {
    id: 'ds1',
    title: 'T',
    schema: [{ key: 'a' }],
    permissions: [],
    topics: [{ id: 't1' }],
    status: 'finalized',
    draft: { title: 'D' },
    integrity: { active: true },
    count: 12,
    storage: { size: 1 },
    esWarning: 'w',
    finalizedAt: 'x',
    dataUpdatedAt: 'x',
    dataUpdatedBy: 'u',
    updatedAt: 'x',
    updatedBy: { id: 'u' },
    createdBy: { id: 'u' },
    errorStatus: 'e',
    errorRetry: 'x',
    loaded: {},
    descendants: [],
    _id: 'mongo',
    _needsHistorizing: { classes: ['metadata'] },
    _partialRestStatus: 'indexed'
  }
  expect(ops.coveredMetadata(doc)).toEqual({ id: 'ds1', title: 'T', schema: [{ key: 'a' }], permissions: [], topics: [{ id: 't1' }] })
})

test('coveredMetadata strips worker-maintained churn nested in covered fields', () => {
  const doc = {
    id: 'ds1',
    extensions: [{
      type: 'remoteService',
      remoteService: 'r',
      action: 'a',
      needsUpdate: true,
      nextUpdate: 'x',
      autoUpdate: { active: true }
    }],
    rest: {
      ttl: { active: true, checkedAt: 'x', delay: { value: 1, unit: 'days' } },
      history: false
    },
    extras: { applications: [{ id: 'app1' }], custom: 'kept' }
  }
  expect(ops.coveredMetadata(doc)).toEqual({
    id: 'ds1',
    extensions: [{
      type: 'remoteService',
      remoteService: 'r',
      action: 'a',
      autoUpdate: { active: true }
    }],
    rest: {
      ttl: { active: true, delay: { value: 1, unit: 'days' } },
      history: false
    },
    extras: { custom: 'kept' }
  })
})

test('metadataHash is stable across key order and volatile-field changes', () => {
  const a = { id: 'ds1', title: 'T', schema: [{ key: 'a', type: 'string' }] }
  const b = { schema: [{ type: 'string', key: 'a' }], title: 'T', id: 'ds1', status: 'error', _partialRestStatus: 'indexed' }
  expect(ops.metadataHash(a)).toBe(ops.metadataHash(b))
  expect(ops.metadataHash(a)).toMatch(/^[0-9a-f]{64}$/)
  expect(ops.metadataHash({ ...a, title: 'changed' })).not.toBe(ops.metadataHash(a))
})

test('coveredPatchKeys keeps only covered top-level keys', () => {
  expect(ops.coveredPatchKeys({ title: 'T', status: 'indexed', updatedAt: 'x', _needsHistorizing: { classes: [] }, schema: [] }))
    .toEqual(['title', 'schema'])
  expect(ops.coveredPatchKeys({ status: 'error', errorStatus: 'e', count: 1 })).toEqual([])
})

test('stampHistorize sets the outbox sub-doc, with and without context', () => {
  const update: any = { $set: { permissions: [] } }
  ops.stampHistorize(update, { operation: 'update', origin: 'user' })
  expect(update).toEqual({
    $set: { permissions: [], _needsHistorizing: { context: { operation: 'update', origin: 'user' } } }
  })
  const bare: any = {}
  ops.stampHistorize(bare)
  expect(bare).toEqual({ $set: { _needsHistorizing: {} } })
})

test('coveredMetadata strips denormalized display names (owner, topics, permissions, shareOrgs)', () => {
  const doc = {
    id: 'ds1',
    owner: { type: 'organization', id: 'acme', name: 'ACME Corp', department: 'dep1', departmentName: 'Dept One' },
    topics: [{ id: 't1', title: 'Topic One', color: '#f00', icon: { name: 'x', svgPath: 'y' } }],
    permissions: [{ type: 'user', id: 'u1', name: 'User One', classes: ['read'] }],
    masterData: { shareOrgs: [{ id: 'o2', name: 'Org Two' }], other: 'kept' }
  }
  expect(ops.coveredMetadata(doc)).toEqual({
    id: 'ds1',
    owner: { type: 'organization', id: 'acme', department: 'dep1' },
    topics: [{ id: 't1' }],
    permissions: [{ type: 'user', id: 'u1', classes: ['read'] }],
    masterData: { shareOrgs: [{ id: 'o2' }], other: 'kept' }
  })
})

test('metadataHash is stable across a pure display-name rename', () => {
  const base = { id: 'ds1', owner: { type: 'organization', id: 'acme', name: 'Old Name' }, topics: [{ id: 't1', title: 'Old' }] }
  const renamed = { id: 'ds1', owner: { type: 'organization', id: 'acme', name: 'New Name' }, topics: [{ id: 't1', title: 'New' }] }
  expect(ops.metadataHash(base)).toBe(ops.metadataHash(renamed))
  // but an owner-identity change (the id, not the name) changes the hash
  const moved = { ...base, owner: { type: 'organization', id: 'other', name: 'Old Name' } }
  expect(ops.metadataHash(base)).not.toBe(ops.metadataHash(moved))
})

test('coveredMetadata strips readApiKey renewal churn but keeps active/interval', () => {
  const base = {
    id: 'ds1',
    readApiKey: { active: true, interval: 'P1M', expiresAt: '2026-07-01T00:00:00.000Z', renewAt: '2026-06-15T00:00:00.000Z' }
  }
  const renewed = {
    id: 'ds1',
    readApiKey: { active: true, interval: 'P1M', expiresAt: '2026-08-01T00:00:00.000Z', renewAt: '2026-07-15T00:00:00.000Z' }
  }
  expect(ops.coveredMetadata(base)).toEqual({ id: 'ds1', readApiKey: { active: true, interval: 'P1M' } })
  // hash stable across expiresAt/renewAt-only changes (the renewApiKey worker's churn)
  expect(ops.metadataHash(base)).toBe(ops.metadataHash(renewed))
  // but sensitive to an actual active flip
  const disabled = { id: 'ds1', readApiKey: { ...base.readApiKey, active: false } }
  expect(ops.metadataHash(base)).not.toBe(ops.metadataHash(disabled))
})

test('payloadKey appends the .file suffix to the revision key', () => {
  expect(ops.payloadKey(owner, 'ds1', 7)).toBe('data-fair/organization-acme/ds1/000000007.file')
  expect(ops.isPayloadKey('data-fair/organization-acme/ds1/000000007.file')).toBe(true)
  expect(ops.isPayloadKey('data-fair/organization-acme/ds1/000000007')).toBe(false)
})

test('latestKey and nextIndex ignore payload keys', () => {
  const keys = [
    'data-fair/organization-acme/ds1/000000000',
    'data-fair/organization-acme/ds1/000000001',
    'data-fair/organization-acme/ds1/000000001.file'
  ]
  expect(ops.latestKey(keys)).toBe('data-fair/organization-acme/ds1/000000001')
  expect(ops.nextIndex(keys)).toBe(2)
})

test('whoKey appends the .who suffix; isSiblingKey covers both .file and .who', () => {
  expect(ops.whoKey(owner, 'ds1', 7)).toBe('data-fair/organization-acme/ds1/000000007.who')
  expect(ops.isSiblingKey('data-fair/organization-acme/ds1/000000007.who')).toBe(true)
  expect(ops.isSiblingKey('data-fair/organization-acme/ds1/000000007.file')).toBe(true)
  expect(ops.isSiblingKey('data-fair/organization-acme/ds1/000000007')).toBe(false)
})

test('latestKey and nextIndex ignore .who keys too', () => {
  const keys = [
    'data-fair/organization-acme/ds1/000000000',
    'data-fair/organization-acme/ds1/000000001',
    'data-fair/organization-acme/ds1/000000001.who',
    'data-fair/organization-acme/ds1/000000001.file'
  ]
  expect(ops.latestKey(keys)).toBe('data-fair/organization-acme/ds1/000000001')
  expect(ops.nextIndex(keys)).toBe(2)
})

test('a lone ‹i›.who key must never win latest, even though it sorts lexically after its revision', () => {
  const keys = [
    'data-fair/organization-acme/ds1/000000001',
    // orphan who for a revision write that has not landed yet (or never will, crash residue)
    'data-fair/organization-acme/ds1/000000002.who'
  ]
  expect(ops.latestKey(keys)).toBe('data-fair/organization-acme/ds1/000000001')
  expect(ops.nextIndex(keys)).toBe(2)
})

// ---------------------------------------------------------------------------------------------
// T5: purge per-suffix retention — the `.who` sibling's own (shorter) window must drive both the
// purge's age pre-filter and the scope watermark floor, or a lapsed `.who` stays "provably young"
// until the (longer) revision horizon, silently breaking the shorter GDPR-bounded promise.
// ---------------------------------------------------------------------------------------------

test('retentionMsFor: the attribution window for `.who` keys, the revision window for everything else', () => {
  const retentionMs = 2 * 24 * 3600 * 1000
  const attributionMs = 1 * 24 * 3600 * 1000
  expect(ops.retentionMsFor('data-fair/organization-acme/ds1/000000007.who', retentionMs, attributionMs)).toBe(attributionMs)
  expect(ops.retentionMsFor('data-fair/organization-acme/ds1/000000007', retentionMs, attributionMs)).toBe(retentionMs)
  // `.file` is NOT `.who`: it shares the revision's own (longer) window, the deliberate asymmetry
  expect(ops.retentionMsFor('data-fair/organization-acme/ds1/000000007.file', retentionMs, attributionMs)).toBe(retentionMs)
  // line-level `.who` keys use the same suffix rule
  expect(ops.retentionMsFor('data-fair/organization-acme/ds1/lines/l1/0000000000000000-abc.who', retentionMs, attributionMs)).toBe(attributionMs)
})

test('scopeWatermarkFloor: the shorter of the two windows, since a fresh `.who` ages out sooner than a fresh revision', () => {
  const now = Date.parse('2026-07-06T00:00:00.000Z')
  const retentionMs = 2 * 24 * 3600 * 1000
  const attributionMs = 1 * 24 * 3600 * 1000
  expect(ops.scopeWatermarkFloor(now, retentionMs, attributionMs)).toBe(now + attributionMs)
  // when attribution is (unusually) configured longer than the revision window, still the min
  expect(ops.scopeWatermarkFloor(now, attributionMs, retentionMs)).toBe(now + attributionMs)
})

test('buildWho nests raw parts into a WhoBody, stamping the given date', () => {
  const date = '2026-07-22T00:00:00.000Z'
  expect(ops.buildWho({ userId: 'u1', apiKeyId: 'k1', ip: '203.0.113.7', country: 'FR', asn: 3215, asnOrg: 'Orange' }, date))
    .toEqual({ date, user: { id: 'u1' }, apiKey: { id: 'k1' }, ip: '203.0.113.7', geo: { country: 'FR', asn: 3215, asnOrg: 'Orange' } })
})

test('buildWho drops the reverse-proxy neutral fillers (country XX / asn 0 / asnOrg Unknown)', () => {
  const date = '2026-07-22T00:00:00.000Z'
  expect(ops.buildWho({ userId: 'u1', country: 'XX', asn: 0, asnOrg: 'Unknown' }, date)).toEqual({ date, user: { id: 'u1' } })
  expect(ops.buildWho({ userId: 'u1', asn: '0' }, date)).toEqual({ date, user: { id: 'u1' } })
  // a real asn alongside a filler country: geo is still built, just without the filler field
  expect(ops.buildWho({ userId: 'u1', country: 'XX', asn: 3215 }, date)).toEqual({ date, user: { id: 'u1' }, geo: { asn: 3215 } })
})

test('buildWho drops unvalidated proxy geo headers (no enriching haproxy L1 to trust)', () => {
  const date = '2026-07-22T00:00:00.000Z'
  // oversized asnOrg dropped (not truncated) — geo still built from the other fields
  const oversizedOrg = 'a'.repeat(201)
  expect(ops.buildWho({ userId: 'u1', country: 'FR', asn: 3215, asnOrg: oversizedOrg }, date))
    .toEqual({ date, user: { id: 'u1' }, geo: { country: 'FR', asn: 3215 } })
  // an asnOrg right at the boundary is kept
  const boundaryOrg = 'a'.repeat(200)
  expect(ops.buildWho({ userId: 'u1', asnOrg: boundaryOrg }, date))
    .toEqual({ date, user: { id: 'u1' }, geo: { asnOrg: boundaryOrg } })
  // lowercase, 3-letter, and injection-shaped country values are all dropped
  expect(ops.buildWho({ userId: 'u1', country: 'fr' }, date)).toEqual({ date, user: { id: 'u1' } })
  expect(ops.buildWho({ userId: 'u1', country: 'FRA' }, date)).toEqual({ date, user: { id: 'u1' } })
  expect(ops.buildWho({ userId: 'u1', country: '<script>' }, date)).toEqual({ date, user: { id: 'u1' } })
  // a valid alpha-2 code is kept
  expect(ops.buildWho({ userId: 'u1', country: 'FR' }, date)).toEqual({ date, user: { id: 'u1' }, geo: { country: 'FR' } })
})

test('buildWho skips the readApiKey pseudo-user id', () => {
  const date = '2026-07-22T00:00:00.000Z'
  expect(ops.buildWho({ userId: 'readApiKey', ip: '203.0.113.7' }, date)).toEqual({ date, ip: '203.0.113.7' })
})

test('buildWho returns undefined when nothing attributable remains', () => {
  const date = '2026-07-22T00:00:00.000Z'
  expect(ops.buildWho({}, date)).toBeUndefined()
  expect(ops.buildWho({ userId: 'readApiKey', country: 'XX', asn: 0, asnOrg: 'Unknown' }, date)).toBeUndefined()
})

test('restoreUpdate writes only diverging covered keys and unsets extra ones', () => {
  const snapshot = { title: 'legit', description: 'legit desc', owner: { type: 'organization', id: 'acme' } }
  const hot = {
    title: 'tampered',
    description: 'legit desc',
    injected: 'evil',
    status: 'finalized', // denylisted: must never be touched
    owner: { type: 'organization', id: 'acme', name: 'Acme Corp' } // normalizes to snapshot → untouched
  }
  const { $set, $unset } = ops.restoreUpdate(hot, snapshot)
  expect($set).toEqual({ title: 'legit' }) // description equal → skipped; owner equal after normalization → skipped
  expect($unset).toEqual({ injected: '' })
})

test('restoreUpdate restores a tampered owner as its normalized form', () => {
  const snapshot = { owner: { type: 'organization', id: 'acme' } }
  const hot = { owner: { type: 'organization', id: 'evil', name: 'Evil' } }
  expect(ops.restoreUpdate(hot, snapshot).$set.owner).toEqual({ type: 'organization', id: 'acme' })
})

test('rehydrateTopics fills titles back from settings, keeps unknown ids bare', () => {
  const settingsTopics = [{ id: 't1', title: 'Topic 1', color: '#f00' }]
  expect(ops.rehydrateTopics([{ id: 't1' }, { id: 'gone' }], settingsTopics))
    .toEqual([{ id: 't1', title: 'Topic 1', color: '#f00' }, { id: 'gone' }])
})

test('parseOwnerPrefix splits the owner segment on its first dash (ids may contain dashes)', () => {
  expect(ops.parseOwnerPrefix('data-fair/organization-acme/')).toEqual({ type: 'organization', id: 'acme' })
  expect(ops.parseOwnerPrefix('data-fair/user-jean-pierre')).toEqual({ type: 'user', id: 'jean-pierre' })
})

test('parseOwnerPrefix refuses malformed segments (foreign objects in the bucket)', () => {
  expect(ops.parseOwnerPrefix('other-service/organization-acme/')).toBeUndefined()
  expect(ops.parseOwnerPrefix('data-fair/no-dash-type/deeper/')).toBeUndefined()
  expect(ops.parseOwnerPrefix('data-fair/nodash/')).toBeUndefined()
  expect(ops.parseOwnerPrefix('data-fair/organization-/')).toBeUndefined()
  expect(ops.parseOwnerPrefix('data-fair/-acme/')).toBeUndefined()
})

// ---------------------------------------------------------------------------------------------
// Round 3 (trail coherence): pure fold over version listings — reconstructed current view +
// anomaly classification, sequence gaps, date skew, ack fingerprints.
// ---------------------------------------------------------------------------------------------

const v = (key: string, versionId: string, opts: Partial<ops.TrailVersionEntry> = {}): ops.TrailVersionEntry =>
  ({ key, versionId, size: 100, etag: 'aaa', lastModified: new Date('2026-07-01T00:00:00Z'), ...opts })

const foldAll = (entries: ops.TrailVersionEntry[]) => {
  const acc = ops.newTrailFold()
  ops.foldTrailVersions(acc, entries)
  return ops.finishTrailFold(acc)
}

test('trail fold: single version per key → clean current view, no anomalies', () => {
  const { current, anomalies } = foldAll([v('p/000000000', 'v1'), v('p/000000001', 'v2')])
  expect(anomalies).toEqual([])
  expect([...current.keys()]).toEqual(['p/000000000', 'p/000000001'])
  expect(current.get('p/000000000')!.versionId).toBe('v1')
})

test('trail fold: a delete marker is an anomaly and the hidden key resurfaces', () => {
  const { current, anomalies } = foldAll([
    v('p/000000000', 'v1'),
    { key: 'p/000000000', versionId: 'm1', deleteMarker: true }
  ])
  expect(current.get('p/000000000')!.versionId).toBe('v1') // resurfaced, not hidden
  expect(anomalies).toHaveLength(1)
  expect(anomalies[0]).toMatchObject({ kind: 'delete-marker', key: 'p/000000000', confidence: 'confirmed', versionIds: ['m1'] })
})

test('trail fold: byte-identical retry duplicates are benign, newest version wins', () => {
  // S3 lists versions newest-first within a key; the fold keeps that order
  const { current, anomalies } = foldAll([v('p/000000000', 'newer'), v('p/000000000', 'older')])
  expect(anomalies).toEqual([])
  expect(current.get('p/000000000')!.versionId).toBe('newer')
})

test('trail fold: differing versions of the same key are a confirmed rewrite anomaly', () => {
  const { anomalies } = foldAll([
    v('p/000000000', 'shadow', { etag: 'bbb' }),
    v('p/000000000', 'original')
  ])
  expect(anomalies).toHaveLength(1)
  expect(anomalies[0]).toMatchObject({ kind: 'version-divergence', key: 'p/000000000', confidence: 'confirmed' })
  expect(anomalies[0].versionIds!.sort()).toEqual(['original', 'shadow'])
})

test('trail fold: groups a key straddling a page boundary', () => {
  const acc = ops.newTrailFold()
  ops.foldTrailVersions(acc, [v('p/000000000', 'shadow', { size: 999 })])
  ops.foldTrailVersions(acc, [v('p/000000000', 'original')])
  const { anomalies } = ops.finishTrailFold(acc)
  expect(anomalies).toHaveLength(1)
  expect(anomalies[0].kind).toBe('version-divergence')
})

test('sequence gaps: mid-sequence holes are suspect, tail truncation is not', () => {
  // purge removes a prefix of the sequence (locks lapse in write order): [3..6] with 0-2 gone is normal
  expect(ops.sequenceGapAnomalies('p/', [3, 4, 5, 6])).toEqual([])
  const anomalies = ops.sequenceGapAnomalies('p/', [3, 4, 7, 8])
  expect(anomalies).toHaveLength(1)
  expect(anomalies[0]).toMatchObject({ kind: 'sequence-gap', confidence: 'suspect' })
  expect(anomalies[0].detail).toContain('5')
  expect(anomalies[0].detail).toContain('6')
})

test('date skew: within tolerance is fine, beyond is a suspect anomaly', () => {
  const written = new Date('2026-07-01T12:00:00Z')
  expect(ops.dateSkewAnomaly('p/000000003', '2026-07-01T11:00:00Z', written, 48 * 3600 * 1000)).toBeUndefined()
  const anomaly = ops.dateSkewAnomaly('p/000000003', '2026-06-25T12:00:00Z', written, 48 * 3600 * 1000)
  expect(anomaly).toMatchObject({ kind: 'date-skew', key: 'p/000000003', confidence: 'suspect' })
})

test('ack fingerprints cover an anomaly exactly, new versions escape an old ack', () => {
  const shadow: ops.TrailAnomaly = { kind: 'version-divergence', key: 'p/000000000', confidence: 'confirmed', versionIds: ['original', 'shadow'] }
  const fp = ops.anomalyFingerprint(shadow)
  expect(ops.filterAckedAnomalies([shadow], [fp])).toEqual([])
  // a NEW shadow version after the ack changes the fingerprint → resurfaces
  const reShadow = { ...shadow, versionIds: ['original', 'shadow', 'shadow2'] }
  expect(ops.filterAckedAnomalies([reShadow], [fp])).toEqual([reShadow])
})

test('shouldNotify: alerts on entry, re-alerts only past the window, silent when good', () => {
  const day = 24 * 3600 * 1000
  const now = Date.parse('2026-07-22T00:00:00Z')
  expect(ops.shouldNotify(false, undefined, 7, now)).toBe(false)
  expect(ops.shouldNotify(true, undefined, 7, now)).toBe(true)
  // alerted yesterday: within the window, no spam
  expect(ops.shouldNotify(true, new Date(now - day).toISOString(), 7, now)).toBe(false)
  // alerted 8 days ago and still bad: re-alert (bounds the pre-written-state suppression attack)
  expect(ops.shouldNotify(true, new Date(now - 8 * day).toISOString(), 7, now)).toBe(true)
})

// ---------------------------------------------------------------------------------------------
// Classification ratchet: every top-level dataset-schema property must be consciously classified
// for integrity coverage. This test FAILING on a new property is the point — decide, then list it:
//   - meaningful metadata a tamper should be detected on → add it to COVERED below, and make
//     sure every writer of it stamps the outbox (or goes through applyPatch's coveredPatchKeys
//     gate), or organic writes will false-breach;
//   - worker-maintained churn / derived bookkeeping → add it to EXCLUDED_TOP_LEVEL in
//     api/src/integrity/operations.ts, accepting that tampering with it is NOT detected.
// Never let a field land in neither list "for now": covered-by-default + an unstamped writer is
// a false-breach generator, and silently excluding is a coverage hole nobody decided.
// ---------------------------------------------------------------------------------------------

const COVERED_TOP_LEVEL = [
  'id', 'slug', 'href', 'page', 'title', 'summary', 'description', 'image', 'spatial', 'temporal',
  'keywords', 'frequency', 'creator', 'modified', 'visibility', 'file', 'originalFile',
  'attachments', 'createdAt', 'owner', 'primaryKey', 'schema', 'bbox', 'timePeriod', 'timeZone',
  'projection', 'conformsTo', 'license', 'origin', 'constraints', 'extensions', 'masterData',
  'publications', 'publicationSites', 'requestedPublicationSites', 'hasFiles',
  'attachmentsAsImage', 'isVirtual', 'virtual', 'isRest', 'rest', 'isMetaOnly', 'topics',
  'relatedDatasets', 'thumbnails', 'extras', 'customMetadata', 'analysis', 'permissions',
  'previews', 'readApiKey', 'draftReason', 'nonBlockingValidation'
]

test('every dataset-schema property is consciously classified for integrity coverage', () => {
  const schemaKeys = Object.keys((datasetSchema as any).properties).filter((k) => !k.startsWith('_'))
  const unclassified = schemaKeys.filter((k) => !COVERED_TOP_LEVEL.includes(k) && !ops.EXCLUDED_TOP_LEVEL.has(k))
  expect(unclassified, `new dataset propert${unclassified.length > 1 ? 'ies' : 'y'} [${unclassified.join(', ')}] must be classified for integrity coverage — read the comment above this test`).toEqual([])
  const doubleClassified = COVERED_TOP_LEVEL.filter((k) => ops.EXCLUDED_TOP_LEVEL.has(k))
  expect(doubleClassified).toEqual([])
  // the classification matches what coveredPatchKeys actually does
  for (const key of schemaKeys) {
    const covered = ops.coveredPatchKeys({ [key]: 'x' }).length === 1
    expect(covered, `${key} classification drifted from coveredPatchKeys`).toBe(COVERED_TOP_LEVEL.includes(key))
  }
})
