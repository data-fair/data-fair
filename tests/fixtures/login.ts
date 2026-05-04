import { test as base, expect } from '@playwright/test'

const cookieCache = new Map<string, Awaited<ReturnType<import('@playwright/test').BrowserContext['cookies']>>>()

async function performLogin (page: any, context: any, baseUrl: string, url: string, user: string) {
  const fullUrl = `${baseUrl}${url}`
  const loginUrl = `${baseUrl}/simple-directory/login?redirect=${encodeURIComponent(fullUrl)}`
  await page.goto(loginUrl)
  await page.getByLabel('Adresse mail').fill(`${user}@test.com`)
  await page.getByLabel('Mot de passe').fill('passwd')
  await page.getByRole('button', { name: 'Se connecter' }).click()
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
          await page.goto(url)
          // Safety: if redirected to login, cache was stale.
          if (page.url().includes('/simple-directory/login')) {
            cookieCache.delete(user)
            await performLogin(page, context, baseUrl, '/data-fair/', user)
            await applyAccountCookies(cookieCache.get(user), opts)
            await page.goto(url)
          }
        }
        await use(goToWithAuth)
      }
    })

export { expect }
