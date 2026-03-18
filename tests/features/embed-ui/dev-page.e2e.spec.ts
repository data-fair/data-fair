import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('embed-ui dev page', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays dev page with datasets and settings links', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/embed/dev', 'test_user1')
    await expect(page.getByText('Data Fair dev')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Datasets')).toBeVisible()
    await expect(page.getByText('Settings')).toBeVisible()
    await expect(page.getByText('API Keys')).toBeVisible()
  })

  test('lists uploaded datasets on dev page', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth('/data-fair/embed/dev', 'test_user1')
    await expect(page.getByText('Datasets')).toBeVisible({ timeout: 10000 })
    // The dataset should appear in the list
    await expect(page.locator('.v-list-item').first()).toBeVisible({ timeout: 10000 })
  })
})
