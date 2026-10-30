import { readFileSync } from 'node:fs'
import { importPKCS8, SignJWT } from 'jose'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import type { AxiosInstance } from 'axios'
import { baseURL, directoryUrl } from './axios.ts'

export const scopeNhiId = 'test_org1_scope_nhi'
const issuer = 'https://data-fair-tests.example.com'
const subject = 'scope-tests'
// the site origin simple-directory sees (reqSiteUrl), the assertion audience
const audience = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}`

const privateKey = await importPKCS8(
  readFileSync(new URL('../resources/nhi/test-nhi-key.pem', import.meta.url), 'utf8'),
  'RS256'
)

/**
 * Exchange an assertion of the test NHI for a session limited to the requested scope
 * (no scope: an unrestricted session). Returns an axios authenticated by the session cookies
 * and one authenticated by the bearer access token.
 */
export const nhiSession = async (scope?: string): Promise<{ cookieAx: AxiosInstance, bearerAx: AxiosInstance, accessToken: string }> => {
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-nhi-key' })
    .setIssuer(issuer)
    .setSubject(subject)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(privateKey)
  const res = await axiosBuilder().post(`${directoryUrl}/api/auth/nhi-token`, { client_id: scopeNhiId, assertion, ...(scope ? { scope } : {}) })
  const accessToken: string = res.data.access_token
  const cookies = (res.headers['set-cookie'] ?? []).map((c: string) => c.split(';')[0]).join('; ')
  const headers = { 'x-cache-bypass': '1' }
  return {
    cookieAx: axiosBuilder({ baseURL, headers: { ...headers, cookie: cookies } }),
    bearerAx: axiosBuilder({ baseURL, headers: { ...headers, authorization: `Bearer ${accessToken}` } }),
    accessToken
  }
}
