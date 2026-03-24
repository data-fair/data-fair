import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import path from 'path'

const testFile = path.resolve('tests/resources/datasets/dataset1.csv')

test.describe('new dataset stepper', () => {
  test('file dataset creation: full stepper flow', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    // Step 1: Type selection
    await expect(page.getByText('Fichier')).toBeVisible({ timeout: 10000 })
    await page.getByText('Fichier').click()

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
    await expect(page.getByRole('button', { name: /Lancer l'import/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Lancer l'import/ }).click()

    // Should redirect to dataset page
    await expect(page).toHaveURL(/\/dataset\//, { timeout: 30000 })
  })

  test('REST dataset creation', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    // Select REST type
    await expect(page.getByText('Éditable')).toBeVisible({ timeout: 10000 })
    await page.getByText('Éditable').click()

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
    await expect(page.getByText('Métadonnées seules')).toBeVisible({ timeout: 10000 })
    await page.getByText('Métadonnées seules').click()

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

  test('virtual dataset creation', async ({ page, goToWithAuth }) => {
    // Pre-create datasets to use as children
    const ax = await axiosAuth('test_user1@test.com')
    const child1 = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    // Select virtual type
    await expect(page.getByText('Virtuel')).toBeVisible({ timeout: 10000 })
    await page.getByText('Virtuel').click()

    // Fill title
    const titleInput = page.getByLabel(/Titre du jeu de données/)
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await titleInput.fill('Test Virtual Dataset E2E')

    // Search and select a child dataset
    const childrenInput = page.getByLabel(/Jeux enfants/)
    await childrenInput.click()
    await childrenInput.fill(child1.title.slice(0, 5))
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 10000 })
    await page.getByRole('option').first().click()

    // Verify chip appears
    await expect(page.getByText(child1.title).first()).toBeVisible()

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
    await expect(page.getByText('Fichier')).toBeVisible({ timeout: 10000 })
    await page.getByText('Fichier').click()

    // Step 1 should now show subtitle with type name
    await expect(page.getByText('Fichier')).toBeVisible()

    // Skip init
    await page.getByRole('button', { name: /Ignorer/ }).click()

    // We're on params step - go back by clicking the editable step 1 header
    // The stepper header item for step 1 should be clickable
    const stepTypeHeader = page.locator('.v-stepper-item').first()
    await stepTypeHeader.click()

    // Should be back on step 1
    await expect(page.getByText('Choisissez le type de jeu de données')).toBeVisible({ timeout: 5000 })
  })

  test('simple mode hides virtual type', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset?simple=true', 'test_user1')

    await expect(page.getByText('Fichier')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Éditable')).toBeVisible()
    await expect(page.getByText('Métadonnées seules')).toBeVisible()
    // Virtual should not be visible
    await expect(page.locator('.v-card').filter({ hasText: 'Virtuel' })).not.toBeVisible()
  })
})
