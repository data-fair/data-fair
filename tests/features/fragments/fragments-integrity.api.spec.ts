// A fragment's `permissions` array is a DERIVED value: the system rewrites it whenever the parent's
// ACL changes (syncFragmentPermissions). `permissions` is also integrity-covered metadata, and the
// invariant stated in api/src/integrity/operations.ts is that every writer of a covered field must
// stamp the outbox — otherwise a perfectly legitimate system write reads as a metadata tamper at the
// next check. This spec pins that the fan-out stamps.
import { test, expect } from '@playwright/test'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, waitForFlagCleared } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

test('changing the parent ACL of an integrity-enabled dataset fragment does not raise a false breach', async () => {
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)
  const virtual = (await admin.post('/api/v1/datasets', { isVirtual: true, title: 'parent of an audited fragment' })).data
  const fragment = await sendDataset('datasets/dataset1.csv', admin, {}, { partOf: { type: 'dataset', id: virtual.id } })

  // enable is synchronous: the anchor covers the fragment's derived ACL as it stands now
  await admin.put(`/api/v1/datasets/${fragment.id}/_integrity`, { active: true })
  expect((await admin.post(`/api/v1/datasets/${fragment.id}/_integrity/_check`)).data.status).toBe('ok')

  // edit the PARENT's ACL: syncFragmentPermissions rewrites the fragment's covered `permissions`
  const parentPermissions = (await admin.get(`/api/v1/datasets/${virtual.id}/permissions`)).data
  await admin.put(`/api/v1/datasets/${virtual.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['write'] }])
  const derived = (await admin.get(`/api/v1/datasets/${fragment.id}/permissions`)).data
  // the write really happened — otherwise this test could pass on a no-op
  expect(derived.some((p: any) => p.id === 'test_user3')).toBe(true)

  // the stamp must have been written with the ACL fan-out: the relay re-anchors, then the check is clean
  await waitForFlagCleared(fragment.id)
  const check = (await admin.post(`/api/v1/datasets/${fragment.id}/_integrity/_check`)).data
  expect(check.breach ?? null).toBe(null)
  expect(check.status).toBe('ok')
})
