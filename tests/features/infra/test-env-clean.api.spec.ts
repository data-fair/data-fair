import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, anonymousAx, apiUrl } from '../../support/axios.ts'
import { sdTestEnvUrl } from '../../support/sd-fixtures.ts'
import { doAndWaitForFinalize, datasetEsIndicesCount } from '../../support/workers.ts'

// another sub-space than this suite's: its data must survive the cleanup of test_datafair_
const otherPrefix = 'test_datafairother_'
const otherWorld = {
  prefix: otherPrefix,
  users: [{ id: `${otherPrefix}user`, firstName: 'Other', lastName: 'User', email: `${otherPrefix}user@test.com`, password: { clear: 'passwd' } }],
  organizations: []
}

const cleanOtherWorld = async () => {
  await anonymousAx.delete(sdTestEnvUrl(), { params: { prefix: otherPrefix } })
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env`, { params: { prefix: otherPrefix } })
}

test.describe('test-env cleanup', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    await cleanOtherWorld()
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('refuses a missing or invalid prefix', async () => {
    for (const params of [{}, { prefix: 'test_' }, { prefix: 'test_datafair' }, { prefix: 'other_' }]) {
      await assert.rejects(anonymousAx.delete(`${apiUrl}/api/v1/test-env`, { params }), { status: 400 })
    }
  })

  test('keeps the indices of a dataset of another sub-space whose id extends a cleaned dataset id', async () => {
    await anonymousAx.post(`${sdTestEnvUrl()}/seed`, otherWorld)
    const testUser1 = await axiosAuth('test_datafair_user1@test.com')
    const otherUser = await axiosAuth(`${otherPrefix}user@test.com`)

    await doAndWaitForFinalize(testUser1, 'clean-es', () => testUser1.put('/api/v1/datasets/clean-es', { isRest: true, title: 'cleaned' }))
    await doAndWaitForFinalize(otherUser, 'clean-es-kept', () => otherUser.put('/api/v1/datasets/clean-es-kept', { isRest: true, title: 'kept' }))
    assert.equal(await datasetEsIndicesCount('clean-es'), 1)
    assert.equal(await datasetEsIndicesCount('clean-es-kept'), 1)

    await clean()

    await assert.rejects(testUser1.get('/api/v1/datasets/clean-es'), { status: 404 })
    assert.equal((await otherUser.get('/api/v1/datasets/clean-es-kept')).status, 200)
    assert.equal(await datasetEsIndicesCount('clean-es-kept'), 1)
  })
})
