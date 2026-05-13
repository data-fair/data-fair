import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const adminUser = await axiosAuth('test_superadmin@test.com', undefined, true)

test.describe('admin/elasticsearch/diagnose', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('non-admin user gets 403', async () => {
    const res = await testUser1.get('/api/v1/admin/elasticsearch/diagnose', { validateStatus: () => true })
    assert.equal(res.status, 403)
  })

  test('admin gets a populated payload with the seeded dataset reachable', async () => {
    await testUser1.post('/api/v1/datasets/esdiag-1', {
      isRest: true,
      title: 'esdiag-1',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    await testUser1.post('/api/v1/datasets/esdiag-1/_bulk_lines', [{ attr1: 'a' }])
    await waitForFinalize(testUser1, 'esdiag-1')

    const res = await adminUser.get('/api/v1/admin/elasticsearch/diagnose')
    assert.equal(res.status, 200)
    const body = res.data

    assert.ok(body.cluster, 'cluster section present')
    assert.ok(['green', 'yellow', 'red'].includes(body.cluster.status))
    assert.ok(Array.isArray(body.nodes))
    assert.ok(body.nodes.length >= 1, 'at least one node')
    assert.ok(Array.isArray(body.longTasks))
    assert.ok(Array.isArray(body.unassignedShards))

    assert.ok(body.indicesSummary)
    assert.ok(body.indicesSummary.nbDataFairIndices >= 1, 'at least one data-fair index')
    assert.ok(body.indicesSummary.nbDatasetsWithIndex >= 1)
    assert.ok(body.indicesSummary.nbDatasetsInMongo >= 1)

    assert.ok(body.datasetsWithEsWarnings)
    assert.equal(typeof body.datasetsWithEsWarnings.count, 'number')

    assert.ok(Array.isArray(body.errors))
  })
})
