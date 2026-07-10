import { strict as assert } from 'node:assert'
import { test } from '@playwright/test'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { axiosAuth, apiUrl } from '../../support/axios.ts'
import { publishMockApps } from '../../support/registry.ts'

// nginx (dev/resources/nginx.conf.template) does not know about /app-assets yet
// (only /app, /api, /assets, /streamsaver are proxied to the API server under
// /data-fair) — hit the API server directly, like other infra-only routes.
const anonymous = axiosBuilder({ baseURL: apiUrl })

test.describe('base app assets serving', () => {
  test('serves extracted files publicly with tiered caching', async () => {
    await publishMockApps()
    const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)
    await testSuperadmin.post('/api/v1/base-applications/_sync')

    // short-TTL tier (no version segment)
    let res = await anonymous.get('/app-assets/@test/monapp1/0.1/assets/index-test1.js')
    assert.equal(res.status, 200)
    assert.match(res.headers['content-type'], /javascript/)
    assert.match(res.headers['cache-control'], /max-age=300/)

    // immutable tier (exact version)
    res = await anonymous.get('/app-assets/@test/monapp1/0.1/0.1.0/assets/index-test1.js')
    assert.equal(res.status, 200)
    assert.match(res.headers['cache-control'], /immutable/)

    // mismatched exact version: self-heal retries but the extract still doesn't
    // carry 0.9.9 (only 0.1.0 was ever published) — the file still exists under the
    // served extract so it's served gracefully, but must NOT be claimed immutable
    res = await anonymous.get('/app-assets/@test/monapp1/0.1/0.9.9/assets/index-test1.js')
    assert.equal(res.status, 200)
    assert.match(res.headers['cache-control'], /max-age=300/)
    assert.doesNotMatch(res.headers['cache-control'], /immutable/)

    // raw index.html is never exposed (contains the %APPLICATION% placeholder)
    await assert.rejects(anonymous.get('/app-assets/@test/monapp1/0.1/index.html'), (err: any) => err.status === 404)
    await assert.rejects(anonymous.get('/app-assets/@test/monapp1/0.1/0.1.0/index.html'), (err: any) => err.status === 404)
    // directory root too
    await assert.rejects(anonymous.get('/app-assets/@test/monapp1/0.1/'), (err: any) => err.status === 404)
    // unknown artefact
    await assert.rejects(anonymous.get('/app-assets/@test/nosuchapp/9.9/whatever.js'), (err: any) => err.status === 404)
    // path traversal
    await assert.rejects(anonymous.get('/app-assets/@test/monapp1/0.1/..%2f..%2fpackage.json'), (err: any) => err.status === 404 || err.status === 403)
  })
})
