import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('main UI pages', () => {
  test('datasets list shows uploaded dataset', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect(page.locator('.v-card').first()).toBeVisible({ timeout: 10000 })
  })

  test('new dataset page loads with tabs', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')
    await expect(page.getByRole('tab', { name: /Fichier/ })).toBeVisible({ timeout: 10000 })
  })
})
