// Session cookies of the dev user, for the private fixtures-table-perf dataset.
// The fixture cannot be public: the test suites run against the same dev API and count
// every dataset a user can read, so a public dataset breaks them.
// Same credentials and account as dev/fixtures.ts (dev/resources/users.json).

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
export async function loginCookies (origin: string): Promise<Cookie[]> {
  const directoryUrl = `${origin}/simple-directory`
  const res = await fetch(`${directoryUrl}/api/auth/password?redirect=${encodeURIComponent(directoryUrl)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alban.mouton@koumoul.com', password: 'passwd', org: 'dev_fixtures' })
  })
  if (!res.ok) throw new Error(`dev user login failed: HTTP ${res.status} ${await res.text()}`)
  const callbackUrl = (await res.text()).replace(/^"|"$/g, '')
  const callback = await fetch(callbackUrl, { redirect: 'manual' })
  const cookies = callback.headers.getSetCookie().map(h => parseSetCookie(h, origin))
  if (!cookies.some(c => c.name === 'id_token')) throw new Error(`dev user login returned no session (HTTP ${callback.status})`)
  return cookies
}

export const cookieHeader = (cookies: Cookie[]) => cookies.map(c => `${c.name}=${c.value}`).join('; ')
