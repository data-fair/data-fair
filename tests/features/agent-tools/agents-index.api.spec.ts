import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { anonymousAx, baseURL, directoryUrl } from '../../support/axios.ts'

test.describe('GET /api/v1/agents/index.json', () => {
  test('serves the index anonymously, cacheable, with an ETag honoured on revalidation', async () => {
    const res = await anonymousAx.get('/api/v1/agents/index.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.version, 1)
    assert.deepEqual(res.data.services.map((s: any) => s.id), ['data-fair', 'simple-directory'])
    assert.equal(res.data.services[0].openapi, `${baseURL}/api/v1/api-docs.json`)
    assert.equal(res.data.services[1].openapi, `${directoryUrl}/api/api-docs.json`)
    assert.match(String(res.headers['cache-control']), /public, max-age=300/)
    assert.ok(res.headers.etag, 'an ETag is set')
    const again = await anonymousAx.get('/api/v1/agents/index.json', { headers: { 'if-none-match': res.headers.etag }, validateStatus: () => true })
    assert.equal(again.status, 304)
  })
})
