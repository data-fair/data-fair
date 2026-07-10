import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth } from '../../support/axios.ts'
import { mockAppArtefactId, publishMockApps, patchMockAppArtefact } from '../../support/registry.ts'

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

  test('sync propagates registry deprecation and keeps privateAccess name', async () => {
    await publishMockApps() // idempotent

    // grant monapp2 a privateAccess entry on the registry side, including the
    // required `name` field, and check it round-trips onto the local doc.
    await patchMockAppArtefact('monapp2', {
      privateAccess: [{ type: 'user', id: 'test_user1', name: 'Test user 1' }]
    })

    try {
      // flip monapp3 to deprecated on the registry
      await patchMockAppArtefact('monapp3', { deprecated: true })

      const syncRes = await testSuperadmin.post('/api/v1/base-applications/_sync')
      assert.equal(syncRes.status, 200)

      const listRes = await testSuperadmin.get('/api/v1/admin/base-applications')

      const monapp3 = listRes.data.results.find((a: any) => a.artefactId === mockAppArtefactId('monapp3'))
      assert.ok(monapp3, 'monapp3 must still be synced despite being deprecated')
      assert.equal(monapp3.deprecated, true)

      const monapp2 = listRes.data.results.find((a: any) => a.artefactId === mockAppArtefactId('monapp2'))
      assert.ok(monapp2)
      assert.ok(Array.isArray(monapp2.privateAccess) && monapp2.privateAccess.length >= 1)
      const grantedAccess = monapp2.privateAccess.find((a: any) => a.id === 'test_user1')
      assert.ok(grantedAccess, 'privateAccess entry synced from the registry')
      assert.equal(grantedAccess.name, 'Test user 1')
    } finally {
      // revert so other specs (which rely on monapp3 being usable and monapp2
      // having no registry-sourced privateAccess) see a clean state
      await patchMockAppArtefact('monapp3', { deprecated: false })
      await patchMockAppArtefact('monapp2', { privateAccess: [] })
      const cleanupRes = await testSuperadmin.post('/api/v1/base-applications/_sync')
      assert.equal(cleanupRes.status, 200)
    }
  })
})
