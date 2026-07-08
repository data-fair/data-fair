// tests/features/integrity/metadata.api.spec.ts
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, collectNotifications, getRawDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, listIntegrityKeys, waitForIntegrityRevisions } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

const prefixes = (dataset: any) => ({
  file: `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`,
  metadata: `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/metadata/`
})

// waitForIntegrityRevisions only confirms the S3 object for one class exists; the relay may still
// be processing the other class (a single trailing mongo update unsets _needsHistorizing only once
// BOTH classes are done). checkDataset treats a still-set _needsHistorizing as "pending" ('unknown'),
// so a check run in that window would race a real verdict — wait for the flag to clear too.
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

test('enable anchors both classes; check is ok for both', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.file, 1)
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.file.status).toBe('ok')
  expect(check.metadata.status).toBe('ok')
})

test('an out-of-band covered-field write breaches metadata while file stays ok, and _fix reconciles', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  const notif = await collectNotifications()
  // test-env patch-dataset is a RAW mongo write with no outbox stamp — the exact tamper we detect
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { description: 'tampered out-of-band' })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('breach')
  expect(check.file.status).toBe('ok')
  const events = await notif.waitForCount(1)
  expect(events.some((e: any) => e.topic?.key?.includes('integrity-breach'))).toBe(true)

  // operator accepts the current doc as legitimate → _fix re-anchors it (metadata revision 1)
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  await waitForIntegrityRevisions(p.metadata, 2)
  await waitForFlagCleared(dataset.id)
  const after = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(after.metadata.status).toBe('ok')
})

test('an out-of-band write to an EXCLUDED field neither breaches nor creates a revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  await waitForFlagCleared(dataset.id)

  // status / count / errorStatus are denylisted operational fields: raw writes are expected there
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { status: 'error', errorStatus: 'oops', count: 999 })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('ok')
  expect((await listIntegrityKeys(p.metadata)).length).toBe(1)
})

test('a legitimate metadata PATCH historizes a new metadata revision (and only that)', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)
  const fileCountBefore = (await listIntegrityKeys(p.file)).length

  await admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'legitimate new description' })

  const keys = await waitForIntegrityRevisions(p.metadata, 2)
  expect(keys.length).toBe(2)
  // a metadata-only patch must not re-anchor the file class
  expect((await listIntegrityKeys(p.file)).length).toBe(fileCountBefore)
  // and the check stays clean
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('ok')
})

test('a permissions change historizes a new metadata revision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const p = prefixes(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(p.metadata, 1)

  await admin.put(`/api/v1/datasets/${dataset.id}/permissions`, [{ classes: ['list', 'read'] }])

  expect((await waitForIntegrityRevisions(p.metadata, 2)).length).toBe(2)
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.metadata.status).toBe('ok')
})
