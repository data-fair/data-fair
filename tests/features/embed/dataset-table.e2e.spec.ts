import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('embed dataset table page', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays dataset table with data', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
  })

  test('displays dataset journal', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/journal`, 'test_user1')
    await expect(page.getByText('le jeu de données a été entièrement traité')).toBeVisible({ timeout: 10000 })
  })
})
