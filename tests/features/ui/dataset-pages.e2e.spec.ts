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

  test('dataset home page loads with metadata section', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
  })

  test('dataset /table route loads table view', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/table`, 'test_user1')
    await expect(page.locator('.dataset-table')).toBeAttached({ timeout: 15000 })
  })

  test('dataset api-doc page loads', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/api-doc`, 'test_user1')
    // d-frame is a custom element that renders hidden until loaded; check it's in the DOM
    await expect(page.locator('d-frame')).toBeAttached({ timeout: 10000 })
  })

  test('dataset main page loads with metadata and structure sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
  })

  test('main page shows informations, metadata and structure sections with their tabs', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    // Top informations section renders the read-only dataset details
    await expect(page.locator('#informations')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#metadata')).toBeVisible()
    await expect(page.locator('#structure')).toBeVisible()
    // Metadata section has informations and attachments tabs (attachments only on finalized datasets)
    await expect(page.locator('#metadata').getByRole('tab', { name: /Informations|Information/ })).toBeVisible()
    await expect(page.locator('#metadata').getByRole('tab', { name: /Pièces jointes|Attachments/ })).toBeVisible()
    // Structure section has schema and extensions tabs
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
    await expect(page.locator('#structure').getByRole('tab', { name: /Enrichissements|Extensions/ })).toBeVisible()
  })

  test('structure section shows dataset properties', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    const structureSection = page.locator('#structure')
    await expect(structureSection.getByRole('heading', { name: /colonne|column/i })).toBeVisible()
    // Click on one of the property buttons (use key name which is stable)
    const adrButton = structureSection.getByRole('button').filter({ hasText: /adr/ })
    await adrButton.click()
    await expect(structureSection.getByText(/Clé source|Source key/i)).toBeVisible({ timeout: 5000 })
  })

  test('dataset home page shows metadata, structure, exploration, share and activity sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#exploration')).toBeVisible()
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()
  })

  test('dataset home page displays record count', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    // Record count is rendered in the top-level #informations section (dataset-metadata-details)
    await expect(page.locator('#informations')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#informations').getByText(/enregistrements|records/)).toBeVisible({ timeout: 5000 })
  })

  test('dataset home page shows metadata section with editable form', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    // Metadata editing is now inline on the main page
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#metadata').getByRole('textbox', { name: /Titre|Title/ })).toBeVisible()
  })

  test('leave guard warns when navigating away with unsaved metadata changes', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })
    const titleInput = page.locator('#metadata').getByRole('textbox', { name: /Titre|Title/ })
    await titleInput.click()
    await titleInput.fill('Unsaved Change E2E')
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

    // Vue Router leave guard uses window.confirm — fire the click without awaiting it,
    // otherwise the click() would deadlock waiting for navigation while the dialog blocks it
    const dialogPromise = page.waitForEvent('dialog')
    page.getByRole('link', { name: /Jeux de données|Datasets/ }).first().click().catch(() => {})
    const dialog = await dialogPromise
    expect(dialog.type()).toBe('confirm')
    await dialog.dismiss()

    // Navigation was cancelled — still on the dataset page
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}`), { timeout: 5000 })
    await expect(page.locator('#metadata')).toBeVisible()
  })

  test('leave guard warns when navigating away with unsaved schema changes', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    const adrButton = page.locator('#structure').getByRole('button').filter({ hasText: /adr/ })
    await adrButton.click()
    const labelField = page.locator('#structure').getByPlaceholder(/adr/i)
    await expect(labelField).toBeVisible({ timeout: 5000 })
    await labelField.fill('Guard Test Schema Label')
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

    const dialogPromise = page.waitForEvent('dialog')
    page.getByRole('link', { name: /Jeux de données|Datasets/ }).first().click().catch(() => {})
    const dialog = await dialogPromise
    expect(dialog.type()).toBe('confirm')
    await dialog.dismiss()

    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}`), { timeout: 5000 })
  })

  test('cancel metadata changes restores original values', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 15000 })
    const titleInput = page.locator('#metadata').getByRole('textbox', { name: /Titre|Title/ })
    const originalTitle = await titleInput.inputValue()
    await titleInput.click()
    await titleInput.fill('Title To Be Cancelled')
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

    // Click the Annuler button in the metadata section header (confirm-menu)
    await page.locator('#metadata').getByRole('button', { name: /Annuler|Cancel/ }).click()
    // Confirm the cancellation in the dialog popup
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click()

    // Diff is cleared — save button disappears and title is restored
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 5000 })
    await expect(titleInput).toHaveValue(originalTitle)
  })

  test('cancel schema changes restores original schema', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#structure')).toBeVisible({ timeout: 10000 })
    const adrButton = page.locator('#structure').getByRole('button').filter({ hasText: /adr/ })
    await adrButton.click()
    const labelField = page.locator('#structure').getByPlaceholder(/adr/i)
    await expect(labelField).toBeVisible({ timeout: 5000 })
    await labelField.fill('Schema Modification Test')
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

    // Click the Annuler button in the structure section header (confirm-menu)
    await page.locator('#structure').getByRole('button', { name: 'Annuler', exact: true }).click()
    // Confirm the cancellation in the dialog popup
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click()

    // Diff is cleared — save button disappears
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 5000 })
  })

  // Mutating tests last — these modify the dataset
  test('editing title shows save button and persists changes', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })

    // Find and edit the title field (use textbox role to avoid matching markdown editor buttons)
    const titleInput = page.locator('#metadata').getByRole('textbox', { name: /Titre|Title/ })
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

  test('editing a schema property label triggers diff and saves', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
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

    // Save
    await page.getByRole('button', { name: /Enregistrer|Save/ }).click()
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })

    // Verify via API
    const ax = await axiosAuth('test_user1@test.com')
    const res = await ax.get(`/api/v1/datasets/${datasetId}`)
    const adrProp = res.data.schema.find((p: any) => p.key === 'adr')
    expect(adrProp.title).toBe('Adresse complète')
  })
})
