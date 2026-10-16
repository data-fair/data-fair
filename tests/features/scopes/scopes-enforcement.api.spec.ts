import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { AxiosInstance } from 'axios'
import { nhiSession } from '../../support/nhi.ts'

// data-fair is scope-aware: a scoped session (the test NHI, admin of test_org1) passes the family
// gates of the scopes it holds, reaches the routes the UIs call on load whatever its scopes, and
// is refused everywhere else (deny by default).

const status = async (p: Promise<any>) => {
  try {
    return (await p).status
  } catch (err: any) {
    if (err.status) return err.status
    throw err
  }
}

for (const transport of ['cookie', 'bearer'] as const) {
  test.describe(`a datasets:read session (${transport})`, () => {
    let ax: AxiosInstance
    test.beforeAll(async () => {
      const s = await nhiSession('datasets:read')
      ax = transport === 'cookie' ? s.cookieAx : s.bearerAx
    })

    test('passes the datasets gate', async () => {
      assert.equal(await status(ax.get('/api/v1/datasets')), 200)
    })

    test('reaches the routes the UIs call on load', async () => {
      assert.equal(await status(ax.get('/api/v1/limits/organization/test_org1')), 200)
      assert.equal(await status(ax.get('/api/v1/settings/organization/test_org1/agent-chat')), 200)
      assert.equal(await status(ax.get('/api/v1/settings/organization/test_org1/licenses')), 200)
      assert.equal(await status(ax.get('/api/v1/vocabulary')), 200)
      assert.equal(await status(ax.get('/api/v1/api-docs.json')), 200)
      assert.equal(await status(ax.get('/api/v1/base-applications')), 200)
      assert.equal(await status(ax.get('/api/v1/remote-services')), 200)
      assert.equal(await status(ax.get('/api/v1/ping')), 200)
      assert.equal(await status(ax.get('/')), 200)
    })

    test('is refused outside its scopes and on unmarked routes', async () => {
      assert.equal(await status(ax.get('/api/v1/applications')), 403)
      assert.equal(await status(ax.get('/api/v1/stats')), 403)
      assert.equal(await status(ax.put('/api/v1/settings/organization/test_org1', {})), 403)
      assert.equal(await status(ax.get('/api/v1/settings/organization/test_org1')), 403)
      assert.equal(await status(ax.get('/api/v1/admin/info')), 403)
      assert.equal(await status(ax.get('/api/v1/activity')), 403)
    })

    test('cannot audit as a visitor without the admin tier', async () => {
      assert.equal(await status(ax.get('/api/v1/datasets', { params: { asVisitor: 'anonymous' } })), 403)
    })
  })
}

test.describe('the admin tier and the unrestricted session', () => {
  test('datasets:admin audits as a visitor', async () => {
    const { bearerAx } = await nhiSession('datasets:admin')
    assert.equal(await status(bearerAx.get('/api/v1/datasets', { params: { asVisitor: 'anonymous' } })), 200)
    assert.equal(await status(bearerAx.get('/api/v1/applications')), 403)
  })

  test('applications:read passes the applications gate only', async () => {
    const { bearerAx } = await nhiSession('applications:read')
    assert.equal(await status(bearerAx.get('/api/v1/applications')), 200)
    assert.equal(await status(bearerAx.get('/api/v1/datasets')), 403)
    assert.equal(await status(bearerAx.get('/api/v1/catalog/datasets')), 403)
  })

  test('an unrestricted session is unaffected', async () => {
    const { cookieAx } = await nhiSession()
    assert.equal(await status(cookieAx.get('/api/v1/applications')), 200)
    assert.equal(await status(cookieAx.get('/api/v1/settings/organization/test_org1')), 200)
    assert.equal(await status(cookieAx.get('/api/v1/datasets', { params: { asVisitor: 'anonymous' } })), 200)
  })
})

test.describe('proxy and embed marks', () => {
  test('the remote-services proxy answers a datasets:read session without the scope refusal', async () => {
    const { bearerAx } = await nhiSession('datasets:read')
    // no referer: the proxy refuses on its own terms, whatever the status is, but never on the scope
    const st = await status(bearerAx.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord'))
    assert.notEqual(st, 403)
    // the proxy route answers GET only: another method is refused on the method, not on the scope
    assert.equal(await status(bearerAx.post('/api/v1/remote-services/geocoder-koumoul/proxy/coord', {})), 405)
  })

  test('the embed shell is served to a scoped session on GET only', async () => {
    const { bearerAx } = await nhiSession('datasets:read')
    assert.equal(await status(bearerAx.get('/embed/dataset/unknown/table')), 200)
    // no handler for other methods: not served (the mark is not what answers)
    assert.equal(await status(bearerAx.post('/embed/dataset/unknown/table', {})), 404)
  })
})
