import { strict as assert } from 'node:assert'
import { test } from '@playwright/test'
import { axiosAuth, mockAppUrl } from '../../support/axios.ts'
import { publishMockApps } from '../../support/registry.ts'

test.describe('application proxy serving from registry extract', () => {
  test('index.html is transformed and asset refs point at the versioned assets mount', async () => {
    await publishMockApps()
    const adminAx = await axiosAuth('test_superadmin@test.com', undefined, true)
    await adminAx.post('/api/v1/base-applications/_sync')

    const ax = await axiosAuth('test_user1@test.com')
    const { data: app } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    const res = await ax.get(`/app/${app.id}/`)
    assert.equal(res.status, 200)
    // %APPLICATION% injected
    assert.match(res.data, /window\.APPLICATION=\{/)
    // relative asset ref rewritten to versioned assets mount
    assert.match(res.data, /\/app-assets\/@test\/monapp1\/0\.1\/0\.1\.0\/assets\/index-test1\.js/)
    // index.html itself must not be cacheable
    assert.match(res.headers['cache-control'], /must-revalidate/)

    // extraPath served from the extract (legacy chunk-loading fallback)
    const fileRes = await ax.get(`/app/${app.id}/dir1/info.txt`)
    assert.equal(fileRes.data, 'into txt dir1')
  })
})
