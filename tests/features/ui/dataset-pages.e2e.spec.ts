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
})
