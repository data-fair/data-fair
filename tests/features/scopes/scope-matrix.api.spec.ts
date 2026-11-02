import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { AxiosInstance } from 'axios'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl, apiUrl } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'
import { nhiSession } from '../../support/nhi.ts'

// end-to-end scope enforcement: a scoped session (the test NHI, admin of test_org1) is limited by
// the tier of its scopes on top of its role. Resources are created by an unrestricted admin of
// test_org1, so they are owned by the organization.

const orgAdmin = await axiosAuth('test_user1@test.com', 'test_org1')

const status = async (p: Promise<any>) => {
  try {
    return (await p).status
  } catch (err: any) {
    if (err.status) return err.status
    throw err
  }
}

const createDataset = async (id: string) => {
  await orgAdmin.put(`/api/v1/datasets/${id}`, {
    isRest: true,
    title: 'Scope matrix',
    schema: [{ key: 'a', type: 'string' }]
  })
  await orgAdmin.post(`/api/v1/datasets/${id}/lines`, { a: 'x' })
  await waitForFinalize(orgAdmin, id)
}

const ownerBody = { type: 'organization', id: 'test_org1', name: 'Test Org 1' }

test.describe('scope tiers on datasets', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  for (const transport of ['cookie', 'bearer'] as const) {
    const pick = (s: { cookieAx: AxiosInstance, bearerAx: AxiosInstance }) => transport === 'cookie' ? s.cookieAx : s.bearerAx

    test(`datasets:read reads and cannot write (${transport})`, async () => {
      await createDataset('scope-read')
      const ax = pick(await nhiSession('datasets:read'))
      assert.equal(await status(ax.get('/api/v1/datasets/scope-read')), 200)
      assert.equal(await status(ax.get('/api/v1/datasets/scope-read/lines')), 200)
      assert.equal(await status(ax.get('/api/v1/datasets/scope-read/schema')), 200)
      assert.equal(await status(ax.get('/api/v1/datasets/scope-read/journal')), 200)

      assert.equal(await status(ax.patch('/api/v1/datasets/scope-read', { title: 'nope' })), 403)
      assert.equal(await status(ax.post('/api/v1/datasets/scope-read/lines', { a: 'y' })), 403)
      assert.equal(await status(ax.put('/api/v1/datasets/scope-read/permissions', [])), 403)
      assert.equal(await status(ax.put('/api/v1/datasets/scope-read/owner', ownerBody)), 403)
      assert.equal(await status(ax.post('/api/v1/datasets', { isRest: true, title: 'nope', schema: [] })), 403)
      assert.equal(await status(ax.delete('/api/v1/datasets/scope-read')), 403)
      // nothing changed
      const ds = (await orgAdmin.get('/api/v1/datasets/scope-read')).data
      assert.equal(ds.title, 'Scope matrix')
    })

    test(`datasets:write writes but neither deletes nor changes permissions (${transport})`, async () => {
      await createDataset('scope-write')
      const ax = pick(await nhiSession('datasets:write'))
      assert.equal(await status(ax.patch('/api/v1/datasets/scope-write', { title: 'Renamed' })), 200)
      assert.equal(await status(ax.post('/api/v1/datasets/scope-write/lines', { a: 'y' })), 201)
      assert.equal(await status(ax.get('/api/v1/datasets/scope-write')), 200)

      assert.equal(await status(ax.delete('/api/v1/datasets/scope-write')), 403)
      assert.equal(await status(ax.put('/api/v1/datasets/scope-write/permissions', [])), 403)
      assert.equal(await status(ax.put('/api/v1/datasets/scope-write/owner', ownerBody)), 403)
      assert.equal((await orgAdmin.get('/api/v1/datasets/scope-write')).data.title, 'Renamed')
    })

    for (const scope of ['datasets:admin', 'datasets']) {
      test(`${scope} deletes a dataset (${transport})`, async () => {
        await createDataset('scope-admin')
        const ax = pick(await nhiSession(scope))
        assert.equal(await status(ax.put('/api/v1/datasets/scope-admin/permissions', [])), 200)
        assert.equal(await status(ax.delete('/api/v1/datasets/scope-admin')), 204)
        assert.equal(await status(orgAdmin.get('/api/v1/datasets/scope-admin')), 404)
      })

      test(`${scope} still cannot write settings (${transport})`, async () => {
        const ax = pick(await nhiSession(scope))
        assert.equal(await status(ax.put('/api/v1/settings/organization/test_org1', {})), 403)
        assert.equal(await status(ax.patch('/api/v1/settings/organization/test_org1', {})), 403)
      })
    }

    test(`applications:read reads an application only (${transport})`, async () => {
      const app = (await orgAdmin.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'Scope app' })).data
      const ax = pick(await nhiSession('applications:read'))
      assert.equal(await status(ax.get(`/api/v1/applications/${app.id}`)), 200)
      assert.equal(await status(ax.get('/api/v1/datasets')), 403)
      assert.equal(await status(ax.patch(`/api/v1/applications/${app.id}`, { title: 'nope' })), 403)
      assert.equal(await status(ax.delete(`/api/v1/applications/${app.id}`)), 403)
      assert.equal((await orgAdmin.get(`/api/v1/applications/${app.id}`)).data.title, 'Scope app')
    })
  }

  test('an unrestricted NHI session keeps what its role allows', async () => {
    await createDataset('scope-unrestricted')
    const { cookieAx } = await nhiSession()
    assert.equal(await status(cookieAx.patch('/api/v1/datasets/scope-unrestricted', { title: 'By nhi' })), 200)
    assert.equal(await status(cookieAx.delete('/api/v1/datasets/scope-unrestricted')), 204)
  })

  // NODE_ENV=development makes canSubscribe answer true, so this only pins the channelScopes
  // refusal (accepted family vs refused family), not the tier check of canSubscribe.
  test('websocket subscription is limited to the families of the scopes', async () => {
    await createDataset('scope-ws')
    const { cookieAx } = await nhiSession('datasets:read')
    const cookie = cookieAx.defaults.headers.cookie as string
    const WebSocket = (await import('ws')).default
    const cli = new WebSocket(apiUrl.replace('http', 'ws'), { headers: { cookie } })
    await new Promise<void>((resolve, reject) => {
      cli.on('open', resolve)
      cli.on('error', reject)
    })
    const next = () => new Promise<any>(resolve => cli.once('message', (data: any) => resolve(JSON.parse(data.toString()))))
    let reply = next()
    cli.send(JSON.stringify({ type: 'subscribe', channel: 'datasets/scope-ws/journal' }))
    assert.equal((await reply).type, 'subscribe-confirm')
    reply = next()
    cli.send(JSON.stringify({ type: 'subscribe', channel: 'applications/whatever/journal' }))
    const refused = await reply
    assert.equal(refused.type, 'error')
    assert.equal(refused.status, 403)
    cli.close()
  })
})
