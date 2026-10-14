import { request, type BrowserContext } from '@playwright/test'
import { test as base, expect } from './diagnostics.ts'

/**
 * Sessions come from simple-directory's API, not its login form: one login per user and account
 * (POST /api/auth/password, then its callback), shared by every test of the worker.
 *
 * Sharing is safe because no page ever presents the exchange token (id_token_ex): lib-vue skips
 * its session keepalive while localStorage['sd-keepalive'] is recent, and the init script below
 * sets it in the future. Without that, each page load would rotate the single-use token and the
 * next test replaying the old one outside simple-directory's 60 s grace would be logged out.
 * The id_token itself expires after 15 min, so a session older than 10 min is logged in again.
 */
type AccountOpts = { org?: string, dep?: string, adminMode?: boolean }

const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}`
const directoryUrl = `${baseUrl}/simple-directory`
const maxAge = 10 * 60 * 1000

type Cookies = Parameters<BrowserContext['addCookies']>[0]
const sessions = new Map<string, { at: number, cookies: Cookies }>()

const apiLogin = async (user: string, opts: AccountOpts): Promise<Cookies> => {
  const ctx = await request.newContext()
  try {
    const res = await ctx.post(`${directoryUrl}/api/auth/password`, {
      params: { redirect: `${baseUrl}/data-fair/` },
      data: { email: `${user}@test.com`, password: 'passwd', ...opts }
    })
    expect(res.ok(), `login of ${user} failed: ${res.status()} ${await res.text()}`).toBe(true)
    // the callback sets the session cookies and redirects to the app
    const callback = await ctx.get(await res.text(), { maxRedirects: 0 })
    expect(callback.status(), `login callback of ${user} failed: ${callback.headers().location}`).toBe(302)
    return (await ctx.storageState()).cookies
  } finally {
    await ctx.dispose()
  }
}

const sessionCookies = async (user: string, opts: AccountOpts) => {
  const key = [user, opts.org ?? '', opts.dep ?? '', opts.adminMode ?? ''].join('|')
  let session = sessions.get(key)
  if (!session || Date.now() - session.at > maxAge) {
    session = { at: Date.now(), cookies: await apiLogin(user, opts) }
    sessions.set(key, session)
  }
  return session.cookies
}

/**
 * - `goToWithAuth(url, user, opts?)`: lands on url logged in as user, with the organization /
 *   department of opts as active account, or in admin mode (super admins).
 * - `page` override: French, cache bypass, and no session keepalive (see above).
 */
export const test = base.extend<{
  goToWithAuth: (url: string, user: string, opts?: AccountOpts) => Promise<void>
}>({
  page: async ({ page }, use) => {
    await page.context().addCookies([
      { name: 'i18n_lang', value: 'fr', url: baseUrl },
      { name: 'cache_bypass', value: '1', url: baseUrl }
    ])
    // ponytail: relies on lib-vue's internal key (decided: option A of playwright-standard.md §4.1)
    await page.context().addInitScript(() => {
      window.localStorage.setItem('sd-keepalive', String(Date.now() + 365 * 86400_000))
    })
    await use(page)
  },

  goToWithAuth: async ({ page, context }, use) => {
    await use(async (url, user, opts = {}) => {
      // replace the session of a previous call (another user or account) as a whole
      await context.clearCookies({ name: /^id_token/ })
      await context.addCookies(await sessionCookies(user, opts))
      await page.goto(url)
    })
  }
})

export { expect }
