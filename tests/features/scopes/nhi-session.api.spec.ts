import { test, expect } from '@playwright/test'
import { decodeJwt, decodeProtectedHeader } from 'jose'
import { nhiSession } from '../../support/nhi.ts'

test.describe('test non-human identity session', () => {
  test('a scoped exchange returns a cookie session and a scoped access token', async () => {
    const { cookieAx, accessToken } = await nhiSession('datasets:read')
    expect(decodeProtectedHeader(accessToken).kid).toMatch(/^scoped-/)
    expect(decodeJwt(accessToken).scope).toBe('datasets:read')
    expect(cookieAx.defaults.headers.cookie).toContain('id_token=')
  })

  test('an unscoped session is unaffected in data-fair', async () => {
    const { cookieAx, accessToken } = await nhiSession()
    expect(decodeJwt(accessToken).scope).toBeUndefined()
    const res = await cookieAx.get('/api/v1/datasets')
    expect(res.status).toBe(200)
  })
})
