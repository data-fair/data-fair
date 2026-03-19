import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('main UI layout', () => {
  test('home page loads with navigation', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Test User1/ })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('nav').getByText('Jeux de données')).toBeVisible()
    await expect(page.locator('nav').getByText('Applications')).toBeVisible()
  })

  test('embed pages use minimal layout without nav drawer', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/embed/dev', 'test_user1')
    await expect(page.getByText('Data Fair dev')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('nav')).not.toBeVisible()
  })

  test('embed dataset table still works', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
  })
})
