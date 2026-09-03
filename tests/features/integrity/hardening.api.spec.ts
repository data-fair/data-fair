// tests/features/integrity/hardening.api.spec.ts
// Pre-release hardening round 2: per-dataset locking of the synchronous admin actions, the
// orphaned-line-stamp safety net, and storage accounting of the historized store (including the
// aging-out tail of a deleted dataset).
import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'
import { ensureIntegrityBucket, integrityTestStore, waitForFlagCleared, waitForLinesDrained, integrityEndpoint } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

const ownerIntegritySize = async (owner: { type: string, id: string }): Promise<number> => {
  let size = 0
  for await (const page of integrityTestStore.iterateVersionPages(`data-fair/${owner.type}-${owner.id}/`)) {
    for (const version of page) size += version.size ?? 0
  }
  return size
}

// Store-failure injection. The store is a process-wide singleton built once from config, so these
// repoint `integrity.s3.endpoint` at a dead port and reset it. ALWAYS restore in a finally: a
// leaked bad endpoint would fail every later test in the file.
const withUnreachableStore = async (ax: any, fn: () => Promise<void>) => {
  const setEndpoint = async (value: string) => {
    await ax.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'integrity.s3.endpoint', value })
    await ax.post(`${apiUrl}/api/v1/test-env/reset-integrity-store`)
  }
  await setEndpoint('http://127.0.0.1:9')
  try {
    await fn()
  } finally {
    await setEndpoint(integrityEndpoint)
  }
}

const datasetLock = async (ax: any, datasetId: string) =>
  (await ax.get(`/api/v1/datasets/${datasetId}/_diagnose`)).data.locks?.[0]

test('enable against an unreachable store fails loudly, leaves no anchor, and RELEASES the lock', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)

  await withUnreachableStore(admin, async () => {
    // documented behaviour of enableIntegrityUnlocked: the Mongo flip lands first and the anchor
    // write is synchronous, so a store outage leaves active:true with no revision — fail-loud,
    // no compensating rollback, a later _fix retries.
    await expect(admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })).rejects.toBeTruthy()
  })

  const raw = (await admin.get(`${apiUrl}/api/v1/test-env/raw-dataset/${dataset.id}`)).data
  expect(raw.integrity?.active).toBe(true)
  expect(raw.integrity?.lastRevision).toBeFalsy()

  // THE point of this test: a failed admin action must not leave the per-dataset lock behind.
  // queryNextResourceTask matches only datasets with no `locks` row, so a leaked one excludes the
  // dataset from EVERY worker task — errorRetry included — with no way back but a manual unlock.
  expect(await datasetLock(admin, dataset.id)).toBeFalsy()

  // and the state is honestly reported rather than silently 'ok': no anchor to compare against
  const check = (await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)).data
  expect(check.status).toBe('unknown')
})

test('a check against an unreachable store reports unknown and releases the lock', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForFlagCleared(dataset.id)

  await withUnreachableStore(admin, async () => {
    // a store outage proves nothing about the data: it must never read as a breach
    await admin.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)
      .then((res: any) => expect(res.data.status).not.toBe('breach'))
      .catch((err: any) => expect(err.status).toBeGreaterThanOrEqual(500))
  })

  expect(await datasetLock(admin, dataset.id)).toBeFalsy()
})

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
