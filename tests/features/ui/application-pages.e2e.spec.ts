import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

test.describe('application detail pages', () => {
  let applicationId: string

  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')

    // Create a base application first (use an existing one or create)
    const baseApps = await ax.get('/api/v1/base-applications', { params: { size: 1 } })
    if (!baseApps.data.results.length) return
    const baseApp = baseApps.data.results[0]

    // Create an application
    const res = await ax.post('/api/v1/applications', {
      title: 'Test Application E2E',
      url: baseApp.url
    })
    applicationId = res.data.id
  })

  test('application index page loads with sections', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth(`/data-fair/application/${applicationId}`, 'test_user1')
    // Wait for the metadata section which contains the title
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#metadata').getByRole('textbox', { name: /Titre|Title/ })).toHaveValue('Test Application E2E')
  })

  test('application config page loads', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth(`/data-fair/application/${applicationId}/config`, 'test_user1')
    await expect(page.locator('d-frame').first()).toBeAttached({ timeout: 10000 })
  })

  test('a late draft save does not undo a newer edit', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await page.route('**/config-schema.json', route => route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        type: 'object',
        allOf: [{
          title: 'Options',
          properties: {
            first: { type: 'boolean', title: 'First option' },
            second: { type: 'boolean', title: 'Second option' }
          }
        }]
      }
    }))
    let saves = 0
    let firstAnswered = false
    await page.route('**/configuration-draft', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      saves++
      if (saves > 1) return route.continue()
      const response = await route.fetch()
      await new Promise(resolve => setTimeout(resolve, 1500))
      await route.fulfill({ response })
      firstAnswered = true
    })

    await goToWithAuth(`/data-fair/application/${applicationId}/config`, 'test_user1')
    await page.getByRole('button', { name: 'Options' }).click()
    const first = page.getByRole('checkbox', { name: 'First option' })
    const second = page.getByRole('checkbox', { name: 'Second option' })
    await first.check()
    await expect.poll(() => saves).toBe(1)
    await second.check()
    await expect.poll(() => firstAnswered, { timeout: 5000 }).toBe(true)
    await expect.poll(() => saves, { timeout: 5000 }).toBe(2)

    const validate = page.getByRole('button', { name: 'Valider' })
    await expect(validate).toBeEnabled({ timeout: 5000 })
    await expect(first).toBeChecked()
    await expect(second).toBeChecked()
    await validate.click()
    await expect(validate).toBeDisabled()

    const ax = await axiosAuth('test_user1@test.com')
    const config = (await ax.get(`/api/v1/applications/${applicationId}/configuration`)).data
    expect(config).toMatchObject({ first: true, second: true })
  })

  test('application api-doc page loads', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    await goToWithAuth(`/data-fair/application/${applicationId}/api-doc`, 'test_user1')
    await expect(page.locator('d-frame').first()).toBeAttached({ timeout: 10000 })
  })

  test('config page loads when returning without refresh', async ({ page, goToWithAuth }) => {
    test.skip(!applicationId, 'No base application available')
    // Navigate to config page
    await goToWithAuth(`/data-fair/application/${applicationId}/config`, 'test_user1')
    // Wait for d-frame to load
    await expect(page.locator('d-frame').first()).toBeAttached({ timeout: 10000 })

    // Navigate back to the main application page
    await page.goto(`${page.url().split('/config')[0]}`)
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })

    // Navigate back to config WITHOUT refresh - this is the key test
    // The d-frame should still load properly (bug would cause form to disappear)
    await page.goto(`/data-fair/application/${applicationId}/config`)
    await expect(page.locator('d-frame').first()).toBeAttached({ timeout: 10000 })
  })
})
