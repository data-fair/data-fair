import { test as base, expect } from '@playwright/test'

/**
 * Session cookies are reused across tests to avoid logging in again for every one of them.
 *
 * The cached set must always be the freshest one: simple-directory hands out a single-use exchange
 * token (id_token_ex) and rotates it on each session keepalive — which the app performs on every
 * top-level page load. Replaying an already consumed token outside a short grace window (~30s) is
 * treated as a stolen token: the session is destroyed server side, the keepalive answers 401 and the
 * page renders the anonymous landing page instead of the requested one. That is why the cache is
 * refreshed after each test and a destroyed session triggers a new login (see goToWithAuth).
 */
const cookieCache = new Map<string, Awaited<ReturnType<import('@playwright/test').BrowserContext['cookies']>>>()

/** Resolve once the app's session keepalive settled, or with null if this page did not perform one. */
const waitForKeepalive = (page: any) =>
  page.waitForResponse((res: any) => res.url().includes('/api/auth/keepalive'), { timeout: 3000 })
    .catch(() => null)

async function performLogin (page: any, context: any, baseUrl: string, url: string, user: string) {
  const fullUrl = `${baseUrl}${url}`
  const loginUrl = `${baseUrl}/simple-directory/login?redirect=${encodeURIComponent(fullUrl)}`
  await page.goto(loginUrl)
  await page.getByLabel('Adresse mail').fill(`${user}@test.com`)
  await page.getByLabel('Mot de passe', { exact: true }).fill('passwd')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  // super-admin accounts get an "activate admin mode for this session?" interstitial that blocks
  // the redirect; keep a normal session (the dedicated adminMode fixtures handle the admin case).
  // Regular users redirect straight to fullUrl, so race the two outcomes to avoid a fixed wait.
  const normalSession = page.getByRole('button', { name: 'Session Normale' })
  const sawInterstitial = await Promise.race([
    normalSession.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false),
    page.waitForURL(fullUrl, { timeout: 10000 }).then(() => false, () => false)
  ])
  if (sawInterstitial) await normalSession.click()
  await page.waitForURL(fullUrl, { timeout: 10000 })
  const cookies = await context.cookies()
  cookieCache.set(user, cookies)
}

/**
 * Custom test fixture that provides:
 * - `goToWithAuth(url, user, opts?)`: navigates to the simple-directory login page,
 *   fills in credentials, optionally sets the active organization (via id_token_org
 *   cookie — same effect as clicking the org in the personal menu, but no UI
 *   round-trip), then navigates to the target URL.
 * - `page` override: sets i18n_lang=fr cookie on every page.
 */
export const test = base.extend<{
  goToWithAuth: (url: string, user: string, opts?: { org?: string, dep?: string }) => Promise<void>
}>({
      page: async ({ page }, use) => {
        const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
        await page.context().addCookies([{
          name: 'i18n_lang',
          value: 'fr',
          url: baseUrl
        }, {
          name: 'cache_bypass',
          value: '1',
          url: baseUrl
        }])
        await use(page)
      },

      goToWithAuth: async ({ page, context }, use) => {
        const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
        let lastUser: string | undefined
        const applyAccountCookies = async (cached: any[] | undefined, opts: { org?: string, dep?: string }) => {
          // Strip any cached id_token_org/id_token_dep so opts wins deterministically;
          // they may have been captured in performLogin from a previous test that
          // ended in a different active-account state.
          const base = (cached ?? []).filter(c => c.name !== 'id_token_org' && c.name !== 'id_token_dep')
          if (opts.org) {
            base.push({ name: 'id_token_org', value: opts.org, url: baseUrl })
            if (opts.dep) base.push({ name: 'id_token_dep', value: opts.dep, url: baseUrl })
          }
          if (base.length) await context.addCookies(base)
        }
        const goToWithAuth = async (url: string, user: string, opts: { org?: string, dep?: string } = {}) => {
          let cached = cookieCache.get(user)
          if (!cached) {
            // Login lands on /data-fair/ in personal context; the org cookie set
            // by applyAccountCookies below switches active account on the next nav.
            await performLogin(page, context, baseUrl, '/data-fair/', user)
            cached = cookieCache.get(user)
          }
          await applyAccountCookies(cached, opts)
          const keepalive = waitForKeepalive(page)
          await page.goto(url)
          // Safety: the cache was stale (redirected to login) or the session was destroyed server
          // side (consumed exchange token replayed — the app then silently renders as anonymous).
          if (page.url().includes('/simple-directory/login') || !((await keepalive)?.ok() ?? true)) {
            cookieCache.delete(user)
            await performLogin(page, context, baseUrl, '/data-fair/', user)
            await applyAccountCookies(cookieCache.get(user), opts)
            await page.goto(url)
          }
          lastUser = user
        }
        await use(goToWithAuth)

        // Hand the rotated cookies to the next test rather than the ones this test already consumed.
        if (lastUser) {
          const cookies = await context.cookies()
          if (cookies.some(c => c.name === 'id_token' && c.value)) cookieCache.set(lastUser, cookies)
          else cookieCache.delete(lastUser)
        }
      }
    })

export { expect }
