import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import path from 'path'

const testFile = path.resolve('tests/resources/datasets/dataset2.csv')

test.describe('dataset upload dialog', () => {
  let datasetId: string

  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('update file flow: open dialog, select file, upload', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })

    // Open upload dialog via the actions nav
    await page.getByText('Mettre à jour les données').click()
    const dialogTitle = page.getByText(/Mettre à jour le fichier de données|Update data file/)
    await expect(dialogTitle).toBeVisible({ timeout: 5000 })

    // Select file
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(testFile)

    // Click the upload button
    await page.getByRole('button', { name: /^Charger$|^Upload$/ }).click()

    // On success the dialog closes
    await expect(dialogTitle).not.toBeVisible({ timeout: 30000 })
  })

  test('dialog can be closed without uploading', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })

    // Open upload dialog
    await page.getByText('Mettre à jour les données').click()
    const dialogTitle = page.getByText(/Mettre à jour le fichier de données|Update data file/)
    await expect(dialogTitle).toBeVisible({ timeout: 5000 })

    // Close via the cancel button
    await page.getByRole('button', { name: /^Annuler$|^Cancel$/ }).click()

    // Dialog is gone and we stay on the dataset page
    await expect(dialogTitle).not.toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}(?!/)`), { timeout: 5000 })
    await expect(page.locator('#metadata')).toBeVisible()
  })
})
