import { test, expect } from '@playwright/test'
import { axiosAuth } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, waitForIntegrityRevisions } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })

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
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)

  const retainUntil = await pollFor(async () =>
    (await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.lastRevision?.retainUntil as string | undefined)
  expect(retainUntil).toBeTruthy()
  // dev/test retention is 1 day → ~23–25h out
  const remainingH = (new Date(retainUntil!).getTime() - Date.now()) / 3600000
  expect(remainingH).toBeGreaterThan(22)
  expect(remainingH).toBeLessThan(26)
})
