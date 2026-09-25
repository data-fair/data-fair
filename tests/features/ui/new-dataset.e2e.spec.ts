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

    // Verify dataset page loaded
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 30000 })
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

  test('REST dataset initialized from a metadata-only dataset copies all its metadata', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await ax.post('/api/v1/datasets/meta-sheet', { isMetaOnly: true, title: 'Meta sheet', description: 'A description', keywords: ['kw1'] })

    await goToWithAuth('/data-fair/new-dataset', 'test_user1')
    await page.locator('.v-card-title', { hasText: 'Éditable' }).click()

    const modelInput = page.getByRole('combobox', { name: /comme modèle/ })
    await modelInput.click()
    await page.locator('.v-overlay__content .v-list-item', { hasText: 'Meta sheet' }).click()
    await page.keyboard.press('Escape')

    await expect(page.getByLabel('Copier les métadonnées')).toBeChecked()
    await expect(page.getByLabel('Résumé et description')).toBeChecked()
    await expect(page.getByLabel('Mots-clés')).toBeChecked()
    await expect(page.getByLabel('Copier la donnée')).toHaveCount(0)

    await page.getByRole('button', { name: /Continuer/ }).click()
    await page.getByLabel(/Titre du jeu de données/).fill('Data from meta sheet')
    await page.getByRole('button', { name: /Continuer/ }).click()
    await page.getByRole('button', { name: /Créer le jeu de données/ }).click()
    await expect(page).toHaveURL(/\/dataset\//, { timeout: 30000 })

    const datasetId = page.url().match(/\/dataset\/([^/?#]+)/)![1]
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${datasetId}`)).data.keywords, { timeout: 15000 }).toEqual(['kw1'])
    expect((await ax.get(`/api/v1/datasets/${datasetId}`)).data.description).toBe('A description')
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

  test('the confirmation step recaps what is about to be created', async ({ page, goToWithAuth }) => {
    // Without this recap the step shows only an owner picker, so someone told
    // "your dataset is configured, just click Create" — by the assistant or by
    // the stepper itself — has nothing on screen to check that against.
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    const restCard = page.locator('.v-card-title', { hasText: 'Éditable' })
    await expect(restCard).toBeVisible({ timeout: 10000 })
    await restCard.click()
    await page.getByRole('button', { name: /Ignorer/ }).click()
    await page.getByLabel(/Titre du jeu de données/).fill('Demandes de subvention')
    await page.getByLabel(/Conserver un historique complet/).check()
    await page.getByRole('button', { name: /Continuer/ }).click()

    const recap = page.getByTestId('dataset-recap')
    await expect(recap).toBeVisible({ timeout: 5000 })
    await expect(recap).toContainText('Éditable')
    await expect(recap).toContainText('Demandes de subvention')
    // The option the person ticked two steps ago, which they can no longer see.
    await expect(recap).toContainText('Historique des révisions')
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
