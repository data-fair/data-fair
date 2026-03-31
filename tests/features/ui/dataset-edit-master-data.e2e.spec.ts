import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('dataset edit-metadata master data tab', () => {
  let datasetId: string

  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('master data tab is visible in structure section for admin', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_superadmin')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    const masterDataTab = page.locator('#structure').getByRole('tab', { name: /Données de référence|Master data/ })
    await expect(masterDataTab).toBeVisible()
    await masterDataTab.click()
    await expect(page.getByText(/Transformez ce jeu de données/)).toBeVisible({ timeout: 5000 })
  })

  // Skipped: non-admin test requires org context switching which the current login fixture doesn't support.
  // Personal account users always have admin role, so the master data tab is always visible for personal datasets.
  test.skip('master data tab is NOT visible for non-admin', async () => {})

  test('enable virtualDatasets and save', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_superadmin')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })

    // Click master data tab
    await page.locator('#structure').getByRole('tab', { name: /Données de référence|Master data/ }).click()
    await expect(page.getByText(/Transformez ce jeu de données/)).toBeVisible({ timeout: 5000 })

    // Toggle "Création de jeux virtuels" checkbox
    const checkbox = page.getByLabel(/Création de jeux virtuels/)
    await checkbox.check()

    // Save button should appear
    const saveBtn = page.getByRole('button', { name: /Enregistrer|Save/ })
    await expect(saveBtn).toBeVisible({ timeout: 5000 })
    await saveBtn.click()

    // Save should succeed (button disappears)
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    await page.locator('#structure').getByRole('tab', { name: /Données de référence|Master data/ }).click()
    await expect(page.getByText(/Transformez ce jeu de données/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByLabel(/Création de jeux virtuels/)).toBeChecked()
  })

  test('add a singleSearch entry via dialog', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_superadmin')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })

    // Click master data tab
    await page.locator('#structure').getByRole('tab', { name: /Données de référence|Master data/ }).click()
    await expect(page.getByText(/Transformez ce jeu de données/)).toBeVisible({ timeout: 5000 })

    // Wait for vjsf form to render and find the singleSearchs section
    const singleSearchsLabel = page.getByText(/Recherche de paires code/)
    await expect(singleSearchsLabel).toBeVisible({ timeout: 10000 })
    // The Add button is in the same list as the label
    const singleSearchsList = page.locator('ul, [role="list"]').filter({ hasText: /Recherche de paires code/ })
    const addBtn = singleSearchsList.getByRole('button', { name: /Ajouter/ })
    await addBtn.click()

    // vjsf renders an inline form (not a modal dialog) — fill title within the structure section
    const structureSection = page.locator('#structure')
    const titleField = structureSection.getByRole('textbox', { name: /Titre/ })
    await expect(titleField).toBeVisible({ timeout: 5000 })
    await titleField.fill('Recherche test produit')

    // Close the inline form
    await structureSection.getByRole('button', { name: /Fermer/ }).click()

    // The entry should now appear and the save button should be visible (diff detected)
    const saveBtn = page.getByRole('button', { name: /Enregistrer|Save/ })
    await expect(saveBtn).toBeVisible({ timeout: 5000 })
  })
})
