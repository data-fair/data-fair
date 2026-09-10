import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser3 = await axiosAuth('test_user3@test.com')

test.describe('deleting a member of a virtual dataset', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a deleted member is detached from its virtual parents, which are re-finalized', async () => {
    const ax = testUser1
    const memberA = await sendDataset('datasets/dataset1.csv', ax)
    const memberB = await sendDataset('datasets/dataset2.csv', ax)
    // "id" is the only column both members share
    const virtualRes = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: { children: [memberA.id, memberB.id] },
      schema: [{ key: 'id' }]
    })
    let virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    assert.equal(virtualDataset.count, memberA.count + memberB.count)

    const res = await ax.delete(`/api/v1/datasets/${memberA.id}`)
    assert.equal(res.status, 204)
    virtualDataset = await waitForFinalize(ax, virtualDataset.id)

    assert.deepEqual(virtualDataset.virtual.children, [memberB.id])
    assert.equal(virtualDataset.status, 'finalized')
    // re-finalized over memberB alone: memberA's lines are gone from the aggregate
    assert.equal(virtualDataset.count, memberB.count)

    const lines = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(lines.status, 200)
    assert.equal(lines.data.total, memberB.count)
  })

  test('the single member of a virtual dataset cannot be deleted, adding another member unblocks it', async () => {
    const ax = testUser1
    const memberA = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a lonely virtual dataset',
      virtual: { children: [memberA.id] },
      schema: [{ key: 'id' }]
    })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)

    await assert.rejects(
      ax.delete(`/api/v1/datasets/${memberA.id}`),
      (err: any) => {
        assert.equal(err.status, 409)
        assert.ok(err.data.includes(`Ce jeu de données est le seul membre du jeu de données virtuel "${virtualDataset.title}" (${virtualDataset.id}). Supprimez d'abord ce jeu virtuel, ou ajoutez-lui un autre membre.`), err.data)
        return true
      }
    )

    const memberB = await sendDataset('datasets/dataset2.csv', ax)
    await ax.patch(`/api/v1/datasets/${virtualDataset.id}`, { virtual: { children: [memberA.id, memberB.id] } })
    await waitForFinalize(ax, virtualDataset.id)

    const res = await ax.delete(`/api/v1/datasets/${memberA.id}`)
    assert.equal(res.status, 204)
    const refinalized = await waitForFinalize(ax, virtualDataset.id)
    assert.deepEqual(refinalized.virtual.children, [memberB.id])
  })

  test('a virtual dataset of another account never blocks a deletion, but is detached all the same', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [{ classes: ['read'] }])

    // test_user3 aggregates the public dataset as the single member of its own virtual dataset
    const virtualRes = await testUser3.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a foreign virtual dataset',
      virtual: { children: [dataset.id] },
      schema: [{ key: 'id' }]
    })
    const foreignVirtual = await waitForFinalize(testUser3, virtualRes.data.id)

    // the last-member guard is scoped to the owner's own account: no 409, and no foreign title leaked
    const res = await ax.delete(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.status, 204)

    // the dangling reference is still cleaned up, whoever owns the parent
    const detached = (await testUser3.get(`/api/v1/datasets/${foreignVirtual.id}`)).data
    assert.deepEqual(detached.virtual.children, [])
  })
})
