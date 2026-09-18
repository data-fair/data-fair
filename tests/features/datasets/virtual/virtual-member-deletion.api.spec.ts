import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')

test.describe('deleting a member of a virtual dataset', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('the deleted member is pulled from its virtual parents, which re-finalize', async () => {
    const ax = testUser1
    const child1 = await sendDataset('datasets/dataset1.csv', ax)
    const child2 = await sendDataset('datasets/dataset1.csv', ax)
    const virtual = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [child1.id, child2.id] },
      title: 'a virtual dataset'
    })).data
    await waitForFinalize(ax, virtual.id)

    await ax.delete(`/api/v1/datasets/${child1.id}`)
    await waitForFinalize(ax, virtual.id)

    // the dangling id is gone, and the parent still answers over its remaining member
    const refreshed = (await ax.get(`/api/v1/datasets/${virtual.id}`)).data
    assert.deepEqual(refreshed.virtual.children, [child2.id])
    assert.equal((await ax.get(`/api/v1/datasets/${virtual.id}/lines`)).data.total, 2)
  })

  test('a virtual parent of another account is cleaned up too', async () => {
    const child = await sendDataset('datasets/dataset1.csv', testUser1Org)
    // readable by the whole platform, so another account may aggregate it
    await testUser1Org.put(`/api/v1/datasets/${child.id}/permissions`, [{ classes: ['list', 'read'] }])
    const virtual = (await testUser1.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [child.id] },
      title: 'a foreign virtual dataset'
    })).data
    await waitForFinalize(testUser1, virtual.id)

    await testUser1Org.delete(`/api/v1/datasets/${child.id}`)

    const refreshed = (await testUser1.get(`/api/v1/datasets/${virtual.id}`)).data
    assert.deepEqual(refreshed.virtual.children, [])
  })
})
