// Session cookies of the account given to the harness, for a private benchmark dataset.
// A dev dataset should not be public: the test suites run against the same dev API and
// count every dataset a user can read, so a public dataset breaks them.

export interface Cookie { name: string, value: string, url: string, httpOnly: boolean, sameSite?: 'Strict' | 'Lax' | 'None' }

export function parseSetCookie (header: string, origin: string): Cookie {
  const [pair, ...attrs] = header.split(';').map(s => s.trim())
  const eq = pair.indexOf('=')
  const cookie: Cookie = { name: pair.slice(0, eq), value: pair.slice(eq + 1), url: origin + '/', httpOnly: false }
  for (const attr of attrs) {
    const [key, val] = attr.split('=')
    const k = key.toLowerCase()
    if (k === 'path') cookie.url = origin + val
    else if (k === 'httponly') cookie.httpOnly = true
    else if (k === 'samesite') cookie.sameSite = (val[0].toUpperCase() + val.slice(1).toLowerCase()) as Cookie['sameSite']
  }
  return cookie
}

/** A fresh login for every browser context: simple-directory's exchange token is single
 * use, replaying cookies from an earlier context would get the session destroyed. */
export interface Credentials { email: string, password: string, org?: string }

export async function loginCookies (origin: string, creds: Credentials): Promise<Cookie[]> {
  const directoryUrl = `${origin}/simple-directory`
  const res = await fetch(`${directoryUrl}/api/auth/password?redirect=${encodeURIComponent(directoryUrl)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds)
  })
  if (!res.ok) throw new Error(`login of ${creds.email} failed: HTTP ${res.status} ${await res.text()}`)
  const callbackUrl = (await res.text()).replace(/^"|"$/g, '')
  const callback = await fetch(callbackUrl, { redirect: 'manual' })
  const cookies = callback.headers.getSetCookie().map(h => parseSetCookie(h, origin))
  if (!cookies.some(c => c.name === 'id_token')) throw new Error(`login of ${creds.email} returned no session (HTTP ${callback.status})`)
  return cookies
}

export const cookieHeader = (cookies: Cookie[]) => cookies.map(c => `${c.name}=${c.value}`).join('; ')
