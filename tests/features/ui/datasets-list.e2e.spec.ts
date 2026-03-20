import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('datasets list page', () => {
  test.beforeAll(async () => {
    // Ensure at least one dataset exists for this user
    const ax = await axiosAuth('test_user1@test.com')
    const existing = await ax.get('/api/v1/datasets', { params: { size: 1 } })
    if (existing.data.total === 0) {
      await sendDataset('datasets/dataset1.csv', ax)
    }
  })

  test('page loads and shows search and sort controls', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    // Search field should be visible (use textbox role to avoid strict mode issues with clearable icon)
    await expect(page.getByRole('textbox', { name: 'Rechercher' })).toBeVisible({ timeout: 10000 })
    // Sort select should be visible
    await expect(page.locator('.v-select').filter({ hasText: 'Trier par' })).toBeVisible({ timeout: 10000 })
  })

  test('page loads and displays dataset cards when datasets exist', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    // At least one dataset card should appear
    await expect(page.locator('.v-card').first()).toBeVisible({ timeout: 10000 })
  })

  test('results count is displayed when datasets exist', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    // The count text should be visible since we have at least one dataset
    await expect(page.getByText(/jeux de données/)).toBeVisible({ timeout: 10000 })
  })

  test('search filters results (q param appears in URL)', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    const searchField = page.getByRole('textbox', { name: 'Rechercher' })
    await expect(searchField).toBeVisible({ timeout: 10000 })

    await searchField.fill('dataset1')

    // Wait for debounce (300ms) and URL update
    await page.waitForURL(/[?&]q=dataset1/, { timeout: 5000 })
    await expect(page).toHaveURL(/q=dataset1/)
  })

  test('search with no match shows empty state', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    const searchField = page.getByRole('textbox', { name: 'Rechercher' })
    await expect(searchField).toBeVisible({ timeout: 10000 })

    await searchField.fill('__no_match_xyz_12345__')

    // Wait for debounce and URL update
    await page.waitForURL(/[?&]q=__no_match_xyz_12345__/, { timeout: 5000 })
    // Empty state message should appear
    await expect(page.getByText(/Aucun résultat ne correspond/)).toBeVisible({ timeout: 10000 })
  })

  test('sort changes URL param', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    const sortSelect = page.locator('.v-select').filter({ hasText: 'Trier par' })
    await expect(sortSelect).toBeVisible({ timeout: 10000 })

    // Click the sort select (click on the control itself)
    await sortSelect.click()
    await page.getByRole('option', { name: 'Titre (A → Z)' }).click()

    // URL should reflect the new sort
    await page.waitForURL(/sort=title%3A1|sort=title:1/, { timeout: 5000 })
    await expect(page).toHaveURL(/sort=title/)
  })

  test('grid/list view toggle works', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-card').first()).toBeVisible({ timeout: 10000 })

    // Toggle to list view (mdi-view-list button)
    const listToggle = page.locator('button[value="list"]')
    await listToggle.click()

    // In list view the items should be rendered in a v-list
    await expect(page.locator('.v-list-item').first()).toBeVisible({ timeout: 5000 })
  })

  test('"Nouveau jeu de données" button is visible for contributors', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.getByRole('link', { name: /Nouveau jeu de données/ })).toBeVisible({ timeout: 10000 })
  })

  test('"Nouveau jeu de données" button navigates to new-dataset page', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await page.getByRole('link', { name: /Nouveau jeu de données/ }).click()
    await page.waitForURL(/new-dataset/, { timeout: 10000 })
  })

  test('empty state shown when no datasets for search', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets?q=__nothing__', 'test_user1')
    await expect(page.getByText(/Aucun résultat ne correspond/)).toBeVisible({ timeout: 10000 })
  })
})
