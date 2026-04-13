import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import path from 'path'

const testFile = path.resolve('tests/resources/datasets/dataset2.csv')

test.describe('dataset upload dialog stepper', () => {
  let datasetId: string

  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('update file flow: open dialog, select file, configure options, upload', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })

    // Navigate to edit-data page via the actions nav
    await page.getByText('Mettre à jour les données').click()
    await page.waitForURL(/\/edit-data/, { timeout: 10000 })

    // Step 2 (file selection): Select file — @change auto-advances to confirmation step
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(testFile)

    // Should auto-advance to confirmation step
    await expect(page.getByText(/Après la soumission/)).toBeVisible({ timeout: 5000 })

    // Click "Mettre à jour" to upload
    await page.getByRole('button', { name: /^Mettre à jour$/ }).click()

    // After successful upload, step advances to review — confirmation text disappears
    await expect(page.getByText(/Après la soumission/)).not.toBeVisible({ timeout: 30000 })
  })

  test('dialog can be closed without uploading', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })

    // Navigate to edit-data page
    await page.getByText('Mettre à jour les données').click()
    await page.waitForURL(/\/edit-data/, { timeout: 10000 })

    // Navigate back without uploading
    await page.goBack({ timeout: 5000 })

    // Should be back on dataset page
    await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}(?!/)`), { timeout: 5000 })
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 5000 })
  })
})
