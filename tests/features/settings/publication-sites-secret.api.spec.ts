import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, anonymousAx, clean, checkPendingTasks, config, apiUrl } from '../../support/axios.ts'

// portals reaches the API on its private url with the shared secret, there is no session
const settingsUrl = `${apiUrl}/api/v1/settings`
const secretHeaders = (secretKey: string) => ({ headers: { 'x-secret-key': secretKey } })

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')

const portal = { type: 'data-fair-portals', id: 'portal-secret', url: 'http://portal.com', title: 'Portal secret' }

test.describe('publication sites with the portals secret key', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('publication sites accept the portals secret key', async () => {
    const url = `${settingsUrl}/organization/test_org1/publication-sites`
    let res = await anonymousAx.post(url, portal, secretHeaders(config.secretKeys.portals))
    assert.equal(res.status, 200)
    assert.equal(res.data.created, true)
    assert.equal(res.data.site.id, portal.id)
    assert.equal(res.data.subscriptions.length, 2)
    assert.ok(res.data.subscriptions[0].topic.key.startsWith('data-fair:dataset-publication-requested:'))
    assert.ok(res.data.subscriptions[1].topic.key.startsWith('data-fair:application-publication-requested:'))
    assert.deepEqual(res.data.subscriptions[0].sender, { type: 'organization', id: 'test_org1' })

    res = await anonymousAx.post(url, portal, secretHeaders(config.secretKeys.portals))
    assert.equal(res.status, 200)
    assert.equal(res.data.created, false)
    assert.deepEqual(res.data.subscriptions, [])

    let sites = (await testUser1Org.get('/api/v1/settings/organization/test_org1/publication-sites')).data
    assert.ok(sites.some((s: any) => s.type === portal.type && s.id === portal.id))

    res = await anonymousAx.delete(`${url}/${portal.type}/${portal.id}`, secretHeaders(config.secretKeys.portals))
    assert.equal(res.status, 200)
    sites = (await testUser1Org.get('/api/v1/settings/organization/test_org1/publication-sites')).data
    assert.ok(!sites.some((s: any) => s.type === portal.type && s.id === portal.id))
  })

  test('a department owner is read from the path', async () => {
    const res = await anonymousAx.post(`${settingsUrl}/organization/test_org1:dep1/publication-sites`, portal, secretHeaders(config.secretKeys.portals))
    assert.equal(res.data.created, true)
    assert.deepEqual(res.data.subscriptions[0].sender, { type: 'organization', id: 'test_org1', department: 'dep1' })
    const testUser4Org = await axiosAuth('test_user4@test.com', 'test_org1')
    const sites = (await testUser4Org.get('/api/v1/settings/organization/test_org1:dep1/publication-sites')).data
    assert.ok(sites.some((s: any) => s.id === portal.id))
  })

  test('a wrong secret key is refused', async () => {
    const url = `${settingsUrl}/organization/test_org1/publication-sites`
    for (const key of [config.secretKeys.portals + 'x', '']) {
      await assert.rejects(anonymousAx.post(url, portal, secretHeaders(key)),
        (err: any) => err.status === 401 || err.status === 403)
      await assert.rejects(anonymousAx.delete(`${url}/${portal.type}/${portal.id}`, secretHeaders(key)),
        (err: any) => err.status === 401 || err.status === 403)
    }
    // a session that is not admin of the owner is not helped by a wrong key either
    await assert.rejects(testUser1.post('/api/v1/settings/organization/test_org1/publication-sites', portal, secretHeaders('wrong')),
      (err: any) => err.status === 401 || err.status === 403)
    const sites = (await testUser1Org.get('/api/v1/settings/organization/test_org1/publication-sites')).data
    assert.ok(!sites.some((s: any) => s.id === portal.id))
  })

  test('a user owner is created without any header but the key', async () => {
    const res = await anonymousAx.post(`${settingsUrl}/user/test_user1/publication-sites`, portal, secretHeaders(config.secretKeys.portals))
    assert.equal(res.data.created, true)
    const settings = (await testUser1.get('/api/v1/settings/user/test_user1')).data
    assert.ok(settings.publicationSites.some((s: any) => s.id === portal.id))
  })
})
