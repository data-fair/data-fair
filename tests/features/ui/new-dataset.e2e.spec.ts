import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import path from 'path'

const testFile = path.resolve('tests/resources/datasets/dataset1.csv')

test.describe('new dataset stepper', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('file dataset creation: full stepper flow', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    // Step 1: Type selection
    const fileCard = page.locator('.v-card-title', { hasText: 'Fichier' })
    await expect(fileCard).toBeVisible({ timeout: 10000 })
    await fileCard.click()

    // Step 2: Init from (optional) - skip it
    await expect(page.getByText('Cette étape est optionnelle')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Ignorer/ }).click()

    // Step 3: Params - upload file
    await expect(page.getByText('Chargez un fichier de données principal')).toBeVisible({ timeout: 5000 })
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(testFile)

    // Continue to action step
    await page.getByRole('button', { name: /Continuer/ }).click()

    // Step 4: Action - create
    await expect(page.getByRole('button', { name: /Lancer l'import/ })).toBeEnabled({ timeout: 5000 })
    await page.getByRole('button', { name: /Lancer l'import/ }).click()

    // Should redirect to dataset page
    await expect(page).toHaveURL(/\/dataset\//, { timeout: 30000 })

    // Verify dataset page loaded with title
    await expect(page.locator('.text-headline-large').first()).toBeVisible({ timeout: 30000 })
  })

  test('REST dataset creation', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    // Select REST type
    const restCard = page.locator('.v-card-title', { hasText: 'Éditable' })
    await expect(restCard).toBeVisible({ timeout: 10000 })
    await restCard.click()

    // Skip init from
    await page.getByRole('button', { name: /Ignorer/ }).click()

    // Fill title
    const titleInput = page.getByLabel(/Titre du jeu de données/)
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await titleInput.fill('Test REST Dataset E2E')

    // Continue
    await page.getByRole('button', { name: /Continuer/ }).click()

    // Create
    await expect(page.getByRole('button', { name: /Créer le jeu de données/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Créer le jeu de données/ }).click()

    // Should redirect
    await expect(page).toHaveURL(/\/dataset\//, { timeout: 30000 })
  })

  test('metaOnly dataset creation', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    // Select meta only type
    const metaCard = page.locator('.v-card-title', { hasText: 'Métadonnées seules' })
    await expect(metaCard).toBeVisible({ timeout: 10000 })
    await metaCard.click()

    // Fill title
    const titleInput = page.getByLabel(/Titre du jeu de données/)
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await titleInput.fill('Test MetaOnly Dataset E2E')

    // Continue
    await page.getByRole('button', { name: /Continuer/ }).click()

    // Create
    await expect(page.getByRole('button', { name: /Créer le jeu de données/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Créer le jeu de données/ }).click()

    // Should redirect
    await expect(page).toHaveURL(/\/dataset\//, { timeout: 30000 })
  })

  // TODO: skipped due to Vuetify 4 VAutocomplete render crash in dataset-children-select custom item template
  test.skip('virtual dataset creation', async ({ page, goToWithAuth }) => {
    // Pre-create a child dataset with a unique title
    const ax = await axiosAuth('test_user1@test.com')
    const child1 = await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'Virtual Child E2E' })

    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    // Select virtual type
    const virtualCard = page.locator('.v-card-title', { hasText: 'Virtuel' })
    await expect(virtualCard).toBeVisible({ timeout: 10000 })
    await virtualCard.click()

    // Fill title
    const titleInput = page.getByLabel(/Titre du jeu de données/)
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await titleInput.fill('Test Virtual Dataset E2E')

    // Search and select a child dataset
    const childrenInput = page.getByLabel(/Jeux enfants/)
    await childrenInput.click()
    await childrenInput.pressSequentially('Virtual', { delay: 50 })

    // Wait for dropdown with the child dataset option
    const dropdown = page.locator('.v-overlay__content .v-list')
    await expect(dropdown.locator('.v-list-item', { hasText: 'Virtual Child E2E' })).toBeVisible({ timeout: 10000 })
    await dropdown.locator('.v-list-item', { hasText: 'Virtual Child E2E' }).click()

    // Verify chip appears
    await expect(page.locator('.v-chip', { hasText: child1.title })).toBeVisible({ timeout: 5000 })

    // Continue
    await page.getByRole('button', { name: /Continuer/ }).click()

    // Create
    await expect(page.getByRole('button', { name: /Créer le jeu de données/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Créer le jeu de données/ }).click()

    // Should redirect
    await expect(page).toHaveURL(/\/dataset\//, { timeout: 30000 })
  })

  test('step navigation: subtitles and editable steps', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    // Select file type
    const fileCard = page.locator('.v-card-title', { hasText: 'Fichier' })
    await expect(fileCard).toBeVisible({ timeout: 10000 })
    await fileCard.click()

    // Skip init
    await page.getByRole('button', { name: /Ignorer/ }).click()

    // We're on params step - go back by clicking the editable step 1 header
    const stepTypeHeader = page.locator('.v-stepper-item').first()
    await stepTypeHeader.click()

    // Should be back on step 1
    await expect(page.getByText('Choisissez le type de jeu de données')).toBeVisible({ timeout: 5000 })
  })

  test('simple mode hides virtual type', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset?simple=true', 'test_user1')

    const fileCard = page.locator('.v-card-title', { hasText: 'Fichier' })
    await expect(fileCard).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.v-card-title', { hasText: 'Éditable' })).toBeVisible()
    await expect(page.locator('.v-card-title', { hasText: 'Métadonnées seules' })).toBeVisible()
    // Virtual should not be visible
    await expect(page.locator('.v-card').filter({ hasText: 'Virtuel' })).not.toBeVisible()
  })
})
