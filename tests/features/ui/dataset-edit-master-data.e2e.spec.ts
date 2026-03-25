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

  test('master data tab is NOT visible for non-admin', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    const masterDataTab = page.locator('#structure').getByRole('tab', { name: /Données de référence|Master data/ })
    await expect(masterDataTab).not.toBeVisible()
  })

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

    // Confirm in dialog
    await expect(page.getByText(/Confirmer|Confirm/)).toBeVisible({ timeout: 5000 })
    await page.locator('.v-dialog').getByRole('button', { name: /Enregistrer|Save/ }).click()

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

    // Click add button for singleSearchs section
    const singleSearchsSection = page.getByText(/Recherche de paires code/).locator('..')
    const addBtn = singleSearchsSection.getByRole('button', { name: /Ajouter|Add/ })
    await addBtn.click()

    // Fill title in the dialog
    const dialog = page.locator('.v-dialog')
    await dialog.getByLabel(/Titre/).fill('Recherche test produit')

    // Confirm the dialog (save the item)
    await dialog.getByRole('button', { name: /OK|Valider|Confirm/ }).click()

    // Save button should appear
    const saveBtn = page.getByRole('button', { name: /Enregistrer|Save/ })
    await expect(saveBtn).toBeVisible({ timeout: 5000 })
    await saveBtn.click()

    // Confirm save dialog
    await expect(page.getByText(/Confirmer|Confirm/)).toBeVisible({ timeout: 5000 })
    await page.locator('.v-dialog').getByRole('button', { name: /Enregistrer|Save/ }).click()

    // Save should succeed
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })
  })
})
