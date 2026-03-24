import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

test.describe('application detail pages', () => {
  let applicationId: string

  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')

    // Create a base application first (use an existing one or create)
    const baseApps = await ax.get('api/v1/base-applications', { params: { size: 1 } })
    if (!baseApps.data.results.length) return
    const baseApp = baseApps.data.results[0]

    // Create an application
    const res = await ax.post('api/v1/applications', {
      title: 'Test Application E2E',
      url: baseApp.url
    })
    applicationId = res.data.id
  })

  test('application index page loads with sections', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth(`/data-fair/application/${applicationId}`, 'test_user1')
    await expect(page.getByText('Test Application E2E')).toBeVisible({ timeout: 10000 })
  })

  test('application config page loads', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth(`/data-fair/application/${applicationId}/config`, 'test_user1')
    await expect(page.locator('d-frame, iframe')).toBeVisible({ timeout: 10000 })
  })

  test('application api-doc page loads', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth(`/data-fair/application/${applicationId}/api-doc`, 'test_user1')
    await expect(page.locator('d-frame, iframe')).toBeVisible({ timeout: 10000 })
  })
})
