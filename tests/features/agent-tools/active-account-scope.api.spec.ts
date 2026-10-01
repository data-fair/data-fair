/**
 * The back-office list_datasets and list_applications tools send
 * `activeAccountScope` with every listing, so the assistant explores the same
 * catalog as the datasets and applications pages: the active account's
 * resources, not the public resources of every other account.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { activeAccountScope } from '../../../ui/src/composables/agent/utils-logic.ts'

const orgAdmin = await axiosAuth('test_user1@test.com', 'test_org1')
const depAdmin = await axiosAuth('test_user4@test.com', 'test_org1')
depAdmin.setOrg('test_org1', 'dep1')
const user3 = await axiosAuth('test_user3@test.com')

const ids = (res: any) => res.data.results.map((r: any) => r.id).sort()

test.describe('back-office agent listing scope', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('datasets: public datasets of other accounts are left out', async () => {
    const own = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'scope own' })).data
    const dep = (await depAdmin.post('/api/v1/datasets', { isRest: true, title: 'scope dep' })).data
    const other = (await user3.post('/api/v1/datasets', { isRest: true, title: 'scope other' })).data
    await user3.put(`/api/v1/datasets/${other.id}/permissions`, [{ operations: ['readDescription', 'list'] }])

    // without the scope the public dataset of another account is listed
    assert.ok(ids(await orgAdmin.get('/api/v1/datasets')).includes(other.id))

    const params = { ...activeAccountScope }
    assert.deepEqual(ids(await orgAdmin.get('/api/v1/datasets', { params })), [own.id, dep.id].sort())
    assert.deepEqual(ids(await depAdmin.get('/api/v1/datasets', { params })), [dep.id])
  })

  test('applications: public applications of other accounts are left out', async () => {
    const own = (await orgAdmin.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const other = (await user3.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await user3.put(`/api/v1/applications/${other.id}/permissions`, [{ operations: ['readDescription', 'list'] }])

    assert.ok(ids(await orgAdmin.get('/api/v1/applications')).includes(other.id))
    assert.deepEqual(ids(await orgAdmin.get('/api/v1/applications', { params: { ...activeAccountScope } })), [own.id])
  })
})
