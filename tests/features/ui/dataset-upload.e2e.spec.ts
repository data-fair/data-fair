import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import path from 'path'

const testFile = path.resolve('tests/resources/datasets/dataset1.csv')

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
    await expect(page.locator('.text-h6').first()).toBeVisible({ timeout: 10000 })

    // Open the upload dialog via the actions menu
    const actionsBtn = page.getByRole('button', { name: /Mettre à jour|Charger/ })
    await actionsBtn.click()

    // Dialog should open with stepper
    await expect(page.getByText('Mettre à jour le fichier de données')).toBeVisible({ timeout: 5000 })

    // Step 1: Select file
    const fileInput = page.locator('.v-dialog input[type="file"]').first()
    await fileInput.setInputFiles(testFile)

    // Should auto-advance to step 2 (Options)
    await expect(page.getByText('Configurez les options avancées')).toBeVisible({ timeout: 5000 })

    // Step 2: Continue to upload
    await page.getByRole('button', { name: /Continuer/ }).click()

    // Step 3: Upload
    await expect(page.getByRole('button', { name: /Lancer l'import/ })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Lancer l'import/ }).click()

    // Dialog should close on success
    await expect(page.getByText('Mettre à jour le fichier de données')).not.toBeVisible({ timeout: 30000 })
  })

  test('dialog can be closed without uploading', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('.text-h6').first()).toBeVisible({ timeout: 10000 })

    // Open the upload dialog
    const actionsBtn = page.getByRole('button', { name: /Mettre à jour|Charger/ })
    await actionsBtn.click()

    await expect(page.getByText('Mettre à jour le fichier de données')).toBeVisible({ timeout: 5000 })

    // Close it
    await page.getByRole('button', { name: /Fermer/ }).click()

    // Dialog should close
    await expect(page.getByText('Mettre à jour le fichier de données')).not.toBeVisible({ timeout: 5000 })
  })
})
