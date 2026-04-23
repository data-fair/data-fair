import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

test.describe('embed settings pages', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays api-keys settings page', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/embed/settings/user/test_user1/api-keys', 'test_user1')
    await expect(page.locator('.bg-surface')).toBeVisible({ timeout: 10000 })
  })

  test('displays settings with pre-seeded topics', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await ax.put('/api/v1/settings/user/test_user1', {
      topics: [{ id: 'topic1', title: 'Mon thème test' }]
    })

    await goToWithAuth('/data-fair/embed/settings/user/test_user1/topics', 'test_user1')
    await expect(page.getByLabel('Titre').first()).toHaveValue('Mon thème test', { timeout: 10000 })
  })

  test('displays licenses settings page', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await ax.put('/api/v1/settings/user/test_user1', {
      licenses: [{ title: 'Licence Ouverte', href: 'https://example.com' }]
    })

    await goToWithAuth('/data-fair/embed/settings/user/test_user1/licenses', 'test_user1')
    await expect(page.getByText('Licence Ouverte')).toBeVisible({ timeout: 10000 })
  })
})
