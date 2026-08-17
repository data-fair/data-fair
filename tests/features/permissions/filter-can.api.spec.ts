import { test } from '@playwright/test'
import assert from 'node:assert'
import { axiosAuth, clean } from '../../support/axios.ts'

test.afterAll(clean)

test('the can parameter accepts several comma-separated permission classes', async () => {
  // filterCan's else-if branch tests the whole comma-joined string instead of the current
  // token, so permission CLASS names are dropped as soon as there are several values.
  // The bug is invisible with a single value (op === operation) and invisible again when
  // one of the values happens to be both a class and an operation id — 'list' is both,
  // which is why `can=list,read` works. `can=read,readAdvanced` is the discriminating
  // case: every token is a class name, the filter ends up empty, and Mongo rejects the
  // `$or: []` with a 500.
  //
  // The requester must NOT be an admin of the owner either: filterCan grants admins the
  // whole owner clause whatever the requested operations. test_user5 is contrib of
  // test_org1 and holds no implicit right (cf. ticket #777).
  const adminAx = await axiosAuth('test_user1@test.com', 'test_org1')
  const dataset = (await adminAx.post('/api/v1/datasets', { isMetaOnly: true, title: 'can filter dataset' })).data
  await adminAx.put(`/api/v1/datasets/${dataset.id}/permissions`, [
    { type: 'organization', id: 'test_org1', roles: ['contrib'], classes: ['list', 'read', 'readAdvanced'] }
  ])

  const contribAx = await axiosAuth('test_user5@test.com', 'test_org1')

  // guard: the explicit permission itself works, so a failure below is really about `can`
  const single = await contribAx.get('/api/v1/datasets', { params: { can: 'read' } })
  assert.ok(single.data.results.some((d: any) => d.id === dataset.id), 'the contributor should list the dataset')

  const res = await contribAx.get('/api/v1/datasets', { params: { can: 'read,readAdvanced' } })
  assert.ok(res.data.results.some((d: any) => d.id === dataset.id), 'expected class names to be honoured in a multi-value can')
})
