import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import type { AxiosInstance } from 'axios'

test.describe('permissions editor', () => {
  let datasetId: string
  let ax: AxiosInstance
  let defaultPermissions: any

  test.beforeAll(async () => {
    await clean()
    ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
    // Snapshot the default permissions assigned at creation so we can restore
    // them between tests instead of re-uploading the dataset.
    defaultPermissions = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
  })

  test.beforeEach(async () => {
    await ax.put(`/api/v1/datasets/${datasetId}/permissions`, defaultPermissions)
  })

  /**
   * Helper: login (in test_org1 context), navigate to dataset, open Permissions tab.
   */
  async function goToPermissions (page: any, goToWithAuth: any, user = 'test_user1', org = 'test_org1') {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, user, { org })
    await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
    await page.locator('#share').scrollIntoViewIfNeeded()
    await page.getByRole('tab', { name: /Permissions/i }).click()
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
      await page.getByRole('option', { name: /tous les utilisateurs/i }).click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) => p.type === 'organization' && !p.roles && p.classes?.includes('read') && p.classes?.includes('list'))
      }, { timeout: 5000 }).toBeTruthy()
    })

    test('change to public', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /tout le monde/i }).click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) => !p.type && p.classes?.includes('read') && p.classes?.includes('list'))
      }, { timeout: 5000 }).toBeTruthy()
    })

    test('change to privateOrg', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /uniquement les administrateurs/i }).click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) =>
          p.type === 'organization' && p.roles?.includes('contrib') && p.classes?.includes('read')
        )
      }, { timeout: 5000 }).toBeFalsy()
    })

    test('change from public back to privateOrg removes public permission', async ({ page, goToWithAuth }) => {
      // First set to public via API
      await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [
        { operations: [], classes: ['list', 'read'] }
      ])

      await goToPermissions(page, goToWithAuth)
      await expect(page.locator('#share .v-select').first()).toContainText(/tout le monde/i)

      // Change back to privateOrg
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /uniquement les administrateurs/i }).click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) => !p.type && p.classes?.includes('read'))
      }, { timeout: 5000 }).toBeFalsy()
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
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) =>
          p.type === 'organization' && p.roles?.includes('contrib') &&
          p.operations?.includes('writeData') && !p.operations?.includes('writeDescription')
        )
      }, { timeout: 5000 }).toBeTruthy()
    })

    test('set contribWriteNoBreaking', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      const contribSelect = page.locator('#share .v-select').nth(1)
      await contribSelect.click()
      await page.getByRole('option', { name: /tout modifier.*exception/ }).click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) =>
          p.type === 'organization' && p.roles?.includes('contrib') &&
          p.operations?.includes('writeDescription') && !p.operations?.includes('writeDescriptionBreaking')
        )
      }, { timeout: 5000 }).toBeTruthy()
    })

    test('set contribWriteAll', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      const contribSelect = page.locator('#share .v-select').nth(1)
      await contribSelect.click()
      await page.getByRole('option', { name: /tout modifier et supprimer/ }).click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) =>
          p.type === 'organization' && p.roles?.includes('contrib') &&
          p.classes?.includes('write') && p.operations?.includes('delete')
        )
      }, { timeout: 5000 }).toBeTruthy()
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
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        const userPerm = perms.find((p: any) => p.type === 'user' && p.email === 'external@test.com')
        return userPerm?.classes?.includes('read') ? userPerm : undefined
      }, { timeout: 5000 }).toBeTruthy()
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
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        const orgPerm = perms.find((p: any) => p.type === 'organization' && p.id === 'test_org2')
        return orgPerm?.name === 'Test Org 2' ? orgPerm : undefined
      }, { timeout: 5000 }).toBeTruthy()
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
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) => p.type === 'organization' && p.id === 'test_org2')
      }, { timeout: 5000 }).toBeFalsy()
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
    // Uses the UI org-switch (personal-menu click) rather than the cookie shortcut
    // in goToWithAuth: contributor-role tests have shown intermittent failures in
    // the full e2e suite when relying on the cookie alone for first-time login.
    test('non-admin cannot see permissions tab', async ({ page, goToWithAuth }) => {
      const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
      await goToWithAuth('/data-fair/', 'test_user5')
      await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
      await page.getByRole('listitem').filter({ hasText: 'Test Org 1' }).click()
      await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
      await page.goto(`${baseUrl}/data-fair/dataset/${datasetId}`)
      await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
      await expect(page.getByRole('tab', { name: /Permissions/i })).not.toBeVisible()
    })
  })
})
