import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('dataset page restructuring', () => {
  let datasetId: string

  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('main page shows metadata-view, schema, data, share and activity sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    // Metadata view shows title in text-h4
    await expect(page.locator('.text-h4').first()).toBeVisible({ timeout: 10000 })
    // Sections are visible
    await expect(page.locator('#schema')).toBeVisible()
    await expect(page.locator('#data')).toBeVisible()
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()
  })

  test('data section has data and applications tabs', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#data')).toBeVisible({ timeout: 10000 })
    // Data tab should show table card link
    await expect(page.locator('#data').getByText(/Tableau|Table/)).toBeVisible()
    // Applications tab should be visible
    await expect(page.locator('#data').getByRole('tab', { name: /Applications/ })).toBeVisible()
  })

  test('table visualization route loads', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/table`, 'test_user1')
    // Page should load (dataset-table component renders)
    await expect(page.locator('table, .v-data-table, [class*="dataset-table"]')).toBeAttached({ timeout: 15000 })
  })

  test('schema section has extensions tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#schema')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#schema').getByRole('tab', { name: /Enrichissements|Extensions/ })).toBeVisible()
  })

  test('share section has integration and API key tabs', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#share')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#share').getByRole('tab', { name: /Intégrer|Embed/ })).toBeVisible()
    await expect(page.locator('#share').getByRole('tab', { name: /Clé d'API|Read API key/ })).toBeVisible()
  })

  test('activity section has journal tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#activity')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#activity').getByRole('tab', { name: /Journal/ })).toBeVisible()
  })

  test('actions menu does not contain moved items', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-h4').first()).toBeVisible({ timeout: 10000 })
    // Edit metadata should be visible (when not in draft)
    await expect(page.getByText(/Éditer les métadonnées|Edit metadata/)).toBeVisible()
    // These should NOT be visible (moved to inline tabs)
    await expect(page.getByText(/Intégrer dans un site|Embed in a website/).first()).not.toBeVisible()
    // Notifications and webhooks should not be in the action list
    const actionsList = page.locator('.df-navigation-right')
    await expect(actionsList.getByText('Notifications')).not.toBeVisible()
    await expect(actionsList.getByText('Webhooks')).not.toBeVisible()
  })

  test('edit-metadata has metadata tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#metadata')).toBeVisible()
  })

  test('edit-metadata save shows confirmation dialog', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
    // Edit the title
    const titleInput = page.locator('#info').getByRole('textbox', { name: /Titre|Title/ })
    await titleInput.click()
    await titleInput.fill('Modified For Dialog Test')
    // Save button should appear
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })
    // Click save
    await page.getByRole('button', { name: /Enregistrer|Save/ }).click()
    // Confirmation dialog should appear
    await expect(page.getByText(/Confirmer|Confirm/)).toBeVisible({ timeout: 5000 })
    // Confirm save
    await page.locator('.v-dialog').getByRole('button', { name: /Enregistrer|Save/ }).click()
    // Dialog should close and save should succeed
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })
  })

  test('/data route redirects to /table', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/data`, 'test_user1')
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/table`), { timeout: 10000 })
  })
})
