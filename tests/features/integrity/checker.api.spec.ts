// tests/features/integrity/checker.api.spec.ts
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl } from '../../support/axios.ts'
import { sendDataset, collectNotifications } from '../../support/workers.ts'
import { ensureIntegrityBucket, waitForIntegrityRevisions } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })

test('check is ok after enable, breach after out-of-band tamper, ok again after _fix re-anchors', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1) // initial anchor

  // clean check
  let check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')

  // tamper the stored file out-of-band, then check → breach + event
  const notif = await collectNotifications()
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })
  check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  const events = await notif.waitForCount(1)
  expect(events.some((e: any) => e.topic?.key?.includes('integrity-breach'))).toBe(true)

  // operator accepts the current stored bytes as legitimate → _fix re-anchors the actual file
  // (the relay hashes the stored file, so it writes a 2nd revision matching the tampered content)
  await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
  await waitForIntegrityRevisions(prefix, 2)
  check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('ok')
})

test('breach notification fires once per transition, not on every re-check', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/`

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 1)

  const notif = await collectNotifications()
  await admin.post(`${apiUrl}/api/v1/test-env/tamper-dataset-file/${dataset.id}`, { content: 'corrupted bytes' })

  // first check after tamper → breach + exactly one notification
  let check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  await notif.waitForCount(1)

  // second check while still breached → still breach, but NO new notification
  check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('breach')
  await new Promise(resolve => setTimeout(resolve, 1500)) // settle: allow a stray event to arrive
  const all = await notif.getAll()
  expect(all.filter((e: any) => e.topic?.key?.includes('integrity-breach')).length).toBe(1)
})
