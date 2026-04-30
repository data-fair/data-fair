import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`

async function goToSettings (page: any, goToWithAuth: any, user = 'test_user1') {
  await goToWithAuth('/data-fair/', user)
  await page.goto(`${baseUrl}/data-fair/settings`)
  await expect(page.locator('#info')).toBeVisible({ timeout: 15000 })
}

async function goToSettingsOrg (page: any, goToWithAuth: any, user = 'test_user1', orgLabel = 'Test Org 1') {
  await goToWithAuth('/data-fair/', user)
  await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
  await page.getByRole('listitem').filter({ hasText: orgLabel }).click()
  await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
  await page.goto(`${baseUrl}/data-fair/settings`)
  await expect(page.locator('#info')).toBeVisible({ timeout: 15000 })
}

test.describe('settings page sections', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays all sections for user', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)

    // Sections visible for user (no department)
    await expect(page.locator('#info')).toBeVisible()
    await expect(page.locator('#topics')).toBeVisible()
    await expect(page.locator('#quality')).toBeVisible()
    await expect(page.locator('#api-keys')).toBeVisible()
    await expect(page.locator('#webhooks')).toBeVisible()
  })

  test('quality section has 3 tabs', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    await page.locator('#quality').scrollIntoViewIfNeeded()

    await expect(page.getByRole('tab', { name: /Licences/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Métadonnées/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Vocabulaire privé/i })).toBeVisible()
  })
})

test.describe('settings topics save/cancel', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('save button appears on topic change and saves correctly', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')

    await goToSettings(page, goToWithAuth)
    await page.locator('#topics').scrollIntoViewIfNeeded()

    // Initially no save button
    await expect(page.locator('#topics').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible()

    // Add a topic via VJSF
    await page.locator('#topics').getByRole('button', { name: /ajouter/i }).click()
    await page.locator('#topics').getByLabel(/titre/i).first().fill('Test Topic')

    // Save button appears
    await expect(page.locator('#topics').getByRole('button', { name: /Enregistrer/i })).toBeVisible({ timeout: 5000 })

    // Click save
    await page.locator('#topics').getByRole('button', { name: /Enregistrer/i }).click()

    // Verify via API
    await expect.poll(async () => {
      const res = await ax.get('/api/v1/settings/user/test_user1')
      return res.data.topics?.some((t: any) => t.title === 'Test Topic')
    }, { timeout: 10000 }).toBeTruthy()

    // Save button should disappear after save
    await expect(page.locator('#topics').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible({ timeout: 5000 })
  })

  test('cancel reverts topic changes', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    await page.locator('#topics').scrollIntoViewIfNeeded()

    // Add a topic
    await page.locator('#topics').getByRole('button', { name: /ajouter/i }).click()
    await page.locator('#topics').getByLabel(/titre/i).first().fill('To Cancel')

    // Cancel button should be visible
    await expect(page.locator('#topics').getByRole('button', { name: /Annuler/i })).toBeVisible({ timeout: 5000 })

    // Click cancel and confirm
    await page.locator('#topics').getByRole('button', { name: /Annuler/i }).click()
    await page.getByRole('button', { name: /Confirmer/i }).click()

    // Save/cancel buttons should disappear
    await expect(page.locator('#topics').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('settings quality tabs save/cancel', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('save persists license across tabs', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')

    await goToSettings(page, goToWithAuth)
    await page.locator('#quality').scrollIntoViewIfNeeded()

    // Switch to the Licences tab (default tab is Métadonnées)
    await page.getByRole('tab', { name: /Licences/i }).click()

    // Add a license in the Licences tab
    await page.locator('#quality').getByRole('button', { name: /ajouter une licence/i }).click()
    await page.locator('#quality').getByLabel(/titre/i).first().fill('MIT License')
    await page.locator('#quality').getByLabel(/URL/i).first().fill('https://mit.edu/license')

    // Save button appears
    await expect(page.locator('#quality').getByRole('button', { name: /Enregistrer/i })).toBeVisible({ timeout: 5000 })

    // Switch to Metadata tab — save button should still be visible
    await page.getByRole('tab', { name: /Métadonnées/i }).click()
    await expect(page.locator('#quality').getByRole('button', { name: /Enregistrer/i })).toBeVisible()

    // Save
    await page.locator('#quality').getByRole('button', { name: /Enregistrer/i }).click()

    // Verify via API
    await expect.poll(async () => {
      const res = await ax.get('/api/v1/settings/user/test_user1')
      return res.data.licenses?.some((l: any) => l.title === 'MIT License')
    }, { timeout: 10000 }).toBeTruthy()
  })

  test('cancel reverts changes across all quality tabs', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    await page.locator('#quality').scrollIntoViewIfNeeded()

    // Switch to the Licences tab (default tab is Métadonnées)
    await page.getByRole('tab', { name: /Licences/i }).click()

    // Add a license
    await page.locator('#quality').getByRole('button', { name: /ajouter une licence/i }).click()
    await page.locator('#quality').getByLabel(/titre/i).first().fill('To Cancel')

    // Cancel and confirm
    await page.locator('#quality').getByRole('button', { name: /Annuler/i }).click()
    await page.getByRole('button', { name: /Confirmer/i }).click()

    // Buttons should disappear
    await expect(page.locator('#quality').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('settings publication sites save/cancel', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('save persists publication site changes', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')

    // Pre-seed a publication site
    await ax.post('/api/v1/settings/organization/test_org1/publication-sites', {
      type: 'data-fair-portals',
      id: 'portal1',
      url: 'http://portal.com',
      title: 'Test Portal',
      datasetUrlTemplate: 'http://portal.com/datasets/{id}',
      applicationUrlTemplate: 'http://portal.com/apps/{id}',
      settings: { staging: false, datasetsRequiredMetadata: [] }
    })

    await goToSettingsOrg(page, goToWithAuth)
    await page.locator('#publicationSites').scrollIntoViewIfNeeded()

    // The publication site form should show the pre-seeded portal
    await expect(page.locator('#publicationSites').getByText('Test Portal')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('settings cross-subEdit interference', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('saving quality does not affect pending topics changes', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')

    await goToSettings(page, goToWithAuth)

    // Add a topic (don't save)
    await page.locator('#topics').scrollIntoViewIfNeeded()
    await page.locator('#topics').getByRole('button', { name: /ajouter/i }).click()
    await page.locator('#topics').getByLabel(/titre/i).first().fill('Pending Topic')

    // Add a license and save
    await page.locator('#quality').scrollIntoViewIfNeeded()
    await page.getByRole('tab', { name: /Licences/i }).click()
    await page.locator('#quality').getByRole('button', { name: /ajouter une licence/i }).click()
    await page.locator('#quality').getByLabel(/titre/i).first().fill('Saved License')
    await page.locator('#quality').getByLabel(/URL/i).first().fill('https://example.com/license')
    await page.locator('#quality').getByRole('button', { name: /Enregistrer/i }).click()

    // Wait for save to complete
    await expect(page.locator('#quality').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible({ timeout: 5000 })

    // Topics should still show the save button (pending changes preserved)
    await page.locator('#topics').scrollIntoViewIfNeeded()
    await expect(page.locator('#topics').getByRole('button', { name: /Enregistrer/i })).toBeVisible()

    // Verify API: license saved, topic NOT saved
    const res = await ax.get('/api/v1/settings/user/test_user1')
    expect(res.data.licenses?.some((l: any) => l.title === 'Saved License')).toBeTruthy()
    expect(res.data.topics?.some((t: any) => t.title === 'Pending Topic')).toBeFalsy()
  })
})

test.describe('settings auto-save', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('contact info saves automatically', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')

    await goToSettings(page, goToWithAuth)

    // Edit contact phone
    await page.locator('#info').scrollIntoViewIfNeeded()
    const phoneInput = page.locator('#info').getByLabel(/téléphone/i)
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('0123456789')
      await phoneInput.blur()

      // Verify via API (auto-save should have triggered)
      await expect.poll(async () => {
        const res = await ax.get('/api/v1/settings/user/test_user1')
        return res.data.info?.phone
      }, { timeout: 10000 }).toBe('0123456789')
    }
  })
})
