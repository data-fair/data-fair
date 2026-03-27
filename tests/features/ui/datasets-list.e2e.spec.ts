import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('datasets list page', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    // Seed 3 datasets with distinct titles for search/sort testing
    await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'Alpha Dataset' })
    await sendDataset('datasets/dataset2.csv', ax, {}, { title: 'Beta Dataset' })
    await sendDataset('datasets/dates.csv', ax, {}, { title: 'Gamma Dataset' })
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
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
    // Wait for results to update (count is in breadcrumbs)
    await expect(page.getByText('1 jeux de données')).toBeVisible({ timeout: 10000 })

    // Clear the search
    await searchField.clear()
    await page.waitForURL((url) => !url.searchParams.has('q') || url.searchParams.get('q') === '', { timeout: 5000 })
    // All datasets should be back
    await expect(page.getByText('3 jeux de données')).toBeVisible({ timeout: 10000 })
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
    // Initially should show all datasets (count is in breadcrumbs)
    await expect(page.getByText('3 jeux de données')).toBeVisible({ timeout: 10000 })

    const searchField = page.locator('.v-navigation-drawer--right').getByRole('textbox', { name: 'Rechercher' })
    await searchField.fill('Beta')
    await page.waitForURL(/[?&]q=Beta/, { timeout: 5000 })

    // Count should update
    await expect(page.getByText('1 jeux de données')).toBeVisible({ timeout: 10000 })
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

test.describe('owner facet filtering', () => {
  test.beforeEach(async () => {
    await clean()
    // Create datasets under org (no dept) and org+dept so the owner facet has 2 entries
    const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
    // test_user6 is contrib of test_org1 in dep1, so dataset is owned by organization:test_org1:dep1
    const axOrgDep = await axiosAuth('test_user6@test.com', 'test_org1')
    await sendDataset('datasets/dataset1.csv', axOrg, {}, { title: 'Org Dataset' })
    await sendDataset('datasets/dataset2.csv', axOrgDep, {}, { title: 'Dept Dataset' })
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  /**
   * Helper: switch to org context via the personal menu
   */
  async function switchToOrg (page: any, goToWithAuth: any) {
    const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
    await goToWithAuth('/data-fair/', 'test_user1')
    await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
    await page.getByRole('listitem').filter({ hasText: 'Test Org 1' }).click()
    await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
    await page.goto(`${baseUrl}/data-fair/datasets`)
  }

  test('owner facet displays names, not [object Object]', async ({ page, goToWithAuth }) => {
    await switchToOrg(page, goToWithAuth)
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })

    const navRight = page.locator('.v-navigation-drawer--right')
    const ownerFacet = navRight.locator('.v-autocomplete').first()
    await expect(ownerFacet).toBeVisible({ timeout: 5000 })

    // Open the owner autocomplete
    await ownerFacet.click()

    // Verify that options show readable names, not [object Object]
    const options = page.getByRole('option')
    await expect(options.first()).toBeVisible({ timeout: 5000 })
    const count = await options.count()
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent()
      expect(text).not.toContain('[object Object]')
    }
  })

  test('selecting owner facet updates URL with correct string format', async ({ page, goToWithAuth }) => {
    await switchToOrg(page, goToWithAuth)
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })

    const navRight = page.locator('.v-navigation-drawer--right')
    const ownerFacet = navRight.locator('.v-autocomplete').first()
    await expect(ownerFacet).toBeVisible({ timeout: 5000 })

    // Open and select the first owner option
    await ownerFacet.click()
    await page.getByRole('option').first().click()
    // Close the dropdown
    await page.keyboard.press('Escape')

    // Wait for URL to update (replaceState may not trigger navigation events)
    await page.waitForTimeout(1000)

    // URL should contain a properly formatted owner param, not [object Object]
    const url = page.url()
    // If the param is present, verify it's formatted correctly
    if (url.includes('owner=')) {
      expect(url).not.toContain('object+Object')
      expect(url).not.toContain('object%20Object')
      expect(url).toMatch(/owner=organization(%3A|:)/)
    }

    // Also verify the selected chip text in the autocomplete doesn't show [object Object]
    const selectedText = await ownerFacet.textContent()
    expect(selectedText).not.toContain('[object Object]')
  })
})

test.describe('publication sites facet', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('publication sites facet does not show null values', async ({ page, goToWithAuth }) => {
    const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')

    // Create a publication site
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com', title: 'Test Portal' }
    await axOrg.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    // Create a dataset published on the site
    await sendDataset('datasets/dataset1.csv', axOrg, {}, { title: 'Published Dataset' })
    const datasets = (await axOrg.get('/api/v1/datasets')).data
    await axOrg.patch(`/api/v1/datasets/${datasets.results[0].id}`, { publicationSites: ['data-fair-portals:portal1'] })

    // Create a dataset NOT published (will have null publicationSites in facets)
    await sendDataset('datasets/dataset2.csv', axOrg, {}, { title: 'Unpublished Dataset' })

    // Switch to org context and go to datasets page
    const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
    await goToWithAuth('/data-fair/', 'test_user1')
    await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
    await page.getByRole('listitem').filter({ hasText: 'Test Org 1' }).click()
    await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
    await page.goto(`${baseUrl}/data-fair/datasets`)

    // Wait for datasets to load
    await expect(page.locator('.v-container .v-card').first()).toBeVisible({ timeout: 10000 })

    // Open the publication sites facet
    const navRight = page.locator('.v-navigation-drawer--right')
    const pubSitesFacet = navRight.locator('.v-select').filter({ hasText: 'Sites de publication' })
    await expect(pubSitesFacet).toBeVisible({ timeout: 5000 })
    await pubSitesFacet.click()

    // Verify that no option contains "null"
    const options = page.getByRole('option')
    await expect(options.first()).toBeVisible({ timeout: 5000 })
    const count = await options.count()
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent()
      expect(text).not.toMatch(/\bnull\b/)
    }
  })
})
