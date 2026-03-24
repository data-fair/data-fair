import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import type { AxiosInstance } from 'axios'

test.describe('permissions editor', () => {
  let datasetId: string
  let ax: AxiosInstance

  test.beforeEach(async () => {
    await clean()
    ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  /**
   * Helper: login, switch to org context via personal menu, then navigate to dataset permissions tab.
   */
  async function goToPermissions (page: any, goToWithAuth: any, user = 'test_user1', orgLabel = 'Test Org 1') {
    const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
    // Login and go to the dashboard first (personal context)
    await goToWithAuth('/data-fair/', user)
    // Switch to org context via the personal menu
    await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
    await page.getByRole('listitem').filter({ hasText: orgLabel }).click()
    // Wait for the page to reload after org switch
    await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
    // Navigate to the dataset page
    await page.goto(`${baseUrl}/data-fair/dataset/${datasetId}`)
    await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
    await page.locator('#share').scrollIntoViewIfNeeded()
    // Click the Permissions tab to ensure it is active
    await page.getByRole('tab', { name: /Permissions/i }).click()
    // Wait for the permissions component to load (visibility select appears)
    await expect(page.locator('#share .v-select').first()).toBeVisible({ timeout: 10000 })
  }

  // ===== Test Group 1: Visibility =====

  test.describe('visibility', () => {
    test('default visibility is privateOrgContrib', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      // The default for new org-owned datasets is privateOrgContrib
      await expect(page.locator('#share .v-select').first()).toContainText(/administrateurs et contributeurs/)
    })

    test('change to sharedInOrg', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /tous les utilisateurs/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const orgPerm = perms.find((p: any) => p.type === 'organization' && !p.roles && p.classes?.includes('read') && p.classes?.includes('list'))
      expect(orgPerm).toBeTruthy()
    })

    test('change to public', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /tout le monde/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const publicPerm = perms.find((p: any) => !p.type && p.classes?.includes('read') && p.classes?.includes('list'))
      expect(publicPerm).toBeTruthy()
    })

    test('change to privateOrg', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /uniquement les administrateurs/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      // No contrib read permission should remain
      const contribReadPerm = perms.find((p: any) =>
        p.type === 'organization' && p.roles?.includes('contrib') && p.classes?.includes('read')
      )
      expect(contribReadPerm).toBeFalsy()
    })

    test('change from public back to privateOrg removes public permission', async ({ page, goToWithAuth }) => {
      // First set to public via API
      await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [
        { operations: [], classes: ['list', 'read'] }
      ])

      await goToPermissions(page, goToWithAuth)
      await expect(page.locator('#share .v-select').first()).toContainText(/tout le monde/)

      // Change back to privateOrg
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /uniquement les administrateurs/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const publicPerm = perms.find((p: any) => !p.type && p.classes?.includes('read'))
      expect(publicPerm).toBeFalsy()
    })
  })

  // ===== Test Group 2: Contributor Profiles =====

  test.describe('contributor profiles', () => {
    test('default is contribWriteAll', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      const contribSelect = page.locator('#share .v-select').nth(1)
      await expect(contribSelect).toContainText(/tout modifier et supprimer/)
    })

    test('set contribWriteData', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      const contribSelect = page.locator('#share .v-select').nth(1)
      await contribSelect.click()
      await page.getByRole('option', { name: /modifier uniquement les données/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const writeDataPerm = perms.find((p: any) =>
        p.type === 'organization' && p.roles?.includes('contrib') &&
        p.operations?.includes('writeData') && !p.operations?.includes('writeDescription')
      )
      expect(writeDataPerm).toBeTruthy()
    })

    test('set contribWriteNoBreaking', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      const contribSelect = page.locator('#share .v-select').nth(1)
      await contribSelect.click()
      await page.getByRole('option', { name: /tout modifier.*exception/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const writeNoBreakingPerm = perms.find((p: any) =>
        p.type === 'organization' && p.roles?.includes('contrib') &&
        p.operations?.includes('writeDescription') && !p.operations?.includes('writeDescriptionBreaking')
      )
      expect(writeNoBreakingPerm).toBeTruthy()
    })

    test('set contribWriteAll', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      const contribSelect = page.locator('#share .v-select').nth(1)
      await contribSelect.click()
      await page.getByRole('option', { name: /tout modifier et supprimer/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const writeAllPerm = perms.find((p: any) =>
        p.type === 'organization' && p.roles?.includes('contrib') &&
        p.classes?.includes('write') && p.operations?.includes('delete')
      )
      expect(writeAllPerm).toBeTruthy()
    })
  })

  // ===== Test Group 3: Detailed Mode =====

  test.describe('detailed mode', () => {
    test('enable detailed mode shows add button', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.getByLabel(/Édition détaillée/i).click()
      await expect(page.getByRole('button', { name: /Ajouter des permissions/ })).toBeVisible({ timeout: 10000 })
    })

    test('add user permission by email', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.getByLabel(/Édition détaillée/i).click()
      await expect(page.getByRole('button', { name: /Ajouter des permissions/ })).toBeVisible({ timeout: 10000 })

      // Open dialog
      await page.getByRole('button', { name: /Ajouter des permissions/ }).click()
      await expect(page.locator('.v-dialog')).toBeVisible({ timeout: 5000 })

      // Select User scope
      const scopeSelect = page.locator('.v-dialog .v-select').first()
      await scopeSelect.click()
      await page.getByRole('option', { name: /Utilisateur/ }).click()

      // Select email mode
      const userTypeSelect = page.locator('.v-dialog .v-select').nth(1)
      await userTypeSelect.click()
      await page.getByRole('option', { name: /adresse email/ }).click()

      // Enter email
      await page.locator('.v-dialog').getByLabel(/Email/).fill('external@test.com')

      // Select read class in actions
      const actionsSelect = page.locator('.v-dialog .v-select').filter({ hasText: /Actions/ })
      await actionsSelect.click()
      await page.getByRole('option', { name: /^Lecture$/ }).click()
      await page.keyboard.press('Escape')

      // Validate
      await page.locator('.v-dialog').getByRole('button', { name: /Valider/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const userPerm = perms.find((p: any) => p.type === 'user' && p.email === 'external@test.com')
      expect(userPerm).toBeTruthy()
      expect(userPerm.classes).toContain('read')
    })

    test('add partner org permission', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.getByLabel(/Édition détaillée/i).click()
      await expect(page.getByRole('button', { name: /Ajouter des permissions/ })).toBeVisible({ timeout: 10000 })

      // Open dialog — default scope should be Organization
      await page.getByRole('button', { name: /Ajouter des permissions/ }).click()
      await expect(page.locator('.v-dialog')).toBeVisible({ timeout: 5000 })

      // Select partner mode
      const orgTypeSelect = page.locator('.v-dialog .v-select').nth(1)
      await orgTypeSelect.click()
      await page.getByRole('option', { name: /partenaires/ }).click()

      // Select Test Org 2
      const partnerSelect = page.locator('.v-dialog .v-select').filter({ hasText: /Partenaire/ })
      await partnerSelect.click()
      await page.getByRole('option', { name: /Test Org 2/ }).click()

      // Validate (default classes are read+list)
      await page.locator('.v-dialog').getByRole('button', { name: /Valider/ }).click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const orgPerm = perms.find((p: any) => p.type === 'organization' && p.id === 'test_org2')
      expect(orgPerm).toBeTruthy()
      expect(orgPerm.name).toBe('Test Org 2')
    })

    test('delete a permission', async ({ page, goToWithAuth }) => {
      // Add permission via API first
      await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [
        { type: 'organization', id: 'test_org2', name: 'Test Org 2', operations: [], classes: ['read', 'list'] }
      ])

      await goToPermissions(page, goToWithAuth)
      // Detailed mode should auto-enable since there's a non-standard permission
      await expect(page.locator('#share table')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('#share table')).toContainText(/Test Org 2/)

      // Click the delete button (warning color)
      const deleteBtn = page.locator('#share table tr').filter({ hasText: /Test Org 2/ }).locator('button').last()
      await deleteBtn.click()
      await page.waitForTimeout(1500)

      const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
      const orgPerm = perms.find((p: any) => p.type === 'organization' && p.id === 'test_org2')
      expect(orgPerm).toBeFalsy()
    })
  })

  // ===== Test Group 4: Auto-detailed-mode =====

  test.describe('auto-detailed-mode', () => {
    test('auto-enables for non-standard permissions', async ({ page, goToWithAuth }) => {
      // Add a non-standard permission via API
      await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [
        { type: 'organization', id: 'test_org3', name: 'Test Org 3', operations: [], classes: ['read', 'list'] }
      ])

      await goToPermissions(page, goToWithAuth)
      // Table should be visible without manually toggling detailed mode
      await expect(page.locator('#share table')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('#share table')).toContainText(/Test Org 3/)
    })
  })

  // ===== Test Group 5: Access Control =====

  test.describe('access control', () => {
    test('non-admin cannot see permissions tab', async ({ page, goToWithAuth }) => {
      const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
      // Login as contrib user and switch to org context
      await goToWithAuth('/data-fair/', 'test_user5')
      await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
      await page.getByRole('listitem').filter({ hasText: 'Test Org 1' }).click()
      await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
      // Navigate to the dataset page
      await page.goto(`${baseUrl}/data-fair/dataset/${datasetId}`)
      await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
      // The Permissions tab should NOT be visible for a contrib user
      await expect(page.getByRole('tab', { name: /Permissions/i })).not.toBeVisible()
    })
  })
})
