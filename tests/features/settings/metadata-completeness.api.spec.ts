import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

const setCompleteness = (metadataCompleteness: any) =>
  u1.patch('/api/v1/settings/user/test_user1', { metadataCompleteness })

/** A dataset carrying only a description: 4 points of the 11 unconditional ones => 36. */
const makeDataset = async (id: string) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
  await u1.patch('/api/v1/datasets/' + id, { description: 'd'.repeat(200) })
}

const scoreOf = async (id: string) => (await u1.get('/api/v1/datasets/' + id)).data.completeness

test.describe('metadata completeness settings transitions', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('activating scores every existing dataset without patching any of them', async () => {
    await makeDataset('trans-a1')
    await makeDataset('trans-a2')
    assert.equal(await scoreOf('trans-a1'), undefined)

    await setCompleteness({ active: true })

    assert.equal((await scoreOf('trans-a1')).score, 36)
    assert.equal((await scoreOf('trans-a2')).score, 36)
  })

  test('deactivating clears the field from every dataset', async () => {
    await makeDataset('trans-b1')
    await setCompleteness({ active: true })
    assert.equal((await scoreOf('trans-b1')).score, 36)

    await setCompleteness({ active: false })

    assert.equal(await scoreOf('trans-b1'), undefined)
  })

  test('changing a weight recomputes every dataset', async () => {
    await makeDataset('trans-c1')
    await setCompleteness({ active: true })
    assert.equal((await scoreOf('trans-c1')).score, 36)

    // drop summary, license and origin to 0: the description alone remains applicable
    await setCompleteness({ active: true, weights: { summary: 0, license: 0, origin: 0 } })

    const after = await scoreOf('trans-c1')
    assert.equal(after.score, 100)
    assert.deepEqual(after.missing, [])
  })

  test('changing a length bound recomputes every dataset', async () => {
    await makeDataset('trans-d1')
    await setCompleteness({ active: true })
    assert.equal((await scoreOf('trans-d1')).score, 36)

    // demand 500 characters: the 200-character description no longer qualifies
    await setCompleteness({ active: true, description: { min: 500 } })

    assert.equal((await scoreOf('trans-d1')).score, 0)
  })

  test('offering a new metadata field recomputes every dataset', async () => {
    await makeDataset('trans-e1')
    await setCompleteness({ active: true })
    assert.equal((await scoreOf('trans-e1')).score, 36)

    // spatial becomes applicable and is unfilled: 4 of 12 => 33
    await u1.patch('/api/v1/settings/user/test_user1', { datasetsMetadata: { spatial: { active: true } } })

    const after = await scoreOf('trans-e1')
    assert.equal(after.score, 33)
    assert.ok(after.missing.includes('spatial'))
  })

  test('saving unrelated settings while inactive writes nothing', async () => {
    await makeDataset('trans-f1')
    await u1.patch('/api/v1/settings/user/test_user1', { datasetsMetadata: { spatial: { active: true } } })
    assert.equal(await scoreOf('trans-f1'), undefined)
  })

  test('deleting one topic among several recomputes, since it was pulled off the datasets', async () => {
    const topics = [{ id: 'top-g1', title: 'Transport' }, { id: 'top-g2', title: 'Environnement' }]
    await u1.patch('/api/v1/settings/user/test_user1', { topics })
    await makeDataset('trans-g1')
    await u1.patch('/api/v1/datasets/trans-g1', { topics: [topics[0]] })
    // topics becomes applicable and is filled: 4 + 2 of 13 => 46
    await setCompleteness({ active: true })
    assert.equal((await scoreOf('trans-g1')).score, 46)

    // the topics list stays non-empty, but updateTopics has just $pulled this one off the dataset
    await u1.patch('/api/v1/settings/user/test_user1', { topics: [topics[1]] })

    const after = await scoreOf('trans-g1')
    assert.equal(after.score, 31) // 4 of 13
    assert.ok(after.missing.includes('topics'))
  })
})
