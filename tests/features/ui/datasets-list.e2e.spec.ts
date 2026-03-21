import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('datasets list page', () => {
  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    // Seed 3 datasets with distinct titles for search/sort testing
    await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'Alpha Dataset' })
    await sendDataset('datasets/dataset2.csv', ax, {}, { title: 'Beta Dataset' })
    await sendDataset('datasets/dates.csv', ax, {}, { title: 'Gamma Dataset' })
    await checkPendingTasks()
  })

  test.afterAll(async () => {
    await checkPendingTasks()
  })

  test('page loads and shows search and sort controls in right navigation', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    // Controls are in the right navigation drawer
    const navRight = page.locator('.v-navigation-drawer--right')
    await expect(navRight.getByRole('textbox', { name: 'Rechercher' })).toBeVisible({ timeout: 10000 })
    await expect(navRight.locator('.v-select').filter({ hasText: 'Trier par' })).toBeVisible({ timeout: 10000 })
  })

  test('page loads and displays dataset cards when datasets exist', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })
  })

  test('results count is displayed when datasets exist', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.getByText(/jeux de données/)).toBeVisible({ timeout: 10000 })
  })

  test('search filters results (q param appears in URL)', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    const searchField = page.locator('.v-navigation-drawer--right').getByRole('textbox', { name: 'Rechercher' })
    await expect(searchField).toBeVisible({ timeout: 10000 })

    await searchField.fill('Alpha')

    // Wait for debounce (300ms) and URL update
    await page.waitForURL(/[?&]q=Alpha/, { timeout: 5000 })
    await expect(page).toHaveURL(/q=Alpha/)
  })

  test('search with no match shows empty state', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    const searchField = page.locator('.v-navigation-drawer--right').getByRole('textbox', { name: 'Rechercher' })
    await expect(searchField).toBeVisible({ timeout: 10000 })

    await searchField.fill('__no_match_xyz_12345__')

    await page.waitForURL(/[?&]q=__no_match_xyz_12345__/, { timeout: 5000 })
    await expect(page.getByText(/Aucun résultat ne correspond/)).toBeVisible({ timeout: 10000 })
  })

  test('sort changes URL param', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    const sortSelect = page.locator('.v-navigation-drawer--right .v-select').filter({ hasText: 'Trier par' })
    await expect(sortSelect).toBeVisible({ timeout: 10000 })

    await sortSelect.click()
    await page.getByRole('option', { name: 'Titre (A → Z)' }).click()

    await page.waitForURL(/sort=title%3A1|sort=title:1/, { timeout: 5000 })
    await expect(page).toHaveURL(/sort=title/)
  })

  test('grid/list view toggle works', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })

    // Toggle to list view (button is in the right navigation)
    const listToggle = page.locator('.v-navigation-drawer--right button[value="list"]')
    await listToggle.click()

    // In list view the items should be rendered in a v-list
    await expect(page.locator('.v-container .v-list .v-list-item').first()).toBeVisible({ timeout: 5000 })
  })

  test('"Créer un jeu de données" action is visible for contributors', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-navigation-drawer--right').getByText('Créer un jeu de données')).toBeVisible({ timeout: 10000 })
  })

  test('"Créer un jeu de données" action navigates to new-dataset page', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await page.locator('.v-navigation-drawer--right').getByText('Créer un jeu de données').click()
    await page.waitForURL(/new-dataset/, { timeout: 10000 })
  })

  test('empty state shown when no datasets for search', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets?q=__nothing__', 'test_user1')
    await expect(page.getByText(/Aucun résultat ne correspond/)).toBeVisible({ timeout: 10000 })
  })

  // --- New tests ---

  test('visibility icon is displayed on dataset cards', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })
    // Datasets have visibility set, so lock icons should be present in cards
    await expect(page.locator('.v-container .v-card .v-icon').first()).toBeVisible({ timeout: 5000 })
  })

  test('view mode persists across page reload', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })

    // Switch to list view
    await page.locator('.v-navigation-drawer--right button[value="list"]').click()
    await expect(page.locator('.v-container .v-list .v-list-item').first()).toBeVisible({ timeout: 5000 })

    // Reload and verify list view persists
    await page.reload()
    await expect(page.locator('.v-container .v-list .v-list-item').first()).toBeVisible({ timeout: 10000 })
  })

  test('search clear restores all results', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })

    const searchField = page.locator('.v-navigation-drawer--right').getByRole('textbox', { name: 'Rechercher' })
    await searchField.fill('Alpha')
    await page.waitForURL(/[?&]q=Alpha/, { timeout: 5000 })
    // Wait for results to update
    await expect(page.locator('.v-main').getByText('1 jeux de données')).toBeVisible({ timeout: 10000 })

    // Clear the search
    await searchField.clear()
    await page.waitForURL((url) => !url.searchParams.has('q') || url.searchParams.get('q') === '', { timeout: 5000 })
    // All datasets should be back
    await expect(page.locator('.v-main').getByText('3 jeux de données')).toBeVisible({ timeout: 10000 })
  })

  test('sort by title orders correctly', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })

    // Sort by title A→Z
    const sortSelect = page.locator('.v-navigation-drawer--right .v-select').filter({ hasText: 'Trier par' })
    await sortSelect.click()
    await page.getByRole('option', { name: 'Titre (A → Z)' }).click()
    await page.waitForURL(/sort=title/, { timeout: 5000 })

    // Wait for results to re-render
    await page.waitForTimeout(500)
    const cards = page.locator('.v-container .v-card .v-card-title')
    const firstTitle = await cards.first().textContent()
    expect(firstTitle?.trim()).toBe('Alpha Dataset')
  })

  test('results count updates after search', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    // Initially should show all datasets
    await expect(page.locator('.v-main').getByText('3 jeux de données')).toBeVisible({ timeout: 10000 })

    const searchField = page.locator('.v-navigation-drawer--right').getByRole('textbox', { name: 'Rechercher' })
    await searchField.fill('Beta')
    await page.waitForURL(/[?&]q=Beta/, { timeout: 5000 })

    // Count should update
    await expect(page.locator('.v-main').getByText('1 jeux de données')).toBeVisible({ timeout: 10000 })
  })

  test('empty state without search shows database icon', async ({ page, goToWithAuth }) => {
    // Use a user with no datasets
    await goToWithAuth('/data-fair/datasets', 'test_alone')
    await expect(page.getByText(/Vous n'avez pas encore créé/)).toBeVisible({ timeout: 10000 })
  })

  test('visibility icon is displayed in list view', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })

    // Switch to list view
    await page.locator('.v-navigation-drawer--right button[value="list"]').click()
    await expect(page.locator('.v-container .v-list .v-list-item').first()).toBeVisible({ timeout: 5000 })

    // Visibility icon should be present in list items
    await expect(page.locator('.v-container .v-list .v-list-item .v-icon').first()).toBeVisible({ timeout: 5000 })
  })

  test('multiple dataset cards are displayed', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    // We seeded 3 datasets, so 3 cards should be visible
    await expect(page.locator('.v-container .v-card')).toHaveCount(3, { timeout: 10000 })
  })

  test('facets are visible in right navigation', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    const navRight = page.locator('.v-navigation-drawer--right')
    // Wait for data to load and facets to appear
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })
    // At least the visibility facet should be present
    await expect(navRight.locator('.v-select, .v-autocomplete').first()).toBeVisible({ timeout: 5000 })
  })
})
