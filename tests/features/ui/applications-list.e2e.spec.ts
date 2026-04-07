import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

test.describe('applications list page', () => {
  let applicationId: string

  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const baseApps = await ax.get('/api/v1/base-applications', { params: { size: 1 } })
    if (!baseApps.data.results?.length) return
    const baseApp = baseApps.data.results[0]
    const res = await ax.post('/api/v1/applications', {
      url: baseApp.url,
      title: 'Test Application E2E List',
    })
    applicationId = res.data.id
  })

  test('page loads and shows search and sort controls', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/applications', 'test_user1')
    // Search field should be visible (use textbox role to avoid strict mode issues with clearable icon)
    await expect(page.getByRole('textbox', { name: 'Rechercher' })).toBeVisible({ timeout: 10000 })
    // Sort select should be visible
    await expect(page.locator('.v-select').filter({ hasText: 'Trier par' })).toBeVisible({ timeout: 10000 })
  })

  test('page loads and displays application cards when applications exist', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth('/data-fair/applications', 'test_user1')
    // At least one application card should appear
    await expect(page.locator('.v-card').first()).toBeVisible({ timeout: 10000 })
  })

  test('results count is displayed when applications exist', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth('/data-fair/applications', 'test_user1')
    await expect(page.getByText(/applications/)).toBeVisible({ timeout: 10000 })
  })

  test('search filters results (q param appears in URL)', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth('/data-fair/applications', 'test_user1')
    const searchField = page.getByRole('textbox', { name: 'Rechercher' })
    await expect(searchField).toBeVisible({ timeout: 10000 })

    await searchField.fill('Test Application')

    // Wait for debounce (300ms) and URL update
    await page.waitForURL(/[?&]q=Test/, { timeout: 5000 })
    await expect(page).toHaveURL(/q=Test/)
  })

  test('search with no match shows empty state', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/applications', 'test_user1')
    const searchField = page.getByRole('textbox', { name: 'Rechercher' })
    await expect(searchField).toBeVisible({ timeout: 10000 })

    await searchField.fill('__no_match_xyz_12345__')

    // Wait for debounce and URL update
    await page.waitForURL(/[?&]q=__no_match_xyz_12345__/, { timeout: 5000 })
    // Empty state message should appear
    await expect(page.getByText(/Aucun résultat ne correspond/)).toBeVisible({ timeout: 10000 })
  })

  test('sort changes URL param', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/applications', 'test_user1')
    const sortSelect = page.locator('.v-select').filter({ hasText: 'Trier par' })
    await expect(sortSelect).toBeVisible({ timeout: 10000 })

    // Click the sort select wrapper
    await sortSelect.click()
    await page.getByRole('option', { name: 'Titre (A → Z)' }).click()

    // URL should reflect the new sort
    await page.waitForURL(/sort=title%3A1|sort=title:1/, { timeout: 5000 })
    await expect(page).toHaveURL(/sort=title/)
  })

  test('"Nouvelle application" button is visible for contributors', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/applications', 'test_user1')
    // There may be two "Nouvelle application" links: one in the empty state and one in the right navigation
    await expect(page.getByRole('link', { name: /nouvelle application/i }).first()).toBeVisible({ timeout: 10000 })
  })

  test('"Nouvelle application" button navigates to new-application page', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/applications', 'test_user1')
    await page.getByRole('link', { name: /nouvelle application/i }).first().click()
    await page.waitForURL(/new-application/, { timeout: 10000 })
  })

  test('empty state shown when no applications match search', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/applications?q=__nothing__', 'test_user1')
    await expect(page.getByText(/Aucun résultat ne correspond/)).toBeVisible({ timeout: 10000 })
  })
})
