import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth } from '../../support/axios.ts'
import { mockAppArtefactId, publishMockApps } from '../../support/registry.ts'

const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)
const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('base applications sync from registry', () => {
  test('superadmin syncs registry application artefacts into base-applications', async () => {
    await publishMockApps() // idempotent
    const res = await testSuperadmin.post('/api/v1/base-applications/_sync')
    assert.equal(res.status, 200)
    assert.ok(res.data.synced >= 3, `expected at least 3 synced apps, got ${JSON.stringify(res.data)}`)

    // the synced app is importable and carries meta + datasetsFilters derived from the tarball
    const listRes = await testSuperadmin.get('/api/v1/admin/base-applications')
    const monapp1 = listRes.data.results.find((a: any) => a.artefactId === mockAppArtefactId('monapp1'))
    assert.ok(monapp1, 'monapp1 must be synced')
    assert.equal(monapp1.meta['application-name'], 'test')
    assert.ok(monapp1.url.endsWith('/app-assets/@test/monapp1/0.1/'))
    assert.ok(monapp1.datasetsFilters.length >= 1)
    assert.deepEqual(monapp1.datasetsFilters[0]['field-type'], ['integer', 'number'])

    // registry metadata is merged: monapp2 was published non-public
    const monapp2 = listRes.data.results.find((a: any) => a.artefactId === mockAppArtefactId('monapp2'))
    assert.ok(monapp2)
    assert.notEqual(monapp2.public, true)
  })

  test('sync requires adminMode', async () => {
    await assert.rejects(testUser1.post('/api/v1/base-applications/_sync'), (err: any) => err.status === 403)
  })
})
