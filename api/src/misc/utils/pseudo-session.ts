import config from '#config'
import type { SessionStateAuthenticated } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
// simple-directory is part of our own infrastructure (configured url, not user input)
import { privateAxios as axios } from './axios.ts'

// default lifetime of the pseudo session of a caller whose own token carries no expiration
const defaultDuration = 120

/**
 * Maps a failure of a call to an internal service to the status the preview answers with: 504 on a timeout,
 * 503 when the service does not answer at all, else 502. The messages carry the status codes only, never
 * what the service answered (it could echo secrets or cookies).
 */
export const upstreamError = (service: string, err: any) => {
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return httpError(504, `${service} timed out`)
  if (!err.status) return httpError(503, `${service} is unreachable`)
  return httpError(502, `${service} failed (${err.status})`)
}

/** The preview needs the capture service and the pseudo sessions of simple-directory */
export const assertPreviewConfigured = () => {
  if (!(config.privateCaptureUrl || config.captureUrl) || !config.secretKeys.capture || !config.secretKeys.pseudoSession) {
    throw httpError(501, 'the preview is not configured on this platform (capture service and pseudo sessions)')
  }
}

/**
 * Asks simple-directory for a short-lived GET-only session of the same user and active account as the caller,
 * so that a service can browse the platform on his behalf. Returns the value of a Cookie header: id_token and id_token_sign, plus id_token_org and id_token_dep which select the active account.
 */
export const pseudoSessionCookie = async (session: SessionStateAuthenticated): Promise<string> => {
  const exp = (session.user as { exp?: number }).exp ?? Math.floor(Date.now() / 1000) + defaultDuration
  let cookies: string[]
  try {
    const res = await axios.post(`${config.privateDirectoryUrl}/api/auth/pseudo`, {
      type: 'user',
      id: session.user.id,
      organization: session.account.type === 'organization' ? session.account.id : undefined,
      department: session.account.department,
      exp
    }, { headers: { 'x-secret-key': config.secretKeys.pseudoSession } })
    cookies = res.headers['set-cookie'] ?? []
  } catch (err: any) {
    // an identity simple-directory does not know, typically the user of an organization API key
    if (err.status === 404) throw httpError(400, 'previews need a user or agent session')
    // pseudo sessions disabled, wrong secret... a platform problem, not the caller's
    throw upstreamError('the directory service', err)
  }
  const cookie = cookies
    .map(c => c.split(';')[0])
    // the active account is selected by the id_token_org and id_token_dep cookies, without them the session
    // is the personal account of the user; the other cookies are only cleared (empty value)
    .filter(c => /^(id_token|id_token_sign|id_token_org|id_token_dep)=[^=]/.test(c))
  // rendering anonymously would answer with a login page and pass for a success
  if (!cookie.some(c => c.startsWith('id_token='))) throw httpError(502, 'the directory service did not open a session to render the page')
  return cookie.join('; ')
}
