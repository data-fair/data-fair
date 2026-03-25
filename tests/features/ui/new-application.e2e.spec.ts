import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, anonymousAx, apiUrl, clean, mockAppUrl } from '../../support/axios.ts'

test.describe('new application stepper', () => {
  test.beforeEach(async () => {
    await clean()
    // Make monapp2 (App test2) public so it appears in base app selection.
    // App test2 has an empty config schema (no dataset requirement) so it is never disabled.
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path: 'applications.1.public', value: true })
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/reload-base-apps`)
  })

  test('base app creation: full stepper flow', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-application', 'test_user1')

    // Step 1: Type selection
    const baseAppCard = page.locator('.v-card-title', { hasText: 'Nouvelle configuration' })
    await expect(baseAppCard).toBeVisible({ timeout: 10000 })
    await baseAppCard.click()

    // Step 2: Base app selection - verify category heading and base apps appear
    await expect(page.getByText('Application de type')).toBeVisible({ timeout: 10000 })

    // Click "App test2" base app card (the one without dataset requirement, so not disabled)
    const appCard = page.locator('.v-card-title', { hasText: 'App test2' })
    await expect(appCard).toBeVisible({ timeout: 10000 })
    await appCard.click()

    // Step 3: Info - verify title is pre-filled and save
    const titleInput = page.getByLabel(/Titre de la nouvelle application/)
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await expect(titleInput).not.toHaveValue('')

    await page.getByRole('button', { name: /Enregistrer/ }).click()

    // Should redirect to application page
    await expect(page).toHaveURL(/\/application\//, { timeout: 30000 })
  })

  test('copy creation: full stepper flow', async ({ page, goToWithAuth }) => {
    // Pre-create an application to copy
    const ax = await axiosAuth('test_user1@test.com')
    await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'App To Copy E2E' })

    await goToWithAuth('/data-fair/new-application', 'test_user1')

    // Step 1: Select copy type
    const copyCard = page.locator('.v-card-title', { hasText: "Copie d'application" })
    await expect(copyCard).toBeVisible({ timeout: 10000 })
    await copyCard.click()

    // Step 2: Search for the pre-created app
    const autocomplete = page.getByRole('combobox', { name: /Choisissez une application/ })
    await expect(autocomplete).toBeVisible({ timeout: 5000 })
    await autocomplete.click()
    await page.keyboard.type('App To Copy', { delay: 50 })

    // Wait for dropdown results (debounced search)
    const listItem = page.locator('.v-overlay__content .v-list-item', { hasText: 'App To Copy E2E' })
    await expect(listItem).toBeVisible({ timeout: 15000 })
    await listItem.click()

    // Step 3: Info - verify title has (copie) suffix
    const titleInput = page.getByLabel(/Titre de la nouvelle application/)
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await expect(titleInput).toHaveValue(/copie/)

    await page.getByRole('button', { name: /Enregistrer/ }).click()

    // Should redirect to application page
    await expect(page).toHaveURL(/\/application\//, { timeout: 30000 })
  })

  test('step navigation: back button returns to step 1', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-application', 'test_user1')

    // Step 1: Select base app type
    const baseAppCard = page.locator('.v-card-title', { hasText: 'Nouvelle configuration' })
    await expect(baseAppCard).toBeVisible({ timeout: 10000 })
    await baseAppCard.click()

    // Step 2: Wait for base apps, select one (App test2 has no dataset requirement so it is not disabled)
    const appCard = page.locator('.v-card-title', { hasText: 'App test2' })
    await expect(appCard).toBeVisible({ timeout: 10000 })
    await appCard.click()

    // Step 3: Click back
    await expect(page.getByRole('button', { name: /Retour/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Retour/ }).click()

    // Should be back on step 1
    await expect(page.getByText('Choisissez la manière dont vous souhaitez')).toBeVisible({ timeout: 5000 })
  })

  test('custom app message is visible on base app step', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-application', 'test_user1')

    // Step 1: Select base app type
    const baseAppCard = page.locator('.v-card-title', { hasText: 'Nouvelle configuration' })
    await expect(baseAppCard).toBeVisible({ timeout: 10000 })
    await baseAppCard.click()

    // Verify the Koumoul custom app message appears
    await expect(page.getByText('applications personnalisées')).toBeVisible({ timeout: 5000 })
  })
})
