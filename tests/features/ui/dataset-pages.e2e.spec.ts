import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('dataset detail pages', () => {
  let datasetId: string

  test.beforeAll(async () => {
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
    await expect(page.locator('d-frame, iframe')).toBeVisible({ timeout: 10000 })
  })

  test('dataset edit-metadata page loads with sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })
  })

  test('edit-metadata page shows info, schema, extensions and attachments sections', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#info')).toBeVisible()
    await expect(page.locator('#schema')).toBeVisible()
    await expect(page.locator('#extensions')).toBeVisible()
    await expect(page.locator('#attachments')).toBeVisible()
    await expect(page.getByText(/Retour à la fiche|Back to home/)).toBeVisible()
    await expect(page.getByText(/Voir les données|View data/)).toBeVisible()
  })

  test('edit-metadata: editing title shows save button and persists changes', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible()
    const titleInput = page.locator('#info').getByLabel(/Titre|Title/)
    await titleInput.click()
    await titleInput.fill('Modified Title E2E')
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Enregistrer|Save/ }).click()
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })
    const ax = await axiosAuth('test_user1@test.com')
    const res = await ax.get(`api/v1/datasets/${datasetId}`)
    expect(res.data.title).toBe('Modified Title E2E')
  })

  test('edit-metadata: schema section shows dataset properties', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#schema')).toBeVisible({ timeout: 10000 })
    const schemaSection = page.locator('#schema')
    await expect(schemaSection.getByText(/colonne|column/i)).toBeVisible()
    await schemaSection.getByRole('button', { name: /adr/i }).click()
    await expect(schemaSection.getByText(/Clé dans la source|Key in the source/i)).toBeVisible({ timeout: 5000 })
  })

  test('edit-metadata: editing a schema property label triggers diff and saves', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.locator('#schema')).toBeVisible({ timeout: 10000 })
    const schemaSection = page.locator('#schema')
    await schemaSection.getByRole('button', { name: /adr/i }).click()
    const labelField = schemaSection.getByLabel(/Libellé|Label/)
    await expect(labelField).toBeVisible({ timeout: 5000 })
    await labelField.click()
    await labelField.fill('Adresse complète')
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Enregistrer|Save/ }).click()
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })
    const ax = await axiosAuth('test_user1@test.com')
    const res = await ax.get(`api/v1/datasets/${datasetId}`)
    const adrProp = res.data.schema.find((p: any) => p.key === 'adr')
    expect(adrProp.title).toBe('Adresse complète')
  })

  test('edit-metadata: leave guard warns when navigating away with unsaved changes', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
    await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })
    const titleInput = page.locator('#info').getByLabel(/Titre|Title/)
    await titleInput.click()
    await titleInput.fill('Unsaved Change E2E')
    await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })
    page.on('dialog', async dialog => {
      await dialog.dismiss()
    })
    await page.getByText(/Retour à la fiche|Back to home/).click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/edit-metadata`), { timeout: 5000 })
    await expect(page.getByText(/Informations|Information/)).toBeVisible()
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

  test('dataset home page action links navigate to edit-metadata and data pages', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-h6').first()).toBeVisible({ timeout: 10000 })
    await page.getByText(/Éditer les métadonnées|Edit metadata/).click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/edit-metadata`), { timeout: 10000 })
    await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })
    await page.getByText(/Retour à la fiche|Back to home/).click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}$`), { timeout: 10000 })
  })
})
