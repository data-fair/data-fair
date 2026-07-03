import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl } from '../../support/axios.ts'
import { sendDataset, getRawDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, listIntegrityKeys, waitForIntegrityRevisions } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })

// The historize relay is discovered on the worker's periodic poll, so waitForWorkerIdle() races it.
// Wait on the actual end state instead: revision count, or the flag being cleared (dedupe no-op).
const waitForFlagCleared = async (datasetId: string, timeoutMs = 20000) => {
  const start = Date.now()
  let raw = await getRawDataset(datasetId)
  while (raw._needsHistorizing !== undefined && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    raw = await getRawDataset(datasetId)
  }
  if (raw._needsHistorizing !== undefined) throw new Error('relay did not clear _needsHistorizing within timeout')
  return raw
}

test('superadmin enable writes the initial anchor; non-admin is forbidden', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const user = await axiosAuth('test_superadmin@test.com', undefined, false) // same user, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`

  await expect(user.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })).rejects.toMatchObject({ status: 403 })

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  expect((await waitForIntegrityRevisions(prefix, 1)).length).toBe(1)

  const status = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(status.active).toBe(true)
  expect(status.lastRevision.md5).toBe(dataset.originalFile.md5)
})

test('enable is rejected on a dataset without an md5 file', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  // a REST dataset has no originalFile.md5
  const ds = (await admin.post('/api/v1/datasets', { isRest: true, title: 'rest-int', schema: [{ key: 'a', type: 'string' }] })).data
  await expect(admin.put(`/api/v1/datasets/${ds.id}/_integrity`, { active: true })).rejects.toMatchObject({ status: 400 })
})

test('_fix on an unchanged file dedupes (no spurious revision)', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  expect((await waitForIntegrityRevisions(prefix, 1)).length).toBe(1)
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  await waitForFlagCleared(dataset.id)
  // unchanged file → dedupe → still exactly one revision
  expect((await listIntegrityKeys(prefix)).length).toBe(1)
})

test('revisions endpoint lists revisions newest-first and is superadmin-only', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const user = await axiosAuth('test_superadmin@test.com', undefined, false) // same user, no adminMode
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)
  // a _fix on the unchanged file dedupes, so tamper then _fix to get a 2nd revision
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  await waitForIntegrityRevisions(prefix, 2)

  const res = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).data
  expect(res.count).toBe(2)
  expect(res.results.length).toBe(2)
  // newest first: index strictly decreasing
  expect(res.results[0].i).toBeGreaterThan(res.results[1].i)
  expect(res.results[0]).toHaveProperty('md5')
  expect(res.results[0]).toHaveProperty('operation')
  expect(res.results[0]).toHaveProperty('date')
  expect(res.results[0]).toHaveProperty('originator')

  // pagination
  const page1 = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`, { params: { size: 1, page: 1 } })).data
  expect(page1.count).toBe(2)
  expect(page1.results.length).toBe(1)
  expect(page1.results[0].i).toBe(res.results[0].i)

  // superadmin-only
  await expect(user.get(`/api/v1/datasets/${dataset.id}/_integrity/revisions`)).rejects.toMatchObject({ status: 403 })
})

test('internal historize fields are stripped from API responses', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  // set only _historizeContext (NOT _needsHistorizing, so the relay never picks it up and the doc stays stable)
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    _historizeContext: { operation: 'enable', originator: 'user:secret' }
  })
  // patch-dataset does not bump updatedAt, so drop the read-cache to force a fresh mongo read
  await admin.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
  const body = (await admin.get(`/api/v1/datasets/${dataset.id}`)).data
  expect(body._historizeContext).toBeUndefined()
  expect(body._needsHistorizing).toBeUndefined()
  // the raw doc still has it (proves the response filter did the stripping)
  const raw = await getRawDataset(dataset.id)
  expect(raw._historizeContext).toBeTruthy()
})

test('breached dataset appears under the status=error listing without changing its status', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)

  // not in error before the breach
  let list = (await admin.get('/api/v1/datasets', { params: { status: 'error', select: 'id,status,integrity' } })).data
  expect(list.results.find((d: any) => d.id === dataset.id)).toBeUndefined()

  // tamper + check → breach
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')

  // now it appears under status=error, but its real status is unchanged (finalized)
  list = (await admin.get('/api/v1/datasets', { params: { status: 'error', select: 'id,status,integrity' } })).data
  const row = list.results.find((d: any) => d.id === dataset.id)
  expect(row).toBeTruthy()
  expect(row.status).toBe('finalized')
  expect(row.integrity.lastCheck.status).toBe('breach')
})
