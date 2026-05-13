import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const adminUser = await axiosAuth('test_superadmin@test.com', undefined, true)

test.describe('_diagnose realtime warnings', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('LargeDeletedDocsRatio: REST dataset with >20% deleted docs flags the warning', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restdel-diag', {
      isRest: true,
      title: 'restdel-diag',
      schema: [{ key: 'attr1', type: 'string' }]
    })

    // bulk insert 1500 lines so the >1000 minimum is exceeded
    const lines = Array.from({ length: 1500 }, (_, i) => ({ _id: `line${i}`, attr1: `value${i}` }))
    await ax.post('/api/v1/datasets/restdel-diag/_bulk_lines', lines)
    await waitForFinalize(ax, 'restdel-diag')

    // delete 600 lines (40% > 20% threshold)
    const deletes = Array.from({ length: 600 }, (_, i) => ({ _id: `line${i}`, _action: 'delete' }))
    await ax.post('/api/v1/datasets/restdel-diag/_bulk_lines', deletes)
    await waitForFinalize(ax, 'restdel-diag')

    const diagnose = (await adminUser.get('/api/v1/datasets/restdel-diag/_diagnose')).data
    assert.ok(Array.isArray(diagnose.warnings))
    const w = diagnose.warnings.find((x: any) => x.code === 'LargeDeletedDocsRatio')
    assert.ok(w, `expected LargeDeletedDocsRatio in ${JSON.stringify(diagnose.warnings.map((x: any) => x.code))}`)
    assert.equal(w.severity, 'warning')
    assert.ok(w.details.ratio > 0.2)
  })
})
