import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, waitForIntegrityRevisions, integrityTestStore } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
// reset test-owned datasets + limit counters before each test (the shared suite convention); the
// integrity specs all run as the single test_superadmin, so without this their datasets accumulate
// and hit the dev nbDatasets quota. clean() spares dev_fixtures (owner.id !~ /^test_/).
test.beforeEach(async () => { await clean() })

// poll until fn() returns a truthy value (the relay writes the S3 object then updates mongo
// lastRevision a moment later, so waiting on the revision alone can race the mongo write)
const pollFor = async <T>(fn: () => Promise<T>, timeoutMs = 15000): Promise<T | undefined> => {
  const start = Date.now()
  let v = await fn()
  while (!v && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    v = await fn()
  }
  return v
}

test('the relay persists the anchor retain-until on integrity.lastRevision', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)

  const retainUntil = await pollFor(async () =>
    (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.file?.lastRevision?.retainUntil as string | undefined)
  expect(retainUntil).toBeTruthy()
  // dev/test retention is 1 day → ~23–25h out
  const remainingH = (new Date(retainUntil!).getTime() - Date.now()) / 3600000
  expect(remainingH).toBeGreaterThan(22)
  expect(remainingH).toBeLessThan(26)
})

// helper: enable integrity on a fresh dataset and wait until lastRevision.retainUntil is persisted
const enabledDataset = async (admin: any) => {
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)
  await pollFor(async () => (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.file?.lastRevision?.retainUntil)
  return { dataset, prefix, latestKey: `${prefix}000000000` }
}

test('a due anchor is renewed on check: retain-until advances and lastRenewal is ok', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset } = await enabledDataset(admin)

  // force the persisted anchor to look old (due): retain-until ~1h out (< 22h)
  const soon = new Date(Date.now() + 3600 * 1000).toISOString()
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.file.lastRevision.retainUntil': soon })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.file.status).toBe('ok')

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  // pushed back to ~ now + 1 day, well beyond the patched 1h
  expect((new Date(state.file.lastRevision.retainUntil).getTime() - Date.now()) / 3600000).toBeGreaterThan(22)
  expect(state.file.lastRenewal?.status).toBe('ok')
})

test('a fresh anchor is not renewed by a check', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset } = await enabledDataset(admin)
  const before = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.file.lastRevision.retainUntil

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.file.status).toBe('ok')

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.file.lastRevision.retainUntil).toBe(before) // unchanged: not due
  expect(state.file.lastRenewal).toBeUndefined()
})

test('a breached check does not renew the lock', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset } = await enabledDataset(admin)

  // due + tampered
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.file.lastRevision.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString() })
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.file.status).toBe('breach')

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.file.lastRenewal?.status).not.toBe('ok') // renewal skipped on breach
  // retain-until stays the patched near-now value (not pushed forward)
  expect((new Date(state.file.lastRevision.retainUntil).getTime() - Date.now()) / 3600000).toBeLessThan(2)
})

test('a failed lock extension is recorded as lastRenewal.failed and does not fail the check', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const { dataset, latestKey } = await enabledDataset(admin)

  // push the REAL S3 lock far into the future so a normal extend (~now+1day) would be a
  // forbidden shortening → the provider rejects it → the checker records a failure
  await integrityTestStore.extendRetention(latestKey, new Date(Date.now() + 10 * 24 * 3600 * 1000))
  // make the persisted mirror look due
  await admin.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.file.lastRevision.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString() })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.file.status).toBe('ok') // a renewal failure does not fail the integrity check

  const state = (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
  expect(state.file.lastRenewal?.status).toBe('failed')
  // the real lock is untouched (extend was rejected)
  const got = await integrityTestStore.getRetention(latestKey)
  expect((got!.getTime() - Date.now()) / (24 * 3600000)).toBeGreaterThan(9)
})
