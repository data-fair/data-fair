import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, anonymousAx, clean, checkPendingTasks, config } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

test.describe('personal information storage cleanup', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('createdBy / updatedBy are stored without user name', async () => {
    const id = 'identities-cleanup-1'
    const res = await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    assert.deepEqual(res.data.createdBy, { id: 'test_user1' })
    assert.deepEqual(res.data.updatedBy, { id: 'test_user1' })
    const patched = await u1.patch('/api/v1/datasets/' + id, { description: 'desc' })
    assert.deepEqual(patched.data.updatedBy, { id: 'test_user1' })
  })

  test('identity rename syncs owner name but stores no authoring name', async () => {
    const id = 'identities-cleanup-2'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await anonymousAx.post(`/api/v1/identities/user/test_user1?key=${config.secretKeys.identities}`, { name: 'Renamed User1' })
    const res = await u1.get('/api/v1/datasets/' + id)
    assert.equal(res.data.owner.name, 'Renamed User1')
    assert.deepEqual(res.data.createdBy, { id: 'test_user1' })
    assert.deepEqual(res.data.updatedBy, { id: 'test_user1' })
  })

  test('identity rename still syncs user permission entry names', async () => {
    const id = 'identities-cleanup-3'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await u1.put(`/api/v1/datasets/${id}/permissions`, [
      { type: 'user', id: 'test_user2', name: 'Test User2', classes: ['read'] }
    ])
    await anonymousAx.post(`/api/v1/identities/user/test_user2?key=${config.secretKeys.identities}`, { name: 'Renamed User2' })
    const perms = await u1.get(`/api/v1/datasets/${id}/permissions`)
    assert.deepEqual(perms.data, [{ type: 'user', id: 'test_user2', name: 'Renamed User2', classes: ['read'] }])
  })

  test('identity delete removes permission entries', async () => {
    const id = 'identities-cleanup-4'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await u1.put(`/api/v1/datasets/${id}/permissions`, [
      { type: 'user', id: 'test_user2', classes: ['read'] }
    ])
    await anonymousAx.delete(`/api/v1/identities/user/test_user2?key=${config.secretKeys.identities}`)
    const perms = await u1.get(`/api/v1/datasets/${id}/permissions`)
    assert.deepEqual(perms.data, [])
  })
})
