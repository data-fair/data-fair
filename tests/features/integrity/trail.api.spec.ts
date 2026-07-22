// tests/features/integrity/trail.api.spec.ts
// Round 3: the trail-coherence verdict — the check's second result, proving the revision trail
// itself was not altered. Attacks simulated with raw store credentials (shadow versions, delete
// markers): object-lock preserves the original versions, and the verdict reads that evidence.
import { test, expect } from '@playwright/test'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'
import {
  ensureIntegrityBucket, listIntegrityKeys, revisionsPrefix, waitForFlagCleared,
  waitForLinesDrained, putShadowVersion, putDeleteMarker
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
