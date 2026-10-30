import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

test.describe('home dashboard', () => {
  test.beforeAll(async () => {
    await clean()
  })

  test('shows the greeting and the personal space notice', { tag: '@smoke' }, async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: 'Bonjour Test User1' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Espace personnel')).toBeVisible()
    await expect(page.getByText(/mode collaboratif/)).toBeVisible()
  })

  test('shows the organization, the role and the creation buttons', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1', { org: 'test_org1' })
    await expect(page.locator('main').getByText('Test Org 1 Administrateur')).toBeVisible({ timeout: 10000 })
    await page.getByRole('link', { name: 'Créer un jeu de données' }).click()
    await page.waitForURL(/new-dataset/, { timeout: 10000 })
  })

  test('key figure opens the datasets list', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await page.getByTitle('Voir tous les jeux de données').click()
    await page.waitForURL(/\/datasets/, { timeout: 10000 })
  })

  test('to do card lists a requested publication', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await ax.post('/api/v1/settings/organization/test_org1/publication-sites', { type: 'data-fair-portals', id: 'home-portal', url: 'http://portal.com', title: 'Home Portal' })
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'home requested', schema: [{ key: 'a', type: 'string' }] })).data
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:home-portal'] })

    await goToWithAuth('/data-fair/', 'test_user1', { org: 'test_org1' })
    await expect(page.getByText('1 · Publication de jeu de données à valider')).toBeVisible({ timeout: 10000 })
    // the publication site also lists the portal in the right column
    await expect(page.getByText('Vos portails')).toBeVisible()
    await expect(page.getByText('Home Portal')).toBeVisible()
  })

  test('read-only role gets a notice instead of the to do card', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user8', { org: 'test_org1' })
    await expect(page.getByText('Vous consultez les données de Test Org 1')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('À traiter')).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Créer un jeu de données' })).not.toBeVisible()
  })

  test('unauthenticated home shows login button', { tag: '@smoke' }, async ({ page }) => {
    const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}`
    await page.goto(`${baseUrl}/data-fair/`)
    await expect(page.getByRole('button', { name: /Se connecter/ })).toBeVisible({ timeout: 10000 })
  })

  test('unauthenticated home shows description and SVG', async ({ page }) => {
    const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}`
    await page.goto(`${baseUrl}/data-fair/`)
    await expect(page.getByText(/Enrichissez et publiez/)).toBeVisible({ timeout: 10000 })
    // SVG is rendered (check for themed SVG container)
    await expect(page.locator('.df-themed-svg svg')).toBeVisible()
  })
})

test.describe('navigation drawer', () => {
  test('has collapsible content group with datasets and applications', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    // Content group should be expanded by default
    await expect(page.locator('nav').getByText('Jeux de données')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('nav').getByText('Applications')).toBeVisible()
  })

  test('has dashboard link', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.locator('nav').getByText('Tableau de bord')).toBeVisible({ timeout: 10000 })
  })

  test('management group is present', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    // For personal account (type=user), settings should be visible after expanding management
    await expect(page.locator('nav').getByText('Gestion')).toBeVisible({ timeout: 10000 })
    // Click to expand management group
    await page.locator('nav').getByText('Gestion').click()
    await expect(page.locator('nav').getByText('Paramètres')).toBeVisible()
  })

  test('monitoring group shows storage', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    // Expand monitoring group (exact match to not also catch "Suivi des agents")
    await expect(page.locator('nav').getByText('Suivi', { exact: true })).toBeVisible({ timeout: 10000 })
    await page.locator('nav').getByText('Suivi', { exact: true }).click()
    await expect(page.locator('nav').getByText('Stockage')).toBeVisible()
  })

  test('no admin group for regular user', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.locator('nav').getByText('Administration')).not.toBeVisible()
  })

  test('navigation from drawer to datasets works', { tag: '@smoke' }, async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await page.locator('nav').getByText('Jeux de données').click()
    await page.waitForURL(/datasets/, { timeout: 10000 })
  })

  test('help group shows API doc link', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    // Expand help group
    await expect(page.locator('nav').getByText('Aide')).toBeVisible({ timeout: 10000 })
    await page.locator('nav').getByText('Aide').click()
    await expect(page.locator('nav').getByText("Utiliser l'API")).toBeVisible()
  })
})
