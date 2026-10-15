import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, apiUrl, baseURL } from '../../support/axios.ts'
import { setConfig, clearRateLimiting } from '../../support/workers.ts'

// The limiter keys an anonymous request on its client IP as the reverse proxy forwards it (an IPv6
// one on its /64); a request with neither a user nor a forwarded IP is a misconfiguration and fails
// (docs/architecture/agent-rate-limiting.md §4). These tests call the API directly with the headers a
// correctly configured proxy sets: the dev nginx overwrites X-Forwarded-For with the test client's
// address, so it cannot stand for several clients.
const forwardedHost = new URL(baseURL).host
const from = (ip: string) => axios({ baseURL: apiUrl, headers: { 'X-Forwarded-For': ip, 'X-Forwarded-Host': forwardedHost, 'X-Forwarded-Proto': 'http' } })
const list = (ax: ReturnType<typeof axios>) => ax.get('/api/v1/datasets', { validateStatus: () => true })

test.describe('rate limiting by client IP', () => {
  test.beforeAll(async () => {
    await setConfig('defaultLimits.apiRate.anonymous.nb', 1)
  })
  test.afterAll(async () => {
    await setConfig('defaultLimits.apiRate.anonymous.nb', 100) // the dev/test default (api/config/development.cjs)
    await clearRateLimiting()
  })
  test.beforeEach(async () => {
    await clearRateLimiting()
  })

  test('two anonymous clients have their own budgets', async () => {
    const a = from('192.0.2.1')
    const b = from('192.0.2.2')
    assert.equal((await list(a)).status, 200)
    assert.equal((await list(a)).status, 429, 'the same client exhausts its budget')
    assert.equal((await list(b)).status, 200, 'another client is not charged for it')
  })

  test('an IPv6 client is limited on its /64, and a 429 says when to retry', async () => {
    assert.equal((await list(from('2001:db8:1:2::1'))).status, 200)
    const refused = await list(from('2001:db8:1:2::2'))
    assert.equal(refused.status, 429, 'another address of the same /64 shares its budget')
    assert.match(String(refused.headers['retry-after']), /^[1-9]\d*$/)
    assert.equal((await list(from('2001:db8:1:3::1'))).status, 200, 'another /64 does not')
  })

  test('an anonymous request with no forwarded IP is refused, not limited on a pod address', async () => {
    const internal = axios({ baseURL: apiUrl }) // straight to the API, no reverse proxy
    const res = await internal.get('/api/v1/datasets', { validateStatus: () => true })
    assert.equal(res.status, 500)
    assert.match(String(res.data), /X-Forwarded-For/)
  })
})
