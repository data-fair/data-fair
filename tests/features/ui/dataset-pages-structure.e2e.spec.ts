import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('dataset page restructuring', () => {
  let datasetId: string

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('main page shows structure, exploration, share and activity sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    // Metadata section is visible when dataset data is loaded
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
    // Other sections are visible
    await expect(page.locator('#exploration')).toBeVisible()
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()
  })

  test('exploration section has table and applications tabs', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#exploration')).toBeVisible({ timeout: 10000 })
    // Table tab should be present
    await expect(page.locator('#exploration').getByRole('tab', { name: /Tableau|Table/ })).toBeVisible()
    // Applications tab should be visible
    await expect(page.locator('#exploration').getByRole('tab', { name: /Applications/ })).toBeVisible()
  })

  test('table visualization route loads', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/table`, 'test_user1')
    // Page should load (dataset-table component renders)
    await expect(page.locator('.dataset-table')).toBeAttached({ timeout: 15000 })
  })

  test('structure section has schema tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    // Schema is a tab within the structure section
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
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

  test('actions menu does not contain inline section items', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 15000 })
    // The right navigation drawer contains the actions menu
    const actionsList = page.locator('nav').filter({ hasText: 'ACTIONS' })
    await expect(actionsList).toBeVisible({ timeout: 5000 })
    // These should NOT be in the actions list (moved to inline tabs in the page)
    await expect(actionsList.getByText(/Éditer les métadonnées|Edit metadata/)).not.toBeVisible()
    await expect(actionsList.getByText(/Intégrer dans un site|Embed in a website/)).not.toBeVisible()
    await expect(actionsList.getByText('Notifications')).not.toBeVisible()
    await expect(actionsList.getByText('Webhooks')).not.toBeVisible()
  })

  test('metadata section has details tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#metadata').getByRole('tab', { name: /Détails|Details/ })).toBeVisible()
  })

  test('/table route loads table view', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/table`, 'test_user1')
    await expect(page.locator('.dataset-table')).toBeAttached({ timeout: 15000 })
  })

  // Mutating test last — modifies the dataset title
  test('inline metadata save works', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
    // Edit the title
    const titleInput = page.locator('#metadata').getByRole('textbox', { name: /Titre|Title/ })
    await titleInput.click()
    await titleInput.fill('Modified For Save Test')
    // Save button should appear
    const saveBtn = page.getByRole('button', { name: /Enregistrer|Save/ })
    await expect(saveBtn).toBeVisible({ timeout: 5000 })
    // Click save
    await saveBtn.click()
    // Save should succeed (button disappears)
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })
  })
})
