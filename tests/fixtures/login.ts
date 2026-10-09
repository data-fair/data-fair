import { test as base, expect } from '@playwright/test'

/**
 * Session cookies are reused across tests to avoid logging in again for every one of them.
 * They are cached per user AND active account: simple-directory keeps the active organization on
 * its side (the login's `org`/`dep` parameters) and re-emits id_token_org/id_token_dep on each
 * keepalive — a cookie set by hand is expired by the next keepalive, so switching account means
 * logging in again with other parameters.
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

type AccountOpts = { org?: string, dep?: string }

const cacheKey = (user: string, opts: AccountOpts) => [user, opts.org ?? '', opts.dep ?? ''].join('|')

async function performLogin (page: any, context: any, baseUrl: string, url: string, user: string, opts: AccountOpts) {
  const fullUrl = `${baseUrl}${url}`
  let loginUrl = `${baseUrl}/simple-directory/login?redirect=${encodeURIComponent(fullUrl)}`
  // the login page forwards these to simple-directory, which then activates this account
  if (opts.org) loginUrl += `&org=${encodeURIComponent(opts.org)}`
  if (opts.dep) loginUrl += `&dep=${encodeURIComponent(opts.dep)}`
  // drop the active account of a previous login in this context, or it would leak into this one
  await context.clearCookies({ name: 'id_token_org' })
  await context.clearCookies({ name: 'id_token_dep' })
  await page.goto(loginUrl)
  await page.getByLabel('Adresse mail').fill(`${user}@test.com`)
  await page.getByLabel('Mot de passe', { exact: true }).fill('passwd')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  // super-admin accounts get an "activate admin mode for this session?" interstitial that blocks
  // the redirect; keep a normal session (the dedicated adminMode fixtures handle the admin case).
  // Regular users redirect straight to fullUrl, so race the two outcomes to avoid a fixed wait.
  // the target page may rewrite its own query string on load, so do not wait for the exact URL
  const backOnApp = (u: URL) => u.origin === baseUrl && !u.pathname.startsWith('/simple-directory/')
  const normalSession = page.getByRole('button', { name: 'Session Normale' })
  const sawInterstitial = await Promise.race([
    normalSession.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false),
    page.waitForURL(backOnApp, { timeout: 10000 }).then(() => false, () => false)
  ])
  if (sawInterstitial) await normalSession.click()
  await page.waitForURL(backOnApp, { timeout: 10000 })
  const cookies = await context.cookies()
  cookieCache.set(cacheKey(user, opts), cookies)
}

/**
 * Custom test fixture that provides:
 * - `goToWithAuth(url, user, opts?)`: logs in through the simple-directory login page
 *   (optionally with an active organization / department, see performLogin) and lands
 *   on the target URL; later calls for the same user and account reuse the session.
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
        let lastKey: string | undefined
        const goToWithAuth = async (url: string, user: string, opts: AccountOpts = {}) => {
          const key = cacheKey(user, opts)
          lastKey = key
          const cached = cookieCache.get(key)
          if (!cached) {
            // log in straight to the target: no intermediate page whose own navigations could
            // interrupt the next goto
            await performLogin(page, context, baseUrl, url, user, opts)
            return
          }
          // the cached set carries its own id_token_org/id_token_dep (or none for a personal account)
          await context.clearCookies({ name: 'id_token_org' })
          await context.clearCookies({ name: 'id_token_dep' })
          await context.addCookies(cached)
          const keepalive = waitForKeepalive(page)
          await page.goto(url)
          // Safety: the cache was stale (redirected to login) or the session was destroyed server
          // side (consumed exchange token replayed — the app then silently renders as anonymous).
          if (page.url().includes('/simple-directory/login') || !((await keepalive)?.ok() ?? true)) {
            cookieCache.delete(key)
            await performLogin(page, context, baseUrl, url, user, opts)
          }
        }
        await use(goToWithAuth)

        // Hand the rotated cookies to the next test rather than the ones this test already consumed.
        if (lastKey) {
          const cookies = await context.cookies()
          const cookie = (name: string) => cookies.find(c => c.name === name)?.value || undefined
          // a test that switched account through the UI leaves a session whose active account is no
          // longer the one this cache key logged in with (simple-directory keeps it): do not reuse it
          const [, org, dep] = lastKey.split('|')
          const sameAccount = cookie('id_token_org') === (org || undefined) && cookie('id_token_dep') === (dep || undefined)
          if (sameAccount && cookie('id_token')) cookieCache.set(lastKey, cookies)
          else cookieCache.delete(lastKey)
        }
      }
    })

export { expect }
