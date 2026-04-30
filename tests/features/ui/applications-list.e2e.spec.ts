import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'

test.describe('applications list page', () => {
  let applicationId: string

  test.beforeAll(async () => {
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

  test('initial page state: cards, count, controls and contributor action all visible', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth('/data-fair/applications', 'test_user1')

    // Application cards rendered
    await expect(page.locator('.v-card').first()).toBeVisible({ timeout: 10000 })

    // Results count
    await expect(page.getByText(/applications/)).toBeVisible()

    // Controls
    await expect(page.getByRole('textbox', { name: 'Rechercher' })).toBeVisible()
    await expect(page.locator('.v-select').filter({ hasText: 'Trier par' })).toBeVisible()

    // "Nouvelle application" link visible
    await expect(page.getByRole('link', { name: /nouvelle application/i }).first()).toBeVisible()
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

test.describe('base-application facet display', () => {
  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    // Create 2 applications from mock app so the base-application facet appears
    await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'App One' })
    await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'App Two' })
  })

  test.afterAll(async () => {
    await checkPendingTasks()
  })

  test('base-application facet shows app names, not [object Object]', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/applications', 'test_user1')
    await expect(page.locator('.v-card').first()).toBeVisible({ timeout: 10000 })

    const navRight = page.locator('#navigation-right-local')
    const baseAppFacet = navRight.getByRole('combobox', { name: "Modèle d'application" })
    await expect(baseAppFacet).toBeVisible({ timeout: 5000 })
    await baseAppFacet.click()

    const listbox = page.getByRole('listbox', { name: "Modèle d'application" })
    const options = listbox.getByRole('option')
    await expect(options.first()).toBeVisible({ timeout: 5000 })
    const count = await options.count()
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent()
      expect(text).not.toContain('[object Object]')
    }
  })
})

test.describe('application topics facet display', () => {
  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    // Create topics
    const settingsRes = await ax.put('/api/v1/settings/user/test_user1', {
      topics: [{ title: 'Environnement' }]
    })
    const topics = settingsRes.data.topics
    // Create an application and assign a topic
    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'Topic App' })).data
    await ax.patch(`/api/v1/applications/${app.id}`, { topics: [topics[0]] })
  })

  test.afterAll(async () => {
    await checkPendingTasks()
  })

  test('topics facet displays topic titles, not [object Object]', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/applications', 'test_user1')
    await expect(page.locator('.v-card').first()).toBeVisible({ timeout: 10000 })

    const navRight = page.locator('#navigation-right-local')
    const topicsFacet = navRight.getByRole('combobox', { name: 'Thématiques' })
    await expect(topicsFacet).toBeVisible({ timeout: 5000 })
    await topicsFacet.click()

    const listbox = page.getByRole('listbox', { name: 'Thématiques' })
    const options = listbox.getByRole('option')
    await expect(options.first()).toBeVisible({ timeout: 5000 })
    const count = await options.count()
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent()
      expect(text).not.toContain('[object Object]')
      expect(text).toContain('Environnement')
    }
  })
})
