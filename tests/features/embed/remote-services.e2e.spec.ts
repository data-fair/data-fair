import { test as base, expect } from '@playwright/test'
import { clean } from '../../support/axios.ts'

const test = base.extend<{
  goToAsAdmin: (path: string) => Promise<void>
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
      goToAsAdmin: async ({ page }, use) => {
        const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
        let loggedIn = false
        const goToAsAdmin = async (path: string) => {
          if (!loggedIn) {
            const fullUrl = `${baseUrl}${path}`
            const loginUrl = `${baseUrl}/simple-directory/login?redirect=${encodeURIComponent(fullUrl)}&adminMode=true`
            await page.goto(loginUrl)
            await page.getByLabel('Adresse mail').fill('test_superadmin@test.com')
            await page.getByLabel('Mot de passe').fill('passwd')
            await page.getByRole('button', { name: 'Se connecter' }).click()
            await page.waitForURL(fullUrl, { timeout: 10000 })
            loggedIn = true
          } else {
            await page.goto(`${baseUrl}${path}`)
          }
        }
        await use(goToAsAdmin)
      }
    })

test.describe('remote-services pages', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays remote services list page', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/remote-services')
    await expect(page.getByText('Cet espace vous permet de gérer les services Web')).toBeVisible({ timeout: 10000 })
  })
})
