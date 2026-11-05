import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import path from 'node:path'
import { decodeJwt } from 'jose'
import { axiosAuth as _axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import { axios, axiosAuth, clean, checkPendingTasks, baseURL, directoryUrl } from '../../support/axios.ts'
import { nhiSession, scopeNhiId } from '../../support/nhi.ts'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

// simple-directory only answers to /api/auth/pseudo when it has a pseudo session secret
const pseudoSecret = 'secret-pseudo-session'
const pseudoAvailable = await fetch(`http://localhost:${process.env.SD_PORT}/api/auth/pseudo`, { method: 'POST', headers: { 'x-secret-key': pseudoSecret, 'content-type': 'application/json' }, body: '{}' })
  .then(res => res.status === 400, () => false)

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
