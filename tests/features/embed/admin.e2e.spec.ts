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

test.describe('admin pages', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays info page with status and services', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/info')
    await expect(page.getByText('Statut :')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Data Fair - Back Office')).toBeVisible({ timeout: 10000 })
  })

  test('displays errors page with empty state messages', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/errors')
    await expect(page.getByText('Aucun jeu de données en erreur')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Aucune application en erreur')).toBeVisible({ timeout: 10000 })
  })

  test('displays owners page with title', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/owners')
    await expect(page.getByRole('heading', { name: 'Propriétaires' })).toBeVisible({ timeout: 10000 })
  })

  test('displays base-apps page with title', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/base-apps')
    await expect(page.getByRole('heading', { name: "Modèles d'application" })).toBeVisible({ timeout: 10000 })
  })

  test('displays agents page with title and organization selector', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/agents')
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByLabel('Organisation')).toBeVisible({ timeout: 10000 })
  })
})
