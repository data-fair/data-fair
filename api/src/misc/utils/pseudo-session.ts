import config from '#config'
import type { SessionStateAuthenticated } from '@data-fair/lib-express'
// simple-directory is part of our own infrastructure (configured url, not user input)
import { privateAxios as axios } from './axios.ts'

// default lifetime of the pseudo session of a caller whose own token carries no expiration
const defaultDuration = 120

/**
 * Asks simple-directory for a short-lived GET-only session of the same user and active account as the caller,
 * so that a service can browse the platform on his behalf. Returns the value of a Cookie header: id_token and id_token_sign, plus id_token_org and id_token_dep which select the active account.
 */
export const pseudoSessionCookie = async (session: SessionStateAuthenticated): Promise<string> => {
  const exp = (session.user as { exp?: number }).exp ?? Math.floor(Date.now() / 1000) + defaultDuration
  const res = await axios.post(`${config.privateDirectoryUrl}/api/auth/pseudo`, {
    type: 'user',
    id: session.user.id,
    organization: session.account.type === 'organization' ? session.account.id : undefined,
    department: session.account.department,
    exp
  }, { headers: { 'x-secret-key': config.secretKeys.pseudoSession } })
  const cookies: string[] = res.headers['set-cookie'] ?? []
  return cookies
    .map(c => c.split(';')[0])
    // the active account is selected by the id_token_org and id_token_dep cookies, without them the session
    // is the personal account of the user; the other cookies are only cleared (empty value)
    .filter(c => /^(id_token|id_token_sign|id_token_org|id_token_dep)=[^=]/.test(c))
    .join('; ')
}
