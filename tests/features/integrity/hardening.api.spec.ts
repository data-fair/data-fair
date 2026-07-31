// tests/features/integrity/hardening.api.spec.ts
// Pre-release hardening round 2: per-dataset locking of the synchronous admin actions, the
// orphaned-line-stamp safety net, and storage accounting of the historized store (including the
// aging-out tail of a deleted dataset).
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'
import { ensureIntegrityBucket, integrityTestStore, waitForFlagCleared, waitForLinesDrained } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

const ownerIntegritySize = async (owner: { type: string, id: string }): Promise<number> => {
  let size = 0
  for await (const page of integrityTestStore.iterateVersionPages(`data-fair/${owner.type}-${owner.id}/`)) {
    for (const version of page) size += version.size ?? 0
  }
  return size
}

test('admin actions answer 409 while the per-dataset worker lock is held', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  // simulate a busy dataset: a worker task would hold exactly this lock
  const ack = (await admin.post(`${apiUrl}/api/v1/test-env/lock/datasets:${dataset.id}`)).data.ack
  expect(ack).toBe(true)
  try {
    // dev config waits 2s for the lock, then refuses rather than racing the (simulated) relay
    await expect(admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)).rejects.toMatchObject({ status: 409 })
    await expect(admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).rejects.toMatchObject({ status: 409 })
  } finally {
    await admin.delete(`${apiUrl}/api/v1/test-env/lock/datasets:${dataset.id}`)
  }
  // lock released: the same actions succeed
  const fix = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)).data
  expect(fix.status).toBe('ok')
})

test('orphaned per-line stamps are drained via the checker net, never a false breach', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const res = await admin.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity hardening ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }]
  })
  const dataset = res.data
  await admin.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ _id: 'line0', attr1: 'a' }, { _id: 'line1', attr1: 'b' }])
  await waitForFinalize(admin, dataset.id)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForLinesDrained(admin, dataset.id)
  await waitForFlagCleared(dataset.id)

  // orphan a stamp: the line carries _needsHistorizing but the dataset-level hint is NOT set —
  // the shape left by a write racing the relay's final hint clear. Without the net the relay
  // never visits this line again and the check would read it as an out-of-band edit.
  await admin.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, {
    filter: { _id: 'line0' },
    update: { $set: { _needsHistorizing: { context: { operation: 'update', origin: 'user' } } } }
  })

  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('unknown')
  // the net re-set the hint so the relay drains the orphaned stamp on its next pass
  const raw = (await admin.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  expect(raw._needsHistorizingLines).toBe(true)
  await waitForLinesDrained(admin, dataset.id)

  const healed = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(healed.status).toBe('ok')
})

test('historized storage is metered into the owner consumption, deleted-dataset tail included', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  const owner = dataset.owner
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  const measured = (await admin.post(`${apiUrl}/api/v1/test-env/integrity-storage/run`)).data
  expect(measured.owners).toBeGreaterThanOrEqual(1)
  const size = await ownerIntegritySize(owner)
  expect(size).toBeGreaterThan(0)

  const datasetStorage = (await admin.get(`/api/v1/datasets/${dataset.id}`)).data.storage
  const limits = (await admin.get(`/api/v1/limits/${owner.type}/${owner.id}`)).data
  expect(limits.store_bytes.consumption).toBe(datasetStorage.size + size)

  // deletion: the anchors age out at retention, but until then the bytes are genuinely held —
  // they must keep counting even though the dataset no longer appears in the datasets aggregation
  await admin.delete(`/api/v1/datasets/${dataset.id}`)
  await admin.post(`${apiUrl}/api/v1/test-env/integrity-storage/run`)
  const tailSize = await ownerIntegritySize(owner)
  expect(tailSize).toBeGreaterThan(0)
  const limitsAfter = (await admin.get(`/api/v1/limits/${owner.type}/${owner.id}`)).data
  expect(limitsAfter.store_bytes.consumption).toBe(tailSize)
})
