import { test, expect } from '../../fixtures/login.ts'

test.describe('main UI layout', () => {
  test('embed pages use minimal layout without nav drawer', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/embed/settings/user/test_user1/api-keys', 'test_user1')
    await expect(page.getByRole('button', { name: "Ajouter une clé d'API" })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('nav')).not.toBeVisible()
  })

  test('d-frame page loads and renders iframe element', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/catalogs', 'test_user1')
    const dFrame = page.locator('d-frame#catalogs')
    await expect(dFrame).toBeAttached({ timeout: 10000 })
    const src = await dFrame.getAttribute('src')
    expect(src).toContain('/catalogs/catalogs/')
  })
})
