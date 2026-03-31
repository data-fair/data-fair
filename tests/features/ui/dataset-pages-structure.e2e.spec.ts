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

  test('main page shows metadata-view, schema, data, share and activity sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    // Metadata view shows title in text-headline-large
    await expect(page.locator('.text-headline-large').first()).toBeVisible({ timeout: 10000 })
    // Sections are visible (schema is a tab within #data, not a separate section)
    await expect(page.locator('#data')).toBeVisible()
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()
  })

  test('data section has data and applications tabs', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#data')).toBeVisible({ timeout: 10000 })
    // Data tab (Données) should be present
    await expect(page.locator('#data').getByRole('tab', { name: /Données|Data/ })).toBeVisible()
    // Applications tab should be visible
    await expect(page.locator('#data').getByRole('tab', { name: /Applications/ })).toBeVisible()
  })

  test('table visualization route loads', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/table`, 'test_user1')
    // Page should load (dataset-table component renders)
    await expect(page.locator('.dataset-table')).toBeAttached({ timeout: 15000 })
  })

  test('data section has schema tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#data')).toBeVisible({ timeout: 10000 })
    // Schema is a tab within the data section
    await expect(page.locator('#data').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
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
    await expect(page.locator('.text-headline-large').first()).toBeVisible({ timeout: 15000 })
    // The right navigation drawer contains the actions menu (second nav on the page)
    const actionsList = page.locator('nav').filter({ hasText: 'ACTIONS' })
    await expect(actionsList).toBeVisible({ timeout: 5000 })
    // Edit metadata should be visible in the actions menu
    await expect(actionsList.getByText(/Éditer les métadonnées|Edit metadata/)).toBeVisible()
    // These should NOT be in the actions list (moved to inline tabs in the page)
    await expect(actionsList.getByText(/Intégrer dans un site|Embed in a website/)).not.toBeVisible()
    await expect(actionsList.getByText('Notifications')).not.toBeVisible()
    await expect(actionsList.getByText('Webhooks')).not.toBeVisible()
  })

  test('edit-metadata has metadata tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#info').getByRole('tab', { name: /Métadonnées|Metadata/ })).toBeVisible()
  })

  test('/data route redirects to /table', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/data`, 'test_user1')
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/table`), { timeout: 10000 })
  })

  // Mutating test last — modifies the dataset title
  test('edit-metadata save works', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
    // Edit the title
    const titleInput = page.locator('#info').getByRole('textbox', { name: /Titre|Title/ })
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
