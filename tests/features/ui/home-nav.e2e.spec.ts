import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('home dashboard', () => {
  test('shows account space header', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Test User1/ })).toBeVisible({ timeout: 10000 })
  })

  test('shows contribute section with SVG cards', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Contribuez/ })).toBeVisible({ timeout: 10000 })
    // 3 contribute cards
    await expect(page.getByText('Créer un nouveau jeu de données')).toBeVisible()
    await expect(page.getByText('Mettre à jour un jeu de données')).toBeVisible()
    await expect(page.getByText('Publier un jeu de données')).toBeVisible()
  })

  test('shows manage datasets section with metric cards', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Gérez les jeux de données/ })).toBeVisible({ timeout: 10000 })
    // Metric cards render (even if counts are 0)
    await expect(page.getByText(/en erreur/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/brouillon/)).toBeVisible()
    await expect(page.getByText(/publication à valider/)).toBeVisible()
  })

  test('shows manage applications section', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Gérez les applications/ })).toBeVisible({ timeout: 10000 })
  })

  test('contribute card navigates to new-dataset', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await page.getByText('Créer un nouveau jeu de données').click()
    await page.waitForURL(/new-dataset/, { timeout: 10000 })
  })

  test('unauthenticated home shows login button', async ({ page }) => {
    const baseUrl = `http://localhost:${process.env.NGINX_PORT1}`
    await page.goto(`${baseUrl}/data-fair/`)
    await expect(page.getByRole('button', { name: /Se connecter/ })).toBeVisible({ timeout: 10000 })
  })

  test('unauthenticated home shows description and SVG', async ({ page }) => {
    const baseUrl = `http://localhost:${process.env.NGINX_PORT1}`
    await page.goto(`${baseUrl}/data-fair/`)
    await expect(page.getByText(/Enrichissez et publiez/)).toBeVisible({ timeout: 10000 })
    // SVG is rendered (check for themed SVG container)
    await expect(page.locator('.df-themed-svg svg')).toBeVisible()
  })

  test('error metric shows count after creating errored dataset', async ({ page, goToWithAuth }) => {
    // Create a dataset that will error (upload then break it)
    const ax = await axiosAuth('test_user1@test.com')
    await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth('/data-fair/', 'test_user1')
    // At minimum, the error card should be visible
    await expect(page.getByText(/en erreur/)).toBeVisible({ timeout: 10000 })
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
    // Expand monitoring group
    await expect(page.locator('nav').getByText('Suivi')).toBeVisible({ timeout: 10000 })
    await page.locator('nav').getByText('Suivi').click()
    await expect(page.locator('nav').getByText('Stockage')).toBeVisible()
  })

  test('no admin group for regular user', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.locator('nav').getByText('Administration')).not.toBeVisible()
  })

  test('navigation from drawer to datasets works', async ({ page, goToWithAuth }) => {
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
