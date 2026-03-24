import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('dataset detail pages', () => {
  let datasetId: string

  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('dataset home page loads with title', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-h6').first()).toBeVisible({ timeout: 10000 })
  })

  test('dataset data page loads with table', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/data`, 'test_user1')
    await expect(page.getByRole('tab', { name: /Tableau/ })).toBeVisible({ timeout: 10000 })
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

  test('edit-metadata page shows info, schema, extensions and attachments sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#schema')).toBeVisible()
    await expect(page.locator('#extensions')).toBeVisible()
    await expect(page.locator('#attachments')).toBeVisible()
    await expect(page.getByText(/Retour à la fiche|Back to home/)).toBeVisible()
    await expect(page.getByText(/Voir les données|View data/)).toBeVisible()
  })

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

    // Click save
    await page.getByRole('button', { name: /Enregistrer|Save/ }).click()

    // Save button should disappear after successful save (no more diff)
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })

    // Verify via API that the title was actually persisted
    const ax = await axiosAuth('test_user1@test.com')
    const res = await ax.get(`/api/v1/datasets/${datasetId}`)
    expect(res.data.title).toBe('Modified Title E2E')

    // Restore original title to avoid affecting other tests
    await ax.patch(`/api/v1/datasets/${datasetId}`, { title: originalTitle })
  })

  test('edit-metadata: schema section shows dataset properties', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#schema')).toBeVisible({ timeout: 10000 })
    const schemaSection = page.locator('#schema')
    await expect(schemaSection.getByRole('heading', { name: /colonne|column/i })).toBeVisible()
    // Click on one of the property buttons (use key name which is stable)
    const adrButton = schemaSection.getByRole('button').filter({ hasText: /adr/ })
    await adrButton.click()
    await expect(schemaSection.getByText(/Cl[eé] dans la source|Key in the source/i)).toBeVisible({ timeout: 5000 })
  })

  test('edit-metadata: editing a schema property label triggers diff and saves', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#schema')).toBeVisible({ timeout: 10000 })
    const schemaSection = page.locator('#schema')
    // Click on the "adr" property button
    const adrButton = schemaSection.getByRole('button').filter({ hasText: /adr/ })
    await adrButton.click()

    // Vuetify text fields don't use standard label association; use placeholder to find the input
    // The title field shows the x-originalName or key as placeholder
    const labelField = schemaSection.getByPlaceholder(/adr/i)
    await expect(labelField).toBeVisible({ timeout: 5000 })
    await labelField.click()
    await labelField.fill('Adresse complète')

    // Save button should appear
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

    // Save
    await page.getByRole('button', { name: /Enregistrer|Save/ }).click()
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })

    // Verify via API
    const ax = await axiosAuth('test_user1@test.com')
    const res = await ax.get(`/api/v1/datasets/${datasetId}`)
    const adrProp = res.data.schema.find((p: any) => p.key === 'adr')
    expect(adrProp.title).toBe('Adresse complète')
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
    await page.getByText(/Retour à la fiche|Back to home/).click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/edit-metadata`), { timeout: 5000 })
    await expect(page.locator('#info')).toBeVisible()
  })

  test('dataset home page shows description, metadata, schema and activity sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-h6').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#description')).toBeVisible()
    await expect(page.locator('#metadata')).toBeVisible()
    await expect(page.locator('#schema')).toBeVisible()
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()
  })

  test('dataset home page displays record count', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/enregistrements|records/)).toBeVisible()
  })

  test('dataset home page action links navigate to edit-metadata and back', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-h6').first()).toBeVisible({ timeout: 10000 })
    await page.getByText(/Éditer les métadonnées|Edit metadata/).click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/edit-metadata`), { timeout: 10000 })
    await expect(page.locator('#info')).toBeVisible({ timeout: 10000 })
    // Navigate back using the link in the navigation panel
    await page.locator('a').filter({ hasText: /Retour à la fiche|Back to home/ }).click()
    await expect(page.locator('#description')).toBeVisible({ timeout: 10000 })
  })
})
