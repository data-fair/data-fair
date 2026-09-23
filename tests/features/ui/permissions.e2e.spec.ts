import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, mockAppUrl } from '../../support/axios.ts'
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

    // Regression guard: the contrib read permission is created with
    // department '-' ("no department"); a round-trip through the select used to write it back without
    // any department, silently granting read to the contributors of every department.
    test('a round-trip through the select keeps the "no department" scope', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /tout le monde/i }).click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) => !p.type && p.classes?.includes('read'))
      }, { timeout: 5000 }).toBeTruthy()

      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /administrateurs et contributeurs/i }).click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) => p.type === 'organization' && p.roles?.includes('contrib') && p.classes?.includes('read'))?.department
      }, { timeout: 5000 }).toBe('-')
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
      await expect(page.getByRole('button', { name: /Ajouter une permission/ })).toBeVisible({ timeout: 10000 })
    })

    // The owner's admins hold every operation implicitly, without any stored permission. The table
    // states it as a first, immutable row so the list is not read as the exhaustive set of holders.
    test('the implicit owner row is always listed and cannot be edited', async ({ page, goToWithAuth }) => {
      await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [])

      await goToPermissions(page, goToWithAuth)
      await page.getByLabel(/Édition détaillée/i).click()
      const implicitRow = page.locator('#share table tr').filter({ hasText: /Permission implicite/ })
      await expect(implicitRow).toBeVisible({ timeout: 10000 })
      await expect(implicitRow).toContainText('Administrateurs de l\'organisation Test Org 1')
      await expect(implicitRow).toContainText('Toutes les actions')
      await expect(implicitRow.locator('button')).toHaveCount(0)
    })

    test('add user permission by email', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.getByLabel(/Édition détaillée/i).click()
      await expect(page.getByRole('button', { name: /Ajouter une permission/ })).toBeVisible({ timeout: 10000 })

      // Open dialog
      await page.getByRole('button', { name: /Ajouter une permission/ }).click()
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

      // When Lister is checked, Lecture is checked and disabled with its explanatory subtitle.
      // Match on the title element rather than the option's accessible name: "Lecture" and
      // "Lecture informations avancées" are both options, and the name of the former also
      // absorbs the subtitle when it is shown, so no name pattern picks it out on its own.
      const actionsSelect = page.locator('.v-dialog .v-select').filter({ hasText: /Classes d'actions/ })
      await actionsSelect.click()
      const lectureOption = page.getByRole('option')
        .filter({ has: page.locator('.v-list-item-title', { hasText: /^Lecture$/ }) })
      // Vuetify greys the option out with a class and no aria-disabled, so toBeDisabled() —
      // which needs the disabled attribute or aria-disabled — would read it as enabled and
      // its negation would pass vacuously. Assert on the class that actually carries the state.
      await expect(lectureOption).toHaveClass(/v-list-item--disabled/)
      await expect(lectureOption).toContainText(/Toujours autorisé si la permission de lister est activée/)
      // Uncheck Lister so Lecture becomes enabled and remains the sole selected class
      await page.getByRole('option', { name: /^Lister$/ }).click()
      await expect(lectureOption).not.toHaveClass(/v-list-item--disabled/)
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
      await expect(page.getByRole('button', { name: /Ajouter une permission/ })).toBeVisible({ timeout: 10000 })

      // Open dialog — default scope should be Organization
      await page.getByRole('button', { name: /Ajouter une permission/ }).click()
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

    // Regression guard: simple-directory only fills a partner's `id` once the
    // partnership is accepted. A pending invitation used to be offered in the
    // partner select and produced a permission with no id, which the API rejects
    // with "Error in permissions format" (400). It must not be listed at all.
    test('a pending partner is not offered in the partner select', async ({ page, goToWithAuth }) => {
      await page.route('**/simple-directory/api/organizations/test_org1', async (route) => {
        const response = await route.fetch()
        const org = await response.json()
        org.partners = [
          { name: 'Partenaire En Attente', contactEmail: 'pending@test.com', partnerId: 'pending-partner', createdAt: '2026-01-01T00:00:00.000Z' },
          ...(org.partners ?? [])
        ]
        await route.fulfill({ json: org })
      })

      await goToPermissions(page, goToWithAuth)
      await page.getByLabel(/Édition détaillée/i).click()
      await expect(page.getByRole('button', { name: /Ajouter une permission/ })).toBeVisible({ timeout: 10000 })

      await page.getByRole('button', { name: /Ajouter une permission/ }).click()
      await expect(page.locator('.v-dialog')).toBeVisible({ timeout: 5000 })

      const orgTypeSelect = page.locator('.v-dialog .v-select').nth(1)
      await orgTypeSelect.click()
      await page.getByRole('option', { name: /partenaires/ }).click()

      const partnerSelect = page.locator('.v-dialog .v-select').filter({ hasText: /Partenaire/ })
      await partnerSelect.click()
      // the accepted partners are listed, the pending one is not
      await expect(page.getByRole('option', { name: /Test Org 2/ })).toBeVisible({ timeout: 5000 })
      await expect(page.getByRole('option', { name: /Partenaire En Attente/ })).toHaveCount(0)
    })

    // Regression guard for two bugs in the edit-permission dialog:
    // 1. The detailed-actions select grouped its entries with `{ header }`
    //    (Vuetify 2 syntax); on Vuetify 4 these rendered as "[object Object]".
    // 2. Validation wrongly required a role/department for a permission on the
    //    owner org, contradicting the "all if none selected" roles label.
    test('owner-org permission validates with no role; detailed actions show labels', async ({ page, goToWithAuth }) => {
      await goToPermissions(page, goToWithAuth)
      await page.getByLabel(/Édition détaillée/i).click()
      await expect(page.getByRole('button', { name: /Ajouter une permission/ })).toBeVisible({ timeout: 10000 })

      await page.getByRole('button', { name: /Ajouter une permission/ }).click()
      await expect(page.locator('.v-dialog')).toBeVisible({ timeout: 5000 })

      // Default scope is the owner organization with no role checked.
      // The detailed-actions select is always visible (no expert switch);
      // its group subheaders must render their label, never "[object Object]".
      const detailedSelect = page.locator('.v-dialog .v-select').filter({ hasText: /Actions détaillées/ })
      await detailedSelect.click()
      const listbox = page.getByRole('listbox')
      await expect(listbox).toContainText(/Lecture/)
      await expect(listbox).not.toContainText('[object Object]')
      await page.keyboard.press('Escape')

      // "Rôles (tous si aucun coché)": with no role checked, Validate must be enabled.
      const validateBtn = page.locator('.v-dialog').getByRole('button', { name: /Valider/ })
      await expect(validateBtn).toBeEnabled()
      await validateBtn.click()
      await expect.poll(async () => {
        const perms = (await ax.get(`/api/v1/datasets/${datasetId}/permissions`)).data
        return perms.find((p: any) => p.type === 'organization' && p.id === 'test_org1' && (!p.roles || !p.roles.length))
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

      // Click the delete button (warning color), then confirm in the popup
      const deleteBtn = page.locator('#share table tr').filter({ hasText: /Test Org 2/ }).locator('button').last()
      await deleteBtn.click()
      // exact: the trigger button `aria-owns` the menu, so its accessible name absorbs "Confirmer"
      await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
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

  // ===== Test Group 5: Department-owned resources =====

  // Members of the organization root keep their role on a department-owned dataset, members of the
  // other departments get nothing. The selects must say so, and must keep writing department-scoped
  // permissions.
  test.describe('department scoping', () => {
    let depDatasetId: string
    let depAx: Awaited<ReturnType<typeof axiosAuth>>

    test.beforeAll(async () => {
      depAx = await axiosAuth('test_user4@test.com', 'test_org1')
      depAx.setOrg('test_org1', 'dep1')
      const dataset = await sendDataset('datasets/dataset1.csv', depAx)
      depDatasetId = dataset.id
      expect(dataset.owner.department).toBe('dep1')
    })

    // Same reason as the access-control tests below: the id_token_dep cookie shortcut in
    // goToWithAuth does not reliably switch the active account on a first login, so use the
    // personal menu — otherwise the dataset renders the "wrong active account" error page.
    async function goToDepPermissions (page: any, goToWithAuth: any) {
      const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
      await goToWithAuth('/data-fair/', 'test_user4')
      await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
      await page.getByRole('listitem').filter({ hasText: 'department 1' }).click()
      await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
      await page.goto(`${baseUrl}/data-fair/dataset/${depDatasetId}`)
      await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
      await page.locator('#share').scrollIntoViewIfNeeded()
      await page.getByRole('tab', { name: /Permissions/i }).click()
      await expect(page.locator('#share .v-select').first()).toBeVisible({ timeout: 10000 })
    }

    test('the visibility options name the department', async ({ page, goToWithAuth }) => {
      await goToDepPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      const listbox = page.getByRole('listbox')
      await expect(listbox).toContainText('Uniquement les administrateurs du département department 1 et ceux de l\'organisation Test Org 1')
      await expect(listbox).toContainText('Les administrateurs et contributeurs du département department 1 et de l\'organisation Test Org 1')
      await expect(listbox).toContainText('Tous les utilisateurs du département department 1 et de l\'organisation Test Org 1')
      await expect(listbox).toContainText('tous départements confondus')
    })

    test('the implicit owner row names the department and the organization', async ({ page, goToWithAuth }) => {
      await goToDepPermissions(page, goToWithAuth)
      await page.getByLabel(/Édition détaillée/i).click()
      const implicitRow = page.locator('#share table tr').filter({ hasText: /Permission implicite/ })
      await expect(implicitRow).toBeVisible({ timeout: 10000 })
      await expect(implicitRow).toContainText('Administrateurs du département department 1 et de l\'organisation Test Org 1')
      // the contributors' permission created with the dataset is scoped to the department, root included
      await expect(page.locator('#share table tr').filter({ hasText: /Restreint aux rôles : contrib/ }).first())
        .toContainText('Département department 1 et racine de l\'organisation')
    })

    test('the contribution options name the department', async ({ page, goToWithAuth }) => {
      await goToDepPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').nth(1).click()
      const listbox = page.getByRole('listbox')
      await expect(listbox).toContainText('Uniquement les administrateurs du département department 1 et ceux de l\'organisation Test Org 1')
      await expect(listbox).toContainText('Les contributeurs du département department 1 et de l\'organisation Test Org 1')
    })

    // Symmetric to the guard above: on a department-owned dataset the round-trip used to drop
    // the 'dep1' scope, opening the dataset to the contributors of the whole organization.
    test('a round-trip through the select keeps the department scope', async ({ page, goToWithAuth }) => {
      await goToDepPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /tout le monde/i }).click()
      await expect.poll(async () => {
        const perms = (await depAx.get(`/api/v1/datasets/${depDatasetId}/permissions`)).data
        return perms.find((p: any) => !p.type && p.classes?.includes('read'))
      }, { timeout: 5000 }).toBeTruthy()

      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /administrateurs et contributeurs/i }).click()
      await expect.poll(async () => {
        const perms = (await depAx.get(`/api/v1/datasets/${depDatasetId}/permissions`)).data
        return perms.find((p: any) => p.type === 'organization' && p.roles?.includes('contrib') && p.classes?.includes('read'))?.department
      }, { timeout: 5000 }).toBe('dep1')
    })

    // The widened read the labels promise must actually reach a contributor of another department.
    test('a contributor of another department reads the dataset only once shared org-wide', async ({ page, goToWithAuth }) => {
      const otherDepAx = await axiosAuth('test_user10@test.com', 'test_org1')
      otherDepAx.setOrg('test_org1', 'dep2')
      const readStatus = async () => {
        try {
          return (await otherDepAx.get(`/api/v1/datasets/${depDatasetId}`)).status
        } catch (err: any) {
          return err.status
        }
      }
      expect(await readStatus()).toBe(403)

      await goToDepPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /tous départements confondus/i }).click()
      await expect.poll(readStatus, { timeout: 5000 }).toBe(200)
    })

    // The department level opens the dataset to every role of dep1 and of the organization root, and
    // to nobody in the other departments.
    test('sharing with the department reaches root users but not the other departments', async ({ page, goToWithAuth }) => {
      const readStatus = (ax: Awaited<ReturnType<typeof axiosAuth>>) => async () => {
        try {
          return (await ax.get(`/api/v1/datasets/${depDatasetId}`)).status
        } catch (err: any) {
          return err.status
        }
      }
      const rootUserAx = await axiosAuth('test_user8@test.com', 'test_org1')
      const otherDepAx = await axiosAuth('test_user10@test.com', 'test_org1')
      otherDepAx.setOrg('test_org1', 'dep2')
      // the previous test shared the dataset org-wide
      await depAx.put(`/api/v1/datasets/${depDatasetId}/permissions`, [])
      expect(await readStatus(rootUserAx)()).toBe(403)

      await goToDepPermissions(page, goToWithAuth)
      await page.locator('#share .v-select').first().click()
      await page.getByRole('option', { name: /tous les utilisateurs du département/i }).click()
      await expect.poll(readStatus(rootUserAx), { timeout: 5000 }).toBe(200)
      expect(await readStatus(otherDepAx)()).toBe(403)
      const perms = (await depAx.get(`/api/v1/datasets/${depDatasetId}/permissions`)).data
      expect(perms.find((p: any) => p.type === 'organization' && !p.roles?.length)?.department).toBe('dep1')
      await expect(page.locator('#share .v-select').first()).toContainText('Tous les utilisateurs du département department 1')
    })
  })

  // ===== Test Group 6: Access Control =====

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

    // Org member with role "user": once the dataset is shared in-org they have
    // basic read but no readJournal / setReadApiKey. The page must not show the
    // read-api-key tab (managing the key needs setReadApiKey, admin-only) and
    // must not request /task-progress or /journal (readAdvanced) on load.
    test('basic-read user: no read-api-key tab, no readJournal request', async ({ page, goToWithAuth }) => {
      const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
      // Share the dataset with the whole org so test_user8 (role "user") can read it.
      await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [
        { type: 'organization', id: 'test_org1', name: 'Test Org 1', operations: [], classes: ['list', 'read'] }
      ])

      const forbiddenRequests: string[] = []
      page.on('response', (resp) => {
        const url = resp.url()
        if (/\/api\/v1\/datasets\/[^/]+\/(journal|task-progress)\b/.test(url)) {
          forbiddenRequests.push(`${resp.status()} ${url}`)
        }
      })

      await goToWithAuth('/data-fair/', 'test_user8')
      await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
      await page.getByRole('listitem').filter({ hasText: 'Test Org 1' }).click()
      await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
      await page.goto(`${baseUrl}/data-fair/dataset/${datasetId}`)

      // Share section is visible (publication-sites + integration tabs remain).
      await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
      await page.locator('#share').scrollIntoViewIfNeeded()

      // Read-api-key and Permissions tabs must NOT be present.
      await expect(page.getByRole('tab', { name: /Clé d'API en lecture/i })).not.toBeVisible()
      await expect(page.getByRole('tab', { name: /Permissions/i })).not.toBeVisible()

      // No journal/task-progress fetch should have been issued — they require
      // readJournal which a basic "user" role doesn't have.
      // Wait a short moment so any pending fetch has had a chance to fire.
      await page.waitForTimeout(500)
      expect(forbiddenRequests, `unexpected readAdvanced requests: ${forbiddenRequests.join(', ')}`).toEqual([])
    })
  })

  // The editor is shared with the application page, which had no coverage at all: everything above
  // exercises it as resourceType="datasets" only. One department-owned application is enough to
  // catch a regression in the parts that branch on the resource type.
  test.describe('applications', () => {
    let appId: string
    let depAx: Awaited<ReturnType<typeof axiosAuth>>

    test.beforeAll(async () => {
      depAx = await axiosAuth('test_user4@test.com', 'test_org1')
      depAx.setOrg('test_org1', 'dep1')
      const application = (await depAx.post('/api/v1/applications', { title: 'An application', url: mockAppUrl('monapp1') })).data
      appId = application.id
      expect(application.owner.department).toBe('dep1')
    })

    test('the department scope and labels hold on an application too', async ({ page, goToWithAuth }) => {
      const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
      await goToWithAuth('/data-fair/', 'test_user4')
      await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
      await page.getByRole('listitem').filter({ hasText: 'department 1' }).click()
      await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
      await page.goto(`${baseUrl}/data-fair/application/${appId}`)
      await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
      await page.locator('#share').scrollIntoViewIfNeeded()
      await page.getByRole('tab', { name: /Permissions/i }).click()
      const visibility = page.locator('#share .v-select').first()
      await expect(visibility).toBeVisible({ timeout: 10000 })
      await expect(visibility).toContainText('du département department 1')

      // same round-trip as on a dataset: the department scope must survive it
      await visibility.click()
      await page.getByRole('option', { name: /tout le monde/i }).click()
      await expect.poll(async () => {
        const perms = (await depAx.get(`/api/v1/applications/${appId}/permissions`)).data
        return perms.find((p: any) => !p.type && p.classes?.includes('read'))
      }, { timeout: 5000 }).toBeTruthy()

      await visibility.click()
      await page.getByRole('option', { name: /administrateurs et contributeurs/i }).click()
      await expect.poll(async () => {
        const perms = (await depAx.get(`/api/v1/applications/${appId}/permissions`)).data
        return perms.find((p: any) => p.type === 'organization' && p.roles?.includes('contrib') && p.classes?.includes('read'))?.department
      }, { timeout: 5000 }).toBe('dep1')

      // the department level, and a root user reading the application through it
      const rootUserAx = await axiosAuth('test_user8@test.com', 'test_org1')
      await visibility.click()
      await page.getByRole('option', { name: /tous les utilisateurs du département/i }).click()
      await expect.poll(async () => {
        try {
          return (await rootUserAx.get(`/api/v1/applications/${appId}`)).status
        } catch (err: any) {
          return err.status
        }
      }, { timeout: 5000 }).toBe(200)
    })
  })
})
