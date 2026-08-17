import { test } from '@playwright/test'
import assert from 'node:assert'
import { axiosAuth, clean } from '../../support/axios.ts'

test.afterAll(clean)

// Fixtures from dev/resources/organizations.json, organization test_org1:
//   test_user1  admin, no department      -> allowed to use the recap
//   test_user5  contrib, no department    -> must get a 403
//   test_user4  admin of department dep1  -> must get a 403 (department admins excluded)
// Departments of test_org1: dep1, dep2.
const adminEmail = 'test_user1@test.com'
const contribEmail = 'test_user5@test.com'
const depAdminEmail = 'test_user4@test.com'
const org = 'test_org1'

const createDataset = async (ax: any, title: string, permissions: any[]) => {
  const dataset = (await ax.post('/api/v1/datasets', { isMetaOnly: true, title })).data
  await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, permissions)
  return dataset
}

test('a public scope only sees resources with a matching public permission', async () => {
  const ax = await axiosAuth(adminEmail, org)
  const publicDataset = await createDataset(ax, 'recap public', [{ classes: ['list', 'read'] }])
  const privateDataset = await createDataset(ax, 'recap private', [])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list', size: 1000 }
  })
  const ids = res.data.results.map((d: any) => d.id)
  assert.ok(ids.includes(publicDataset.id))
  assert.ok(!ids.includes(privateDataset.id), 'the private dataset must not appear')
})

test('actions combine with AND', async () => {
  const ax = await axiosAuth(adminEmail, org)
  const readOnlyDataset = await createDataset(ax, 'recap readonly', [{ classes: ['list', 'read'] }])
  const writable = await createDataset(ax, 'recap writable', [{ classes: ['list', 'read', 'write'] }])

  const listOnly = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list', size: 1000 }
  })
  const listIds = listOnly.data.results.map((d: any) => d.id)
  assert.ok(listIds.includes(readOnlyDataset.id))
  assert.ok(listIds.includes(writable.id))

  const readAndWrite = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list,write', size: 1000 }
  })
  const bothIds = readAndWrite.data.results.map((d: any) => d.id)
  assert.ok(bothIds.includes(writable.id))
  assert.ok(!bothIds.includes(readOnlyDataset.id), 'AND means the read-only dataset drops out')
})

test('an organization scope restricted to a role only sees permissions granting that role', async () => {
  const ax = await axiosAuth(adminEmail, org)
  const forContribs = await createDataset(ax, 'recap contribs', [
    { type: 'organization', id: org, roles: ['contrib'], classes: ['list', 'read'] }
  ])
  const forNobody = await createDataset(ax, 'recap nobody', [])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'organization', scopeId: org, scopeRoles: 'contrib', scopeActions: 'list', size: 1000 }
  })
  const ids = res.data.results.map((d: any) => d.id)
  assert.ok(ids.includes(forContribs.id))
  assert.ok(!ids.includes(forNobody.id))
})

test('an organization admin scope sees every resource of the organization', async () => {
  const ax = await axiosAuth(adminEmail, org)
  const noPermission = await createDataset(ax, 'recap no permission at all', [])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'organization', scopeId: org, scopeRoles: 'admin', scopeActions: 'list', size: 1000 }
  })
  const ids = res.data.results.map((d: any) => d.id)
  assert.ok(ids.includes(noPermission.id), 'admins hold implicit rights on everything the org owns')
})

test('no action selected falls back to list', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'recap default action', [{ classes: ['list', 'read'] }])

  const withDefault = await ax.get('/api/v1/datasets', { params: { scopeType: 'public', size: 1000 } })
  const explicit = await ax.get('/api/v1/datasets', { params: { scopeType: 'public', scopeActions: 'list', size: 1000 } })
  assert.equal(withDefault.data.count, explicit.data.count)
})

test('a contributor cannot use the scope parameters', async () => {
  const ax = await axiosAuth(contribEmail, org)
  await assert.rejects(
    () => ax.get('/api/v1/datasets', { params: { scopeType: 'public', scopeActions: 'list' } }),
    (err: any) => err.status === 403
  )
})

test('a department admin cannot use the scope parameters', async () => {
  // test_user4 is admin of dep1 and dep2 of test_org1, and of nothing at org root level.
  const ax = await axiosAuth(depAdminEmail, org)

  // Guard: this test is only meaningful if the session really is a department account.
  // data-fair exposes no session endpoint, so we probe it the way the suite already does
  // (cf. tests/features/datasets/upload/init-from.api.spec.ts:343): a resource created by
  // a department account carries owner.department.
  // Do NOT delete this guard: without it the test would pass on a 403 raised for an
  // unrelated reason.
  const probe = (await ax.post('/api/v1/datasets', { isMetaOnly: true, title: 'recap dep probe' })).data
  assert.ok(probe.owner.department, 'expected a department-scoped session')

  await assert.rejects(
    () => ax.get('/api/v1/datasets', { params: { scopeType: 'public', scopeActions: 'list' } }),
    (err: any) => err.status === 403
  )
})

test('facet counts follow the scope', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'recap facet public', [{ classes: ['list', 'read'] }])
  await createDataset(ax, 'recap facet private', [])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list', facets: 'visibility', size: 1000 }
  })
  const facetTotal = res.data.facets.visibility.reduce((sum: number, f: any) => sum + f.count, 0)
  assert.equal(facetTotal, res.data.count, 'facet counts must describe the same set as the list')
})

test('a client-supplied owner cannot widen the perimeter', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'recap owner lock', [{ classes: ['list', 'read'] }])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list', owner: 'organization:test_org2', size: 1000 }
  })
  assert.equal(res.data.count, 0, 'the forced owner clause is AND-ed, it can only narrow')
})
