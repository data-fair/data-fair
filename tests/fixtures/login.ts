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
        const setOrgCookies = async (org: string, dep?: string) => {
          const orgCookies: { name: string, value: string, url: string }[] = [
            { name: 'id_token_org', value: org, url: baseUrl }
          ]
          if (dep) orgCookies.push({ name: 'id_token_dep', value: dep, url: baseUrl })
          await context.addCookies(orgCookies)
        }
        const goToWithAuth = async (url: string, user: string, opts: { org?: string, dep?: string } = {}) => {
          const cached = cookieCache.get(user)
          if (cached) {
            await context.addCookies(cached)
            if (opts.org) await setOrgCookies(opts.org, opts.dep)
            await page.goto(url)
          } else {
            // Cold cache. Set the org cookie FIRST so it is present at the very first
            // data-fair page load (after the login redirect) — that's when session.js
            // readState() runs and picks the active account from cookies.
            if (opts.org) await setOrgCookies(opts.org, opts.dep)
            await performLogin(page, context, baseUrl, url, user)
          }
          // Safety: if redirected to login, cache was stale.
          if (page.url().includes('/simple-directory/login')) {
            cookieCache.delete(user)
            if (opts.org) await setOrgCookies(opts.org, opts.dep)
            await performLogin(page, context, baseUrl, url, user)
          }
        }
        await use(goToWithAuth)
      }
    })

export { expect }
