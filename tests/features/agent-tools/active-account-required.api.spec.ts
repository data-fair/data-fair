/**
 * mine=true and shared=false scope a listing to the active account. Without an account there is
 * nothing to scope to, and the API used to drop the parameters silently: an "account" tool then
 * listed every account's public resources, and an agent presented them as its own.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, anonymousAx, clean, checkPendingTasks } from '../../support/axios.ts'

const MESSAGE = 'This listing is limited to the active account and needs an authenticated session.'

const user1 = await axiosAuth('test_user1@test.com', 'test_org1')
const user3 = await axiosAuth('test_user3@test.com')

// the message an agent gets in production; the dev API appends the stack after it
const refusal = async (promise: Promise<any>, message = MESSAGE) => {
  const err: any = await promise.then(() => assert.fail('expected a 401'), (err: any) => err)
  assert.equal(err.status, 401)
  assert.ok(String(err.data).includes(message), `unexpected body: ${err.data}`)
}
// without accept-language the API answers in its default locale (fr)
const en = { headers: { 'accept-language': 'en' } }

test.describe('account-scoped listings need an account', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => { if (testInfo.status === 'passed') await checkPendingTasks() })

  test('anonymous mine=true and shared=false are refused on datasets and applications', async () => {
    const other = (await user3.post('/api/v1/datasets', { isRest: true, title: 'public other' })).data
    await user3.put(`/api/v1/datasets/${other.id}/permissions`, [{ classes: ['read', 'list'] }])
    // the public dataset is listed anonymously when no account scope is asked for
    assert.ok((await anonymousAx.get('/api/v1/datasets')).data.results.some((d: any) => d.id === other.id))

    for (const resource of ['datasets', 'applications']) {
      await refusal(anonymousAx.get(`/api/v1/${resource}`, { params: { mine: 'true' }, ...en }))
      await refusal(anonymousAx.get(`/api/v1/${resource}`, { params: { shared: 'false' }, ...en }))
    }
  })

  test('facets are refused too, not widened', async () => {
    await refusal(anonymousAx.get('/api/v1/datasets', { params: { mine: 'true', facets: 'owner' }, ...en }))
  })

  test('the message follows the request language', async () => {
    await refusal(
      anonymousAx.get('/api/v1/datasets', { params: { mine: 'true' }, headers: { 'accept-language': 'fr' } }),
      'Cette liste est limitée au compte actif et nécessite une session authentifiée.'
    )
  })

  test('an authenticated account is still scoped, not refused', async () => {
    const own = (await user1.post('/api/v1/datasets', { isRest: true, title: 'own' })).data
    const res = await user1.get('/api/v1/datasets', { params: { mine: 'true' } })
    assert.deepEqual(res.data.results.map((d: any) => d.id), [own.id])
  })
})
