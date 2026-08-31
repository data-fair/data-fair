import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

test.describe('permissions recap page', () => {
  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    for (const [title, permissions] of [
      ['Recap Public', [{ classes: ['list', 'read'] }]],
      ['Recap Private', []],
      ['Recap Contrib', [{ type: 'organization', id: 'test_org1', roles: ['contrib'], classes: ['list', 'read'] }]]
    ] as [string, any[]][]) {
      const dataset = (await ax.post('/api/v1/datasets', { isMetaOnly: true, title })).data
      await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, permissions)
    }
  })

  test.afterAll(async () => {
    await checkPendingTasks()
  })

  test('filters the listed resources as the scope narrows', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/permissions-recap', 'test_user1', { org: 'test_org1' })

    // both tabs are present
    await expect(page.getByRole('tab', { name: 'Jeux de données' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Applications' })).toBeVisible()

    // with no scope the page lists everything the account owns
    // (scoped to .v-window-item: df-section-tabs wraps the whole section in its own v-card)
    await expect(page.locator('.v-window-item .v-card').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.v-window-item .v-card')).toHaveCount(3)

    // narrowing to the public scope keeps only the publicly listable dataset
    // (clicking the .v-select wrapper, not the label: the selection text intercepts
    // pointer events on the label — same pattern as tests/features/ui/datasets-list.e2e.spec.ts:69)
    const scopeSelect = page.locator('.v-select').filter({ hasText: 'Je veux voir les permissions pour' })
    await expect(scopeSelect).toBeVisible({ timeout: 10000 })
    await scopeSelect.click()
    await page.getByRole('option', { name: 'Un visiteur anonyme', exact: true }).click()
    await expect(page.locator('.v-window-item .v-card')).toHaveCount(1)
    await expect(page.getByText('Recap Public')).toBeVisible()

    // the scope is reflected in the url, so the view is shareable
    await expect(page).toHaveURL(/scopeType=public/)

    // switching tabs keeps the scope
    await page.getByRole('tab', { name: 'Applications' }).click()
    await expect(page).toHaveURL(/scopeType=public/)
    await expect(page).toHaveURL(/tab=applications/)
  })

  test('a member scenario shows what their group grants, and why', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/permissions-recap', 'test_user1', { org: 'test_org1' })

    const scopeSelect = page.locator('.v-select').filter({ hasText: 'Je veux voir les permissions pour' })
    await expect(scopeSelect).toBeVisible({ timeout: 10000 })
    await scopeSelect.click()
    await page.getByRole('option', { name: 'Un groupe d\'utilisateurs dans l\'organisation', exact: true }).click()

    // no role selected: the group contains the admins, so everything the org owns shows up
    // with the implicit rights spelled out
    await expect(page.locator('.v-window-item .v-card')).toHaveCount(3)
    await expect(page.getByText('Administrateur de l\'organisation propriétaire').first()).toBeVisible()

    // narrowing to the contributor role keeps only what that group is granted
    const rolesSelect = page.locator('.v-select').filter({ hasText: 'Rôles' })
    await rolesSelect.click()
    await page.getByRole('option', { name: 'contrib', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Recap Contrib')).toBeVisible()
    await expect(page.getByText('Via le groupe contrib')).toBeVisible()
    await expect(page).toHaveURL(/scopeRoles=contrib/)
  })
})
