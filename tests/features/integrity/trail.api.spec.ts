// tests/features/integrity/trail.api.spec.ts
// Round 3: the trail-coherence verdict — the check's second result, proving the revision trail
// itself was not altered. Attacks simulated with raw store credentials (shadow versions, delete
// markers): object-lock preserves the original versions, and the verdict reads that evidence.
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'
import {
  ensureIntegrityBucket, listIntegrityKeys, revisionsPrefix, waitForFlagCleared,
  waitForLinesDrained, putShadowVersion, putDeleteMarker, integrityTestStore
} from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

const latestRevisionKey = async (prefix: string): Promise<string> => {
  const keys = (await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file') && !k.includes('/lines/'))
  return keys.sort().at(-1)!
}

test('a healthy trail reports trail.status ok alongside the data verdict', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
  expect(check.trail.status).toBe('ok')
  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.lastCheck.trail.status).toBe('ok')
})

test('a shadowed revision is a confirmed version-divergence anomaly', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  // the attacker rewrites the latest revision JSON with a body of their choosing — the current
  // view now serves attacker content, but the original version survives under the lock
  const key = await latestRevisionKey(revisionsPrefix(dataset))
  const shadow = { hash: { metadata: 'attacker' }, context: { operation: 'update', origin: 'worker', date: new Date().toISOString() }, dataset: { id: dataset.id } }
  await putShadowVersion(key, shadow)

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.trail.status).toBe('altered')
  const anomaly = check.trail.anomalies.find((a: any) => a.kind === 'version-divergence')
  expect(anomaly).toBeTruthy()
  expect(anomaly.key).toBe(key)
  expect(anomaly.confidence).toBe('confirmed')

  // trail-altered surfaces in the list's error filter, like a breach
  const list = (await admin.get('/api/v1/datasets', { params: { status: 'error' } })).data
  expect(list.results.map((d: any) => d.id)).toContain(dataset.id)
})

test('a marker-hidden line anchor resurfaces: data verdict stays ok, trail says altered', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const res = await admin.post('/api/v1/datasets', {
    isRest: true, title: `trail lines ${Date.now()}`, schema: [{ key: 'attr1', type: 'string' }]
  })
  const dataset = res.data
  await admin.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ _id: 'line0', attr1: 'a' }])
  await waitForFinalize(admin, dataset.id)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForLinesDrained(admin, dataset.id)
  await waitForFlagCleared(dataset.id)

  // hide the line's anchor behind a delete marker: a current-view check would misread the line
  // as an out-of-band insert (or miss a deleted line's history entirely)
  const lineKeys = (await listIntegrityKeys(`${revisionsPrefix(dataset)}lines/`))
  expect(lineKeys.length).toBeGreaterThan(0)
  await putDeleteMarker(lineKeys[0])

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  // the anchor is recovered from the version stack: the line still verifies
  expect(check.status).toBe('ok')
  expect(check.lines.diverged).toBe(0)
  // and the hide attempt itself is the finding
  expect(check.trail.status).toBe('altered')
  const anomaly = check.trail.anomalies.find((a: any) => a.kind === 'delete-marker')
  expect(anomaly).toBeTruthy()
  expect(anomaly.key).toBe(lineKeys[0])
})

// ---------------------------------------------------------------------------------------------
// T3: terminal trail revisions (disable / delete) + the daily store-vs-Mongo scope audit
// ---------------------------------------------------------------------------------------------

test('disable ends the trail with a terminal disable revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false, reason: 'planned migration' })
  const key = await latestRevisionKey(revisionsPrefix(dataset))
  const rev = await integrityTestStore.getRevision(key)
  expect(rev.context.operation).toBe('disable')
  expect(rev.context.reason).toBe('planned migration')
  // the terminal revision re-records the current hash pair so a crash between the revision
  // write and the Mongo flip never false-breaches (the checker self-heals that residue)
  expect(rev.hash.file).toBeTruthy()
  expect(rev.hash.metadata).toBeTruthy()
})

test('deleting an enrolled dataset ends the trail with a terminal delete revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  await admin.delete(`/api/v1/datasets/${dataset.id}`)
  const key = await latestRevisionKey(revisionsPrefix(dataset))
  const rev = await integrityTestStore.getRevision(key)
  expect(rev.context.operation).toBe('delete')
})

test('the scope audit flags an out-of-band integrity.active flip (alarm-kill)', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  // the attack: a raw Mongo write flips protection off — no disable revision, sweep worklist
  // and purge carve-out would silently stand down
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': false })

  const audit = (await admin.post(`${apiUrl}/api/v1/test-env/integrity-audit/run`)).data
  const incoherent = audit.incoherent.find((s: any) => s.datasetId === dataset.id)
  expect(incoherent).toBeTruthy()

  // a legitimate disable through the API is NOT incoherent: re-enable then disable properly
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.active': true })
  await admin.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: false })
  const audit2 = (await admin.post(`${apiUrl}/api/v1/test-env/integrity-audit/run`)).data
  expect(audit2.incoherent.find((s: any) => s.datasetId === dataset.id)).toBeFalsy()
})

test('crash residue (terminal latest on an active dataset) self-heals through the check', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  // simulate a disable that crashed after the terminal revision, before the Mongo flip
  const keys = (await listIntegrityKeys(revisionsPrefix(dataset))).filter(k => !k.endsWith('.file') && !k.includes('/lines/')).sort()
  const latest = await integrityTestStore.getRevision(keys.at(-1)!)
  const nextIndex = keys.length
  const nextKey = `${revisionsPrefix(dataset)}${String(nextIndex).padStart(9, '0')}`
  await integrityTestStore.writeRevision(nextKey, {
    hash: latest.hash,
    context: { operation: 'disable', origin: 'superadmin', date: new Date().toISOString() },
    dataset: { id: dataset.id, slug: dataset.slug }
  }, new Date(Date.now() + 24 * 3600 * 1000))

  // first check: recognizes the residue, force-re-anchors, reports unknown
  const first = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(first.status).toBe('unknown')
  // second check: fresh non-terminal anchor in place, clean verdict
  const second = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(second.status).toBe('ok')
  const healedLatest = await integrityTestStore.getRevision(await latestRevisionKey(revisionsPrefix(dataset)))
  expect(healedLatest.context.operation).not.toBe('disable')
})

// ---------------------------------------------------------------------------------------------
// T4: alert robustness — realert cadence dedup map, check-stale alert
// ---------------------------------------------------------------------------------------------

test('breach alert dedup lives in integrity.alerts and clears on recovery', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  const first = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(first.status).toBe('breach')
  let raw = (await admin.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  const alertDate = raw.integrity.alerts?.['integrity-breach']
  expect(alertDate).toBeTruthy()

  // still breached, within the realert window: the dedup date does not move (no spam)
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)
  raw = (await admin.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  expect(raw.integrity.alerts['integrity-breach']).toBe(alertDate)

  // recovery clears the dedup state so a future breach alerts immediately again
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  raw = (await admin.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  expect(raw.integrity.alerts?.['integrity-breach']).toBeUndefined()
})

test('a dataset stuck without a definitive verdict fires integrity-check-stale', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)
  // enable seeded the definitive-check clock
  let raw = (await admin.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  expect(raw.integrity.lastDefinitiveCheck).toBeTruthy()

  // simulate 8 silent days (default maxUnknownDays = 7)
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.lastDefinitiveCheck': eightDaysAgo })

  const run1 = (await admin.post(`${apiUrl}/api/v1/test-env/integrity-stale/run`)).data
  expect(run1.alerted).toContain(dataset.id)
  // dedup: a second run within the realert window stays silent
  const run2 = (await admin.post(`${apiUrl}/api/v1/test-env/integrity-stale/run`)).data
  expect(run2.alerted).not.toContain(dataset.id)

  // a definitive verdict resets the clock and clears the alert
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
  raw = (await admin.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  expect(new Date(raw.integrity.lastDefinitiveCheck).getTime()).toBeGreaterThan(Date.now() - 60000)
  expect(raw.integrity.alerts?.['integrity-check-stale']).toBeUndefined()
})

// ---------------------------------------------------------------------------------------------
// T5: trail-anomaly acknowledgement — trail-recorded, fingerprint-pinned
// ---------------------------------------------------------------------------------------------

test('ack silences reviewed anomalies via a locked ackTrail revision; new tampering escapes it', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  const key = await latestRevisionKey(revisionsPrefix(dataset))
  const shadow = { hash: { metadata: 'attacker' }, context: { operation: 'update', origin: 'worker', date: new Date().toISOString() }, dataset: { id: dataset.id } }
  await putShadowVersion(key, shadow)
  const altered = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(altered.trail.status).toBe('altered')

  // no anomalies, no ack
  // (the ack targets what the fresh check surfaces — acking a clean trail is a 400)
  const acked = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/trail/_ack`, { reason: 'investigated: retry artifact' })).data
  expect(acked.trail.status).toBe('ok')

  // the ack is itself a locked, reasoned trail revision
  const revisions = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  const ackRev = revisions.results.find((r: any) => r.operation === 'ackTrail')
  expect(ackRev).toBeTruthy()
  expect(ackRev.reason).toBe('investigated: retry artifact')

  // acking a clean trail is refused
  await expect(admin.post(`/api/v1/datasets/${dataset.id}/_integrity/trail/_ack`)).rejects.toMatchObject({ status: 400 })

  // NEW tampering after the ack changes the fingerprint: it resurfaces despite the old ack
  const key2 = await latestRevisionKey(revisionsPrefix(dataset))
  await putShadowVersion(key2, { ...shadow, hash: { metadata: 'attacker2' } })
  const reAltered = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(reAltered.trail.status).toBe('altered')
})
