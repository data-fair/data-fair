import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('dataset detail pages', () => {
  let datasetId: string

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('dataset home page loads with title', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-headline-large').first()).toBeVisible({ timeout: 10000 })
  })

  test('dataset /data redirects to /table', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/data`, 'test_user1')
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/table`), { timeout: 10000 })
  })

  test('dataset api-doc page loads', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/api-doc`, 'test_user1')
    // d-frame is a custom element that renders hidden until loaded; check it's in the DOM
    await expect(page.locator('d-frame')).toBeAttached({ timeout: 10000 })
  })

  test('dataset edit-metadata page loads with sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
  })

  test('edit-metadata page shows info and structure sections with their tabs', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#structure')).toBeVisible()
    // Info section has info, metadata and attachments tabs
    await expect(page.locator('#info').getByRole('tab', { name: /Informations|Information/ })).toBeVisible()
    await expect(page.locator('#info').getByRole('tab', { name: /Métadonnées|Metadata/ })).toBeVisible()
    await expect(page.locator('#info').getByRole('tab', { name: /Pièces jointes|Attachments/ })).toBeVisible()
    // Structure section has schema and extensions tabs
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
    await expect(page.locator('#structure').getByRole('tab', { name: /Enrichissements|Extensions/ })).toBeVisible()
  })

  test('edit-metadata: schema section shows dataset properties', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    const structureSection = page.locator('#structure')
    await expect(structureSection.getByRole('heading', { name: /colonne|column/i })).toBeVisible()
    // Click on one of the property buttons (use key name which is stable)
    const adrButton = structureSection.getByRole('button').filter({ hasText: /adr/ })
    await adrButton.click()
    await expect(structureSection.getByText(/Cl[eé] dans la source|Key in the source/i)).toBeVisible({ timeout: 5000 })
  })

  test('dataset home page shows metadata-view, schema, data, share and activity sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-headline-large').first()).toBeVisible({ timeout: 10000 })
    // Schema is a tab within #data, not a separate section
    await expect(page.locator('#data')).toBeVisible()
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()
  })

  test('dataset home page displays record count', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-headline-large').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/enregistrements|records/)).toBeVisible()
  })

  test('dataset home page action links navigate to edit-metadata', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-headline-large').first()).toBeVisible({ timeout: 10000 })
    await page.getByText(/Éditer les métadonnées|Edit metadata/).click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/edit-metadata`), { timeout: 10000 })
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
  })

  test('edit-metadata: leave guard warns when navigating away with unsaved changes', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
    const titleInput = page.locator('#info').getByRole('textbox', { name: /Titre|Title/ })
    await titleInput.click()
    await titleInput.fill('Unsaved Change E2E')
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })
    page.on('dialog', async dialog => {
      await dialog.dismiss()
    })
    // Try navigating away using browser back - goBack will trigger beforeunload dialog
    // which we dismiss, so navigation doesn't complete. Use a short timeout to avoid hanging.
    await page.goBack({ timeout: 3000 }).catch(() => {})
    // Should still be on the same page after dismissing the dialog
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/edit-metadata`), { timeout: 5000 })
    await expect(page.locator('#info')).toBeVisible()
  })

  // Mutating tests last — these modify the dataset
  test('edit-metadata: editing title shows save button and persists changes', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })

    // Find and edit the title field (use textbox role to avoid matching markdown editor buttons)
    const titleInput = page.locator('#info').getByRole('textbox', { name: /Titre|Title/ })
    const originalTitle = await titleInput.inputValue()
    await titleInput.click()
    await titleInput.fill('Modified Title E2E')

    // Save button should now be visible (diff detected)
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

    // Click save — opens confirmation dialog
    await page.getByRole('button', { name: /Enregistrer|Save/ }).click()

    // Confirm in the dialog
    await expect(page.locator('.v-dialog').getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })
    await page.locator('.v-dialog').getByRole('button', { name: /Enregistrer|Save/ }).click()

    // Save button should disappear after successful save (no more diff)
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })

    // Verify via API that the title was actually persisted
    const ax = await axiosAuth('test_user1@test.com')
    const res = await ax.get(`/api/v1/datasets/${datasetId}`)
    expect(res.data.title).toBe('Modified Title E2E')

    // Restore original title to avoid affecting other tests
    await ax.patch(`/api/v1/datasets/${datasetId}`, { title: originalTitle })
  })

  test('edit-metadata: editing a schema property label triggers diff and saves', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    const structureSection = page.locator('#structure')
    // Click on the "adr" property button
    const adrButton = structureSection.getByRole('button').filter({ hasText: /adr/ })
    await adrButton.click()

    // Vuetify text fields don't use standard label association; use placeholder to find the input
    // The title field shows the x-originalName or key as placeholder
    const labelField = structureSection.getByPlaceholder(/adr/i)
    await expect(labelField).toBeVisible({ timeout: 5000 })
    await labelField.click()
    await labelField.fill('Adresse complète')

    // Save button should appear
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

    // Save — opens confirmation dialog
    await page.getByRole('button', { name: /Enregistrer|Save/ }).click()
    await page.locator('.v-dialog').getByRole('button', { name: /Enregistrer|Save/ }).click()
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })

    // Verify via API
    const ax = await axiosAuth('test_user1@test.com')
    const res = await ax.get(`/api/v1/datasets/${datasetId}`)
    const adrProp = res.data.schema.find((p: any) => p.key === 'adr')
    expect(adrProp.title).toBe('Adresse complète')
  })
})
