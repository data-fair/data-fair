// tests/features/integrity/writelock.api.spec.ts
// T8 — A2 second half: the apiKey-only write lock (design doc §5.2). `integrity.writeLock:
// 'apiKey'` (absent = unlocked) is set/cleared only through the existing superadmin
// `PUT /datasets/{id}/_integrity` and enforced centrally in the permission layer
// (api/src/misc/utils/permissions.ts): a covered mutation (the `write` class, plus the
// `admin`-class mutations that change covered content or ACLs) on a locked dataset is refused
// with a 403 unless the session is authenticated with an API key. Honest framing (per the
// design): process discipline, not a threat-model extension — every legitimate write on a
// locked dataset ends up attributed to a revocable credential.
import { test, expect } from '@playwright/test'
import { axios, axiosAuth, config, directoryUrl, mockAppUrl, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize, clearRateLimiting } from '../../support/workers.ts'
import { revisionsPrefix, waitForIntegrityRevisions, waitForFlagCleared, ensureIntegrityBucket, integrityTestStore } from '../../support/integrity.ts'
import * as ops from '../../../api/src/integrity/operations.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

const restDataset = async (ax: any) => {
  const res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: `integrity writelock ${Date.now()}`,
    schema: [{ key: 'attr1', type: 'string' }]
  })
  const dataset = res.data
  await waitForFinalize(ax, dataset.id)
  return dataset
}

// ---------------------------------------------------------------------------------------------
// PUT _integrity guardrails
// ---------------------------------------------------------------------------------------------

test('writeLock is refused (400) without integrity.active', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await expect(admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { writeLock: 'apiKey' }))
    .rejects.toMatchObject({ status: 400 })
})

test('writeLock is refused (400) on a dataset referenced by an application', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  const appRes = await admin.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
  await admin.put(`/api/v1/applications/${appRes.data.id}/config`, {
    datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`, id: dataset.id }]
  })
  // syncApplications (datasets/service.ts) runs synchronously on the application config write —
  // dataset.extras.applications is fresh by the time we attempt the lock
  await expect(admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { writeLock: 'apiKey' }))
    .rejects.toMatchObject({ status: 400 })
})

// ---------------------------------------------------------------------------------------------
// Enforcement: session writes refused, API-key writes attributed and allowed, round-trip
// ---------------------------------------------------------------------------------------------

test('a locked dataset refuses a UI-session metadata PATCH (403), including a superadmin session', async () => {
  const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', axOrg)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { writeLock: 'apiKey' })

  await expect(axOrg.patch(`/api/v1/datasets/${dataset.id}`, { description: 'blocked by write lock' }))
    .rejects.toMatchObject({ status: 403 })
  // discipline applies to everyone, including a superadmin session (design §5.2) — not just the
  // org member who would otherwise hold `writeDescription` through the owner role
  await expect(admin.patch(`/api/v1/datasets/${dataset.id}`, { description: 'blocked by write lock' }))
    .rejects.toMatchObject({ status: 403 })
})

test('a locked REST dataset refuses a UI-session line write (403)', async () => {
  const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await restDataset(axOrg)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { writeLock: 'apiKey' })

  await expect(axOrg.post(`/api/v1/datasets/${dataset.id}/lines`, { attr1: 'blocked' }))
    .rejects.toMatchObject({ status: 403 })
})

test('an API-key write on a locked dataset succeeds (200) and its revision is attributed to the key', async () => {
  const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', axOrg)
  const prefix = revisionsPrefix(dataset)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await waitForIntegrityRevisions(prefix, 2) // rev0 JSON + .file (enable)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { writeLock: 'apiKey' })

  const settingsRes = await axOrg.put('/api/v1/settings/organization/test_org1', {
    apiKeys: [{ title: 'writelock-key', scopes: ['datasets'] }]
  })
  const apiKey = settingsRes.data.apiKeys[0]
  const axApiKey = axios({ headers: { 'x-apiKey': apiKey.clearKey } })

  const res = await axApiKey.patch(`/api/v1/datasets/${dataset.id}`, { description: 'allowed by api key' })
  expect(res.status).toBe(200)
  await waitForIntegrityRevisions(prefix, 3)
  await waitForFlagCleared(dataset.id)

  const who1 = await integrityTestStore.getWho(ops.whoKey(dataset.owner, dataset.id, 1))
  expect(who1.apiKey?.id).toBe(apiKey.id)
})

test('lock/unlock round-trip: unlocking restores UI-session write access', async () => {
  const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', axOrg)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { writeLock: 'apiKey' })
  expect((await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.writeLock).toBe('apiKey')
  await expect(axOrg.patch(`/api/v1/datasets/${dataset.id}`, { description: 'still locked' }))
    .rejects.toMatchObject({ status: 403 })

  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { writeLock: null })
  expect((await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.writeLock).toBeUndefined()
  const res = await axOrg.patch(`/api/v1/datasets/${dataset.id}`, { description: 'unlocked again' })
  expect(res.status).toBe(200)
})

// ---------------------------------------------------------------------------------------------
// Application-key writes: refused too (they are un-connected pseudo-sessions, not API keys).
// The refusal at lock-time (above) only inspects the dataset's OWN configuration surface
// (extras.applications) at the moment the lock is set — it does not retroactively forbid an
// application from starting to reference the dataset afterwards. This test locks the dataset
// while unreferenced, then attaches an application + key, mirroring the anonymous-write flow
// covered in tests/features/auth/api-keys.api.spec.ts ("Use an application key to post lines").
// ---------------------------------------------------------------------------------------------

test('an application-key write on a locked dataset is refused (403)', async () => {
  const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const anonymous = axios()
  const dataset = await restDataset(axOrg)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { writeLock: 'apiKey' })

  const appRes = await axOrg.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
  const appId = appRes.data.id
  await axOrg.put(`/api/v1/applications/${appId}/config`, {
    datasets: [{
      href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`,
      applicationKeyPermissions: { operations: ['createLine'] }
    }]
  })
  const keysRes = await axOrg.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
  const key = keysRes.data[0].id

  const anonymousToken = (await anonymous.get(directoryUrl + '/api/auth/anonymous-action')).data
  await clearRateLimiting()
  await new Promise((resolve) => setTimeout(resolve, 2000)) // let the anonymous token age past the anti-spam floor

  await expect(anonymous.post(`/api/v1/datasets/${dataset.id}/lines`, {}, {
    headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken }
  })).rejects.toMatchObject({ status: 403 })
})

// ---------------------------------------------------------------------------------------------
// The dataset `integrity` field is server-managed (readOnly in the public schema, absent from
// the patch-req whitelist in api/doc/datasets/patch-req/schema.js) — a normal PATCH cannot set
// `integrity.writeLock`, whether or not integrity is active.
// ---------------------------------------------------------------------------------------------

test('a normal PATCH cannot set integrity.writeLock (server-managed field)', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', admin)
  await admin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })

  await expect(admin.patch(`/api/v1/datasets/${dataset.id}`, { integrity: { active: true, writeLock: 'apiKey' } }))
    .rejects.toMatchObject({ status: 400 })

  expect((await admin.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data.writeLock).toBeUndefined()
})
