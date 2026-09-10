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

  test('a virtual dataset of another department of the same organization never blocks a deletion either', async () => {
    const testUser4Dep1 = await axiosAuth('test_user4@test.com', 'test_org1')
    testUser4Dep1.setOrg('test_org1', 'dep1')
    const testUser4Dep2 = await axiosAuth('test_user4@test.com', 'test_org1')
    testUser4Dep2.setOrg('test_org1', 'dep2')

    const dataset = await sendDataset('datasets/dataset1.csv', testUser4Dep1)
    assert.equal(dataset.owner.department, 'dep1')
    await testUser4Dep1.put(`/api/v1/datasets/${dataset.id}/permissions`, [{ classes: ['read'] }])

    const virtualRes = await testUser4Dep2.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset of another department',
      virtual: { children: [dataset.id] },
      schema: [{ key: 'id' }]
    })
    const otherDepVirtual = await waitForFinalize(testUser4Dep2, virtualRes.data.id)
    assert.equal(otherDepVirtual.owner.department, 'dep2')

    // a department is a distinct scope, exactly as in partOf's isSameOwner: no 409, no title leaked
    const res = await testUser4Dep1.delete(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.status, 204)

    const detached = (await testUser4Dep2.get(`/api/v1/datasets/${otherDepVirtual.id}`)).data
    assert.deepEqual(detached.virtual.children, [])
  })

  test('the refusal names every virtual dataset the deletion would empty', async () => {
    const ax = testUser1
    const member = await sendDataset('datasets/dataset1.csv', ax)
    const createVirtual = async (title: string) => {
      const res = await ax.post('/api/v1/datasets', {
        isVirtual: true,
        title,
        virtual: { children: [member.id] },
        schema: [{ key: 'id' }]
      })
      return await waitForFinalize(ax, res.data.id)
    }
    const virtual1 = await createVirtual('a first lonely virtual dataset')
    const virtual2 = await createVirtual('a second lonely virtual dataset')

    await assert.rejects(
      ax.delete(`/api/v1/datasets/${member.id}`),
      (err: any) => {
        assert.equal(err.status, 409)
        assert.ok(err.data.includes('Ce jeu de données est le seul membre des jeux de données virtuels '), err.data)
        assert.ok(err.data.includes(`"${virtual1.title}" (${virtual1.id})`), err.data)
        assert.ok(err.data.includes(`"${virtual2.title}" (${virtual2.id})`), err.data)
        assert.ok(err.data.includes('Supprimez d\'abord ces jeux virtuels, ou ajoutez-leur un autre membre.'), err.data)
        return true
      }
    )
  })
})
