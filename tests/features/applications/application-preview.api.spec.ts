import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import path from 'node:path'
import { decodeJwt } from 'jose'
import { axiosAuth as _axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import { load, toolsForScopes } from '@data-fair/openapi-mcp'
import { axios, axiosAuth, anonymousAx, clean, checkPendingTasks, baseURL, directoryUrl, mockAppUrl } from '../../support/axios.ts'
import { setConfig, clearRateLimiting } from '../../support/workers.ts'
import { nhiSession, scopeNhiId } from '../../support/nhi.ts'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

// simple-directory only answers to /api/auth/pseudo when it has a pseudo session secret
const pseudoSecret = 'secret-pseudo-session'
const pseudoAvailable = await fetch(`http://localhost:${process.env.SD_PORT}/api/auth/pseudo`, { method: 'POST', headers: { 'x-secret-key': pseudoSecret, 'content-type': 'application/json' }, body: '{}' })
  .then(res => res.status === 400, () => false)

// the preview renders the application through the capture service
const captureAvailable = await fetch(`http://localhost:${process.env.NGINX_PORT}/capture/api/v1/api-docs.json`).then(res => res.status === 200, () => false)

const { pseudoSessionCookie } = await import('../../../api/src/misc/utils/pseudo-session.ts')

const withCookie = (cookie: string) => axios({ baseURL, headers: { cookie, 'x-cache-bypass': '1' } })

test.describe('pseudo session', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('is a GET-only session of an org admin', async () => {
    test.skip(!pseudoAvailable, 'simple-directory has no pseudo session secret in this test environment')
    const admin = await axiosAuth('test_user1@test.com', 'test_org1')
    await admin.put('/api/v1/datasets/pseudo-org', { isRest: true, title: 'Pseudo org' })
    const cookie = await pseudoSessionCookie({
      user: { id: 'test_user1', email: 'test_user1@test.com', name: 'Test User1', organizations: [] },
      account: { type: 'organization', id: 'test_org1', name: 'Test Org1' },
      accountRole: 'admin',
      lang: 'en'
    })
    assert.match(cookie, /^id_token=[^;]+; id_token_sign=[^;]+; id_token_org=test_org1$/)

    const pseudo = withCookie(cookie)
    const list = await pseudo.get('/api/v1/datasets')
    assert.equal(list.status, 200)
    assert.deepEqual(list.data.results.map((d: any) => d.id), ['pseudo-org'])
    await assert.rejects(pseudo.post('/api/v1/datasets', { isRest: true, title: 'Forbidden' }), (err: any) => {
      assert.equal(err.status, 403)
      assert.match(JSON.stringify(err.data), /pseudo session only allows GET requests/)
      return true
    })
  })

  test('keeps the active department of a member', async () => {
    test.skip(!pseudoAvailable, 'simple-directory has no pseudo session secret in this test environment')
    const member = await _axiosAuth({ email: 'kml_data_admin@koumoul-test.com', password: 'passwd', directoryUrl, org: 'koumoul', dep: 'data', axiosOpts: { baseURL, headers: { 'x-cache-bypass': '1' } } })
    const supportAdmin = await _axiosAuth({ email: 'kml_support_admin@koumoul-test.com', password: 'passwd', directoryUrl, org: 'koumoul', dep: 'support', axiosOpts: { baseURL, headers: { 'x-cache-bypass': '1' } } })
    await member.put('/api/v1/datasets/pseudo-dep-data', { isRest: true, title: 'Pseudo data dep' })
    await supportAdmin.put('/api/v1/datasets/pseudo-dep-support', { isRest: true, title: 'Pseudo support dep' })
    const own = (await member.get('/api/v1/datasets')).data.results.map((d: any) => d.id)
    assert.deepEqual(own, ['pseudo-dep-data'])

    const cookie = await pseudoSessionCookie({
      user: { id: 'kml_data_admin', email: 'kml_data_admin@koumoul-test.com', name: 'Koumoul Data Admin', organizations: [] },
      account: { type: 'organization', id: 'koumoul', name: 'Koumoul', department: 'data' },
      accountRole: 'admin',
      lang: 'en'
    })
    const listed = (await withCookie(cookie).get('/api/v1/datasets')).data.results.map((d: any) => d.id)
    assert.deepEqual(listed, own)
  })

  test('is a session of the organization of an NHI', async () => {
    test.skip(!pseudoAvailable, 'simple-directory has no pseudo session secret in this test environment')
    const admin = await axiosAuth('test_user1@test.com', 'test_org1')
    await admin.put('/api/v1/datasets/pseudo-nhi', { isRest: true, title: 'Pseudo nhi' })
    const { accessToken } = await nhiSession()
    const exp = decodeJwt(accessToken).exp!
    const cookie = await pseudoSessionCookie({
      user: { id: scopeNhiId, email: 'test_org1_scope_nhi@test.com', name: 'scope nhi', organizations: [], nhi: 1, exp } as any,
      account: { type: 'organization', id: 'test_org1', name: 'Test Org1' },
      accountRole: 'admin',
      lang: 'en'
    })
    // only the dataset of the organization is listed: the active account is the organization, not the personal account of the NHI
    const list = await withCookie(cookie).get('/api/v1/datasets')
    assert.deepEqual(list.data.results.map((d: any) => d.id), ['pseudo-nhi'])
  })
})

test.describe('GET /applications/:id/preview', () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(120000)
    await clean()
    await clearRateLimiting()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  const skipUnlessAvailable = () => {
    test.skip(!pseudoAvailable, 'simple-directory has no pseudo session secret in this test environment')
    test.skip(!captureAvailable, 'capture is not available in this test environment')
  }

  const createApp = async (ax: any, id: string, isPublic: boolean) => {
    await ax.put('/api/v1/datasets/' + id + '-data', { isRest: true, title: id + ' data' })
    if (isPublic) await ax.put(`/api/v1/datasets/${id}-data/permissions`, [{ classes: ['list', 'read'] }])
    const { data: dataset } = await ax.get('/api/v1/datasets/' + id + '-data')
    const { data: app } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: id })
    await ax.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ href: dataset.href, id: dataset.id }] })
    if (isPublic) await ax.put(`/api/v1/applications/${app.id}/permissions`, [{ classes: ['read'] }])
    return app.id as string
  }

  test('renders an application on a public dataset', async () => {
    skipUnlessAvailable()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const id = await createApp(ax, 'preview-public', true)
    const res = await ax.get(`/api/v1/applications/${id}/preview`)
    assert.equal(res.status, 200)
    assert.equal(res.data.image.mediaType, 'image/png')
    assert.ok(res.data.image.data.length > 100)
    assert.equal(typeof res.data.text, 'string')
    assert.ok(new URL(res.data.report.url).pathname.endsWith('/app/' + id), res.data.report.url)
    assert.ok(['ok', 'errors'].includes(res.data.report.verdict), JSON.stringify(res.data.report))
    assert.ok(!res.data.report.finalUrl.includes('/simple-directory/login'), res.data.report.finalUrl)
  })

  test('opens the draft of the application when asked', async () => {
    skipUnlessAvailable()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const id = await createApp(ax, 'preview-draft', true)
    const res = await ax.get(`/api/v1/applications/${id}/preview`, { params: { draft: true, viewport: 'mobile', fullPage: true, app_foo: 'bar' } })
    assert.equal(res.status, 200)
    const url = new URL(res.data.report.url)
    assert.equal(url.searchParams.get('draft'), 'true')
    assert.equal(url.searchParams.get('foo'), 'bar')
    const plain = await ax.get(`/api/v1/applications/${id}/preview`)
    assert.ok(!new URL(plain.data.report.url).searchParams.has('draft'))
  })

  test('renders a private application as the member who asks', async () => {
    skipUnlessAvailable()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const id = await createApp(ax, 'preview-private', false)
    const res = await ax.get(`/api/v1/applications/${id}/preview`)
    assert.equal(res.status, 200)
    assert.notEqual(res.data.report.verdict, 'unauthenticated', JSON.stringify(res.data.report))
    // an anonymous visitor is not allowed to preview it
    await assert.rejects(anonymousAx.get(`/api/v1/applications/${id}/preview`), { status: 403 })
  })

  test('needs an authenticated session even on a public application', async () => {
    skipUnlessAvailable()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const id = await createApp(ax, 'preview-anonymous', true)
    await assert.rejects(anonymousAx.get(`/api/v1/applications/${id}/preview`), { status: 401 })
  })

  test('is limited by the scopes of the session', async () => {
    skipUnlessAvailable()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const id = await createApp(ax, 'preview-scoped', false)
    const datasetsOnly = await nhiSession('datasets:read')
    await assert.rejects(datasetsOnly.bearerAx.get(`/api/v1/applications/${id}/preview`), { status: 403 })
    // the render reads the private dataset with the permissions of the account
    const applicationsOnly = await nhiSession('applications:read')
    const res = await applicationsOnly.bearerAx.get(`/api/v1/applications/${id}/preview`)
    assert.equal(res.status, 200)
    assert.notEqual(res.data.report.verdict, 'unauthenticated', JSON.stringify(res.data.report))
  })

  test('refuses calls over the rate limit', async () => {
    skipUnlessAvailable()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const id = await createApp(ax, 'preview-rate', true)
    // the default is 30 calls per 600 s: a smaller budget keeps the test from rendering 30 pages
    await setConfig('defaultLimits.apiRate.appPreviews.nb', 2)
    try {
      await clearRateLimiting()
      assert.equal((await ax.get(`/api/v1/applications/${id}/preview`)).status, 200)
      assert.equal((await ax.get(`/api/v1/applications/${id}/preview`)).status, 200)
      await assert.rejects(ax.get(`/api/v1/applications/${id}/preview`), { status: 429 })
    } finally {
      await setConfig('defaultLimits.apiRate.appPreviews.nb', 30)
      await clearRateLimiting()
    }
  })

  test('is a tool of the platform document, offered with the applications read scope', async () => {
    const doc = (await anonymousAx.get('/api/v1/platform/api-docs.json')).data
    const warn = console.warn
    console.warn = () => {} // refs simple-directory's schemas make to $ids the document does not embed
    let toolSet
    try {
      toolSet = await load(doc, { lint: 'error' })
    } finally {
      console.warn = warn
    }
    const names = (scopes: string[]) => toolsForScopes(toolSet, scopes).tools.map(tool => tool.name)
    assert.ok(names(['applications:read']).includes('datafair_preview_application'))
    assert.ok(!names(['datasets:read']).includes('datafair_preview_application'))
    const tool = toolSet.tools.find(t => t.name === 'datafair_preview_application')!
    assert.ok(tool)
  })
})
