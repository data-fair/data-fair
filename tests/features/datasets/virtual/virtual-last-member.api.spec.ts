import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('a virtual dataset cannot be emptied of its last member by a patch', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('creating an empty virtual dataset is still allowed (non-regression)', async () => {
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', virtual: { children: [] } })
    await waitForDatasetError(ax, res.data.id)
    assert.equal(res.status, 201)
  })

  test('cannot patch a virtual dataset down to zero members', async () => {
    const ax = testUser1
    const member = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', virtual: { children: [member.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)

    await assert.rejects(
      ax.patch(`/api/v1/datasets/${virtualDataset.id}`, { virtual: { children: [] } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('Un jeu de données virtuel doit agréger au moins un jeu de données. Pour ne plus l\'utiliser, supprimez le jeu virtuel lui-même.'), err.data)
        return true
      }
    )
  })

  test('the 400 fires before the partOf orphan guard, no childrenAction is required to observe it', async () => {
    const ax = testUser1
    const member = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', virtual: { children: [member.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${member.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    // without childrenAction, dropping a partOf child normally triggers a 409 — but emptying the
    // last member must be rejected with the 400 first, before that guard even runs
    await assert.rejects(
      ax.patch(`/api/v1/datasets/${virtualDataset.id}`, { virtual: { children: [] } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('Un jeu de données virtuel doit agréger au moins un jeu de données. Pour ne plus l\'utiliser, supprimez le jeu virtuel lui-même.'), err.data)
        return true
      }
    )
  })

  test('an already empty virtual dataset stays patchable', async () => {
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', virtual: { children: [] } })
    await waitForDatasetError(ax, res.data.id)

    const patched = await ax.patch(`/api/v1/datasets/${res.data.id}`, { title: 'a renamed virtual dataset' })
    assert.equal(patched.status, 200)
    assert.equal(patched.data.title, 'a renamed virtual dataset')
    // any patch of a dataset previously in error resets its status and re-triggers the worker,
    // which re-errors on the still-empty virtual: wait for it to settle before patching again,
    // otherwise the next patch 409s on the transient 'indexed' status
    await waitForDatasetError(ax, res.data.id)

    // 0 -> 0 through a virtual-keyed patch is also fine, not just leaving virtual untouched
    const patched2 = await ax.patch(`/api/v1/datasets/${res.data.id}`, { virtual: { children: [] } })
    assert.equal(patched2.status, 200)
  })
})
