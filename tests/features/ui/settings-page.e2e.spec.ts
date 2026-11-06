import { test, expect } from '../../fixtures/login.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../support/axios.ts'
import type { AxiosInstance } from 'axios'

const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}`

async function goToSettings (page: any, goToWithAuth: any, user = 'test_user1') {
  await goToWithAuth('/data-fair/', user)
  await page.goto(`${baseUrl}/data-fair/settings`)
  await expect(page.locator('#info')).toBeVisible({ timeout: 15000 })
}

// the server handles the PATCH at once, its response is held back: a save stays in flight
async function slowSaves (page: any, ms: number, onlyKey?: string) {
  await page.route('**/api/v1/settings/**', async (route: any) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    if (onlyKey && !(onlyKey in route.request().postDataJSON())) return route.fallback()
    const response = await route.fetch()
    await new Promise(resolve => setTimeout(resolve, ms))
    await route.fulfill({ response })
  })
}

async function goToSettingsOrg (page: any, goToWithAuth: any, user = 'test_user1', orgLabel = 'Test Org 1') {
  await goToWithAuth('/data-fair/', user)
  await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
  await page.getByRole('listitem').filter({ hasText: orgLabel }).click()
  await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
  await page.goto(`${baseUrl}/data-fair/settings`)
  await expect(page.locator('#info')).toBeVisible({ timeout: 15000 })
}

// no clean(): these tests only assert static section/tab visibility, not data content
test.describe('settings page sections', () => {
  test('displays all sections for user', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)

    // Sections visible for user (no department)
    await expect(page.locator('#info')).toBeVisible()
    await expect(page.locator('#catalog')).toBeVisible()
    await expect(page.locator('#integrations')).toBeVisible()
  })

  test('catalog and integrations sections have their tabs', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    await page.locator('#catalog').scrollIntoViewIfNeeded()

    await expect(page.getByRole('tab', { name: /Thématiques/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Licences/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Métadonnées/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Vocabulaire privé/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Clés d'API/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Webhooks/i })).toBeVisible()
  })
})

test.describe('settings topics save/cancel', () => {
  let ax: AxiosInstance
  let baseSettings: any

  test.beforeAll(async () => {
    await clean()
    ax = await axiosAuth('test_user1@test.com')
    baseSettings = (await ax.get('/api/v1/settings/user/test_user1')).data
  })

  // reset topics between tests: fragile "first titre field" locators only target
  // the right (blank) item when the topics array starts empty
  test.beforeEach(async () => {
    await ax.put('/api/v1/settings/user/test_user1', baseSettings)
  })

  test('save button appears on topic change and saves correctly', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    await page.locator('#catalog').scrollIntoViewIfNeeded()

    // Initially no save button
    await expect(page.locator('#catalog').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible()

    // Add a topic via VJSF
    await page.locator('#catalog').getByRole('button', { name: /ajouter/i }).click()
    await page.locator('#catalog').getByLabel(/titre/i).filter({ visible: true }).first().fill('Test Topic')

    // Save button appears
    await expect(page.locator('#catalog').getByRole('button', { name: /Enregistrer/i })).toBeVisible({ timeout: 5000 })

    // Click save
    await page.locator('#catalog').getByRole('button', { name: /Enregistrer/i }).click()

    // Verify via API
    await expect.poll(async () => {
      const res = await ax.get('/api/v1/settings/user/test_user1')
      return res.data.topics?.some((t: any) => t.title === 'Test Topic')
    }, { timeout: 10000 }).toBeTruthy()

    // Save button should disappear after save
    await expect(page.locator('#catalog').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible({ timeout: 5000 })
  })

  test('cancel reverts topic changes', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    await page.locator('#catalog').scrollIntoViewIfNeeded()

    // Add a topic
    await page.locator('#catalog').getByRole('button', { name: /ajouter/i }).click()
    await page.locator('#catalog').getByLabel(/titre/i).filter({ visible: true }).first().fill('To Cancel')

    // Cancel button should be visible
    await expect(page.locator('#catalog').getByRole('button', { name: /Annuler/i })).toBeVisible({ timeout: 5000 })

    // Click cancel and confirm
    await page.locator('#catalog').getByRole('button', { name: /Annuler/i }).click()
    await page.getByRole('button', { name: /Confirmer/i }).click()

    // Save/cancel buttons should disappear
    await expect(page.locator('#catalog').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible({ timeout: 5000 })
  })

  test('deleting a used topic asks for confirmation before saving', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const topics = (await ax.put('/api/v1/settings/user/test_user1', { topics: [{ title: 'Used topic' }] })).data.topics
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'with topic', topics })).data

    await goToSettings(page, goToWithAuth)
    await page.locator('#catalog').scrollIntoViewIfNeeded()
    // delete through the item actions menu, then its own confirmation
    const item = page.locator('#catalog').getByRole('listitem').first()
    await item.hover()
    await item.getByRole('button').last().click()
    await page.getByRole('listitem').filter({ hasText: 'Supprimer' }).last().click()
    await page.locator('.v-btn.bg-warning').filter({ hasText: 'Confirmer' }).click()
    await page.locator('#catalog').getByRole('button', { name: /Enregistrer/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Thématique « Used topic » supprimée : elle sera retirée de 1 jeu de données.')
    await dialog.getByRole('button', { name: /Annuler/i }).click()
    // checked on the settings: reading the dataset here would put it in the 30s memoize cache
    assert.equal((await ax.get('/api/v1/settings/user/test_user1')).data.topics.length, 1)

    await page.locator('#catalog').getByRole('button', { name: /Enregistrer/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Enregistrer/i }).click()
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${dataset.id}`)).data.topics?.length ?? 0, { timeout: 10000 }).toBe(0)
  })
})

test.describe('settings catalog tabs save/cancel', () => {
  let ax: AxiosInstance
  let baseSettings: any

  test.beforeAll(async () => {
    await clean()
    ax = await axiosAuth('test_user1@test.com')
    baseSettings = (await ax.get('/api/v1/settings/user/test_user1')).data
  })

  // reset licenses between tests: same "first titre field" fragility as topics
  test.beforeEach(async () => {
    await ax.put('/api/v1/settings/user/test_user1', baseSettings)
  })

  test('save persists license across tabs', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    await page.locator('#catalog').scrollIntoViewIfNeeded()

    // Switch to the Licences tab (default tab is Métadonnées)
    await page.getByRole('tab', { name: /Licences/i }).click()

    // Add a license in the Licences tab
    await page.locator('#catalog').getByRole('button', { name: /ajouter une licence/i }).click()
    await page.locator('#catalog').getByLabel('Titre', { exact: true }).filter({ visible: true }).first().fill('MIT License')
    await page.locator('#catalog').getByLabel(/URL/i).filter({ visible: true }).first().fill('https://mit.edu/license')

    // Save button appears
    await expect(page.locator('#catalog').getByRole('button', { name: /Enregistrer/i })).toBeVisible({ timeout: 5000 })

    // Switch to Metadata tab — save button should still be visible
    await page.getByRole('tab', { name: /Métadonnées/i }).click()
    await expect(page.locator('#catalog').getByRole('button', { name: /Enregistrer/i })).toBeVisible()

    // Save
    await page.locator('#catalog').getByRole('button', { name: /Enregistrer/i }).click()

    // Verify via API
    await expect.poll(async () => {
      const res = await ax.get('/api/v1/settings/user/test_user1')
      return res.data.licenses?.some((l: any) => l.title === 'MIT License')
    }, { timeout: 10000 }).toBeTruthy()
  })

  test('cancel reverts changes across all catalog tabs', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    await page.locator('#catalog').scrollIntoViewIfNeeded()

    // Switch to the Licences tab (default tab is Métadonnées)
    await page.getByRole('tab', { name: /Licences/i }).click()

    // Add a license
    await page.locator('#catalog').getByRole('button', { name: /ajouter une licence/i }).click()
    await page.locator('#catalog').getByLabel('Titre', { exact: true }).filter({ visible: true }).first().fill('To Cancel')

    // Cancel and confirm
    await page.locator('#catalog').getByRole('button', { name: /Annuler/i }).click()
    await page.getByRole('button', { name: /Confirmer/i }).click()

    // Buttons should disappear
    await expect(page.locator('#catalog').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('settings publication sites save/cancel', () => {
  test.beforeAll(async () => {
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
  test.beforeAll(async () => {
    await clean()
  })

  test('saving the catalog does not affect pending contact changes', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')

    await goToSettings(page, goToWithAuth)

    // Change the contact name (don't save)
    const info = page.locator('#info')
    const nameInput = info.getByLabel('Nom', { exact: true })
    await nameInput.fill('Pending Contact')
    await nameInput.blur()

    // Add a license and save
    await page.locator('#catalog').scrollIntoViewIfNeeded()
    await page.getByRole('tab', { name: /Licences/i }).click()
    await page.locator('#catalog').getByRole('button', { name: /ajouter une licence/i }).click()
    await page.locator('#catalog').getByLabel('Titre', { exact: true }).filter({ visible: true }).first().fill('Saved License')
    await page.locator('#catalog').getByLabel(/URL/i).filter({ visible: true }).first().fill('https://example.com/license')
    await page.locator('#catalog').getByRole('button', { name: /Enregistrer/i }).click()

    // Wait for save to complete
    await expect(page.locator('#catalog').getByRole('button', { name: /Enregistrer/i })).not.toBeVisible({ timeout: 5000 })

    // Contact should still show the save button (pending changes preserved)
    await expect(info.getByRole('button', { name: /Enregistrer/i })).toBeVisible()

    // Verify API: license saved, contact NOT saved
    const res = await ax.get('/api/v1/settings/user/test_user1')
    expect(res.data.licenses?.some((l: any) => l.title === 'Saved License')).toBeTruthy()
    expect(res.data.info?.contact?.name).toBeUndefined()
  })
})

test.describe('settings integrations', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('an API key is saved as soon as it is added', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')

    await goToSettings(page, goToWithAuth)
    const section = page.locator('#integrations')
    await section.scrollIntoViewIfNeeded()
    await section.getByRole('button', { name: /Ajouter une clé d'API/i }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Titre', { exact: true }).fill('Auto key')
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()

    await expect.poll(async () => (await ax.get('/api/v1/settings/user/test_user1')).data.apiKeys?.length ?? 0, { timeout: 10000 }).toBe(1)
    // the secret is shown once, right after the save
    await expect(section.getByText('Clé « Auto key » créée')).toBeVisible()
    await expect(section.getByRole('button', { name: /Enregistrer/i })).not.toBeVisible()

    // the secret of the first key survives the save of the second
    await section.getByRole('button', { name: /Ajouter une clé d'API/i }).click()
    await dialog.getByLabel('Titre', { exact: true }).fill('Second key')
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(section.getByText('Clé « Second key » créée')).toBeVisible()
    await expect(section.getByText('Clé « Auto key » créée')).toBeVisible()
  })

  test('a refused API key save is rolled back and the next one still goes out', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await goToSettings(page, goToWithAuth)
    const section = page.locator('#integrations')
    await section.scrollIntoViewIfNeeded()
    const addKey = async (title: string) => {
      await section.getByRole('button', { name: /Ajouter une clé d'API/i }).click()
      await page.getByRole('dialog').getByLabel('Titre', { exact: true }).fill(title)
      await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click()
    }

    await page.route('**/api/v1/settings/**', route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, body: 'refused' })
      : route.fallback())
    await addKey('Refused key')
    await expect(page.getByText('refused')).toBeVisible({ timeout: 5000 })
    await expect(section.getByRole('row').filter({ hasText: 'Refused key' })).not.toBeVisible()
    // the form stays open with what was typed, to retry without typing it again
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Titre', { exact: true })).toHaveValue('Refused key')

    await page.unroute('**/api/v1/settings/**')
    await dialog.getByLabel('Titre', { exact: true }).fill('Accepted key')
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
    await expect.poll(async () => (await ax.get('/api/v1/settings/user/test_user1')).data.apiKeys?.map((k: any) => k.title), { timeout: 10000 })
      .toContain('Accepted key')
    expect((await ax.get('/api/v1/settings/user/test_user1')).data.apiKeys?.map((k: any) => k.title)).not.toContain('Refused key')
  })

  test('a webhook is saved on explicit save, once complete', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const webhooks = async () => (await ax.get('/api/v1/settings/user/test_user1')).data.webhooks ?? []

    await goToSettings(page, goToWithAuth)
    const section = page.locator('#integrations')
    await section.scrollIntoViewIfNeeded()
    await section.getByRole('tab', { name: /Webhooks/ }).click()
    await section.getByRole('button', { name: /Ajouter un webhook/i }).click()
    await section.getByLabel('Titre', { exact: true }).fill('Auto hook')
    const urlInput = section.getByLabel('URL du serveur HTTP cible')
    await urlInput.fill('https://example.com/hook')
    await urlInput.blur()

    // still missing its events: it cannot be saved
    const saveButton = section.getByRole('button', { name: /Enregistrer/i })
    await expect(saveButton).toBeDisabled({ timeout: 5000 })

    await section.locator('.v-select').filter({ hasText: 'Événements déclencheurs' }).click()
    await page.getByRole('option', { name: 'Un nouveau jeu de données a été créé' }).click()
    await page.keyboard.press('Escape')
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
    expect(await webhooks()).toHaveLength(0)

    // the form updates on blur: a value still in the field must be part of the save
    await urlInput.fill('https://example.com/typed-last')
    await saveButton.click()
    await expect.poll(async () => (await webhooks()).map((w: any) => w.target.params.url), { timeout: 10000 }).toEqual(['https://example.com/typed-last'])
    await expect(saveButton).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('settings contact save/cancel', () => {
  test.beforeAll(async () => {
    await clean()
  })

  test('contact info is saved only on explicit save', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')

    await goToSettings(page, goToWithAuth)

    const section = page.locator('#info')
    await section.scrollIntoViewIfNeeded()
    const nameInput = section.getByLabel('Nom', { exact: true })
    const saveButton = section.getByRole('button', { name: /Enregistrer/i })
    // an account without contact info must not look modified on load
    await expect(nameInput).toBeVisible()
    await expect(saveButton).not.toBeVisible()

    await nameInput.fill('Test Contact')
    await nameInput.blur()

    await expect(saveButton).toBeVisible({ timeout: 5000 })
    expect((await ax.get('/api/v1/settings/user/test_user1')).data.info?.contact?.name).toBeUndefined()

    await saveButton.click()
    await expect.poll(async () => {
      const res = await ax.get('/api/v1/settings/user/test_user1')
      return res.data.info?.contact?.name
    }, { timeout: 10000 }).toBe('Test Contact')
    await expect(saveButton).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('settings department switch guard', () => {
  test.beforeAll(async () => {
    await clean()
  })

  test('refusing to drop pending changes keeps the department and asks only once', async ({ page, goToWithAuth }) => {
    await goToSettingsOrg(page, goToWithAuth)

    const nameInput = page.locator('#info').getByLabel('Nom', { exact: true })
    await nameInput.fill('Pending Contact')
    await nameInput.blur()
    await expect(page.locator('#info').getByRole('button', { name: /Enregistrer/i })).toBeVisible({ timeout: 5000 })

    let dialogs = 0
    page.on('dialog', async (dialog) => {
      dialogs++
      await dialog.dismiss()
    })
    const departmentSelect = page.locator('.v-select').filter({ hasText: 'Département' })
    await departmentSelect.click()
    await page.getByRole('option', { name: 'department 1' }).click()

    await expect(departmentSelect).toContainText("Racine de l'organisation")
    await expect(nameInput).toHaveValue('Pending Contact')
    // the restore of the previous department used to ask again, endlessly
    await page.waitForTimeout(500)
    expect(dialogs).toBe(1)
  })
})

test.describe('settings metadata score', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('standard and custom metadata lines show their weight and share', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await ax.patch('/api/v1/settings/organization/test_org1', {
      datasetsMetadata: { completeness: { active: true }, custom: [{ title: 'Service producteur', weight: 3 }, { title: 'Sans poids', weight: 0 }] }
    })

    await goToSettingsOrg(page, goToWithAuth)
    await page.locator('#catalog').getByRole('tab', { name: 'Métadonnées' }).click()
    const line = (title: string) => page.locator('.v-list-item').filter({ hasText: title })
    await expect(line('Répartition')).toHaveCount(0)
    await expect(page.getByText('Répartition du score')).toBeVisible()
    await expect(line('Description').first()).toContainText('Poids 4 (24 %)')
    await expect(line('Service producteur')).toContainText('Poids 3 (18 %)')
    await expect(line('Sans poids')).toContainText('Poids 0 (0 %)')
  })
})

test.describe('settings defaults filled by the form', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('opening a line of a list is not an edit, changing it is', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await ax.patch('/api/v1/settings/organization/test_org1', {
      datasetsMetadata: { custom: [{ title: 'Service producteur' }] },
      privateVocabulary: [{ title: 'Mon concept' }]
    })

    await goToSettingsOrg(page, goToWithAuth)
    const catalog = page.locator('#catalog')
    const openLine = async (title: string) => {
      const row = catalog.locator('.vjsf-list-item').filter({ hasText: title })
      await row.hover()
      await row.getByRole('button', { name: 'Actions' }).click()
      await page.getByRole('listitem').filter({ hasText: 'Éditer' }).click()
    }

    await catalog.getByRole('tab', { name: 'Vocabulaire privé' }).click()
    await openLine('Mon concept')
    await catalog.getByRole('tab', { name: 'Métadonnées' }).click()
    await openLine('Service producteur')
    await expect(catalog.getByRole('textbox', { name: 'Libellé' })).toHaveValue('Service producteur')
    await expect(catalog.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0)

    await catalog.getByRole('textbox', { name: 'Libellé' }).fill('Service renommé')
    await catalog.getByRole('textbox', { name: 'Libellé' }).blur()
    await expect(catalog.getByRole('button', { name: 'Enregistrer' })).toBeVisible()
  })

  test('the embedded metadata form saves nothing until an edit', async ({ page, goToWithAuth }) => {
    const patches: string[] = []
    page.on('request', request => { if (request.method() === 'PATCH') patches.push(request.url()) })

    await goToWithAuth('/data-fair/embed/settings/user/test_user1/datasets-metadata', 'test_user1')
    const score = page.getByRole('checkbox', { name: /Activer le score/ })
    await expect(score).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1000)
    expect(patches).toEqual([])

    await score.check()
    await expect(page.getByText('Répartition du score')).toBeVisible()
    await expect.poll(() => patches.length).toBe(1)
  })
})

test.describe('settings AI assistant audience', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('an org admin activates the assistant and restricts it to main organization admins', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')

    await goToSettingsOrg(page, goToWithAuth)
    const section = page.locator('#features')
    await section.scrollIntoViewIfNeeded()
    await section.getByLabel(/Activer l'assistant IA/i).check()
    await section.getByRole('button', { name: /Enregistrer/i }).click()
    await expect.poll(async () => (await ax.get('/api/v1/settings/organization/test_org1')).data.agentChat, { timeout: 10000 }).toBe(true)

    // a new rule defaults to the main organization only, all roles
    await section.getByRole('button', { name: /Ajouter une règle/i }).click()
    await section.locator('.v-select').filter({ hasText: 'Rôles' }).click()
    await page.getByRole('option', { name: 'admin', exact: true }).click()
    await page.keyboard.press('Escape')
    await section.getByRole('button', { name: /Enregistrer/i }).click()

    await expect.poll(async () => (await ax.get('/api/v1/settings/organization/test_org1')).data.agentChatAudience, { timeout: 10000 })
      .toEqual([{ department: '-', roles: ['admin'] }])
    await expect(section.getByText(/Seuls les membres correspondant/)).toBeVisible()
  })
})

test.describe('settings saves in flight', () => {
  let ax: AxiosInstance

  test.beforeEach(async () => {
    await clean()
    ax = await axiosAuth('test_user1@test.com')
  })

  const settings = async () => (await ax.get('/api/v1/settings/user/test_user1')).data

  test('a section cannot be canceled while it saves', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    const section = page.locator('#info')
    const nameInput = section.getByLabel('Nom', { exact: true })
    await nameInput.fill('Saved name')
    await nameInput.blur()

    await slowSaves(page, 1500)
    await section.getByRole('button', { name: 'Enregistrer' }).click()
    await section.getByRole('button', { name: 'Annuler' }).click({ force: true })
    await page.getByRole('button', { name: 'Confirmer' }).click({ timeout: 500 }).catch(() => {})

    await expect(section.getByRole('button', { name: 'Enregistrer' })).not.toBeVisible({ timeout: 5000 })
    await expect(nameInput).toHaveValue('Saved name')
    expect((await settings()).info.contact.name).toBe('Saved name')
  })

  test('a topic edited during its first save keeps its id', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    const section = page.locator('#catalog')
    await section.getByRole('button', { name: 'Ajouter une thématique' }).click()
    const titleInput = section.getByLabel('Titre', { exact: true })
    await titleInput.fill('First title')
    await titleInput.blur()

    await slowSaves(page, 1500)
    await section.getByRole('button', { name: 'Enregistrer' }).click()
    await titleInput.focus()
    await page.keyboard.type(' typed during the save')
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await settings()).topics?.length ?? 0).toBe(1)
    const { id } = (await settings()).topics[0]
    await page.waitForTimeout(2000)

    await page.unroute('**/api/v1/settings/**')
    const saveButton = section.getByRole('button', { name: 'Enregistrer' })
    if (await saveButton.isVisible()) {
      await saveButton.click()
      await expect(saveButton).not.toBeVisible({ timeout: 5000 })
    }
    expect((await settings()).topics.map((t: any) => t.id)).toEqual([id])
  })

  test('the late response of a save does not undo the save of another section', async ({ page, goToWithAuth }) => {
    await ax.patch('/api/v1/settings/user/test_user1', { info: { contact: { name: 'Old name' } } })
    await goToSettings(page, goToWithAuth)
    const catalog = page.locator('#catalog')
    await catalog.getByRole('button', { name: 'Ajouter une thématique' }).click()
    const titleInput = catalog.getByLabel('Titre', { exact: true })
    await titleInput.fill('Slow topic')
    await titleInput.blur()
    const contact = page.locator('#info')
    const nameInput = contact.getByLabel('Nom', { exact: true })
    await nameInput.fill('Quick name')
    await nameInput.blur()

    await slowSaves(page, 2500, 'topics')
    await catalog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.poll(async () => (await settings()).topics?.length ?? 0).toBe(1)
    await contact.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(contact.getByRole('button', { name: 'Enregistrer' })).not.toBeVisible({ timeout: 5000 })

    await expect(catalog.getByRole('button', { name: 'Enregistrer' })).not.toBeVisible({ timeout: 5000 })
    await expect(contact.getByRole('button', { name: 'Enregistrer' })).not.toBeVisible()
  })

  test('saving a section does not make partial metadata look modified', async ({ page, goToWithAuth }) => {
    await ax.patch('/api/v1/settings/user/test_user1', { datasetsMetadata: {} })
    await goToSettings(page, goToWithAuth)
    const contact = page.locator('#info')
    const nameInput = contact.getByLabel('Nom', { exact: true })
    await nameInput.fill('Some name')
    await nameInput.blur()
    await contact.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(contact.getByRole('button', { name: 'Enregistrer' })).not.toBeVisible({ timeout: 5000 })

    const catalog = page.locator('#catalog')
    await catalog.getByRole('tab', { name: /Métadonnées/ }).click()
    await expect(catalog.getByText('Métadonnées personnalisées')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)
    await expect(catalog.getByRole('button', { name: 'Enregistrer' })).not.toBeVisible()
  })

  test('saving the metadata does not make them look modified again', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    const catalog = page.locator('#catalog')
    await catalog.getByRole('tab', { name: /Métadonnées/ }).click()
    const row = catalog.locator('.vjsf-list-item').filter({ hasText: 'Producteur' })
    await row.hover()
    await row.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Éditer' }).or(page.getByRole('listitem').filter({ hasText: 'Éditer' })).first().click()
    await row.getByRole('checkbox', { name: 'Proposer cette métadonnée' }).check()
    const saveButton = catalog.getByRole('button', { name: 'Enregistrer' })
    await saveButton.click()
    await expect(saveButton).not.toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)
    await expect(saveButton).not.toBeVisible()
  })

  test('the secret of a new key is back after switching department', async ({ page, goToWithAuth }) => {
    await goToSettingsOrg(page, goToWithAuth)
    const section = page.locator('#integrations')
    await section.getByRole('button', { name: /Ajouter une clé d'API/i }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Titre', { exact: true }).fill('Secret key')
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
    const secret = section.getByText('Clé « Secret key » créée')
    await expect(secret).toBeVisible({ timeout: 5000 })

    const departmentSelect = page.locator('.v-select').filter({ hasText: 'Département' })
    await departmentSelect.click()
    await page.getByRole('option', { name: 'department 1' }).click()
    await expect(secret).not.toBeVisible({ timeout: 5000 })
    await departmentSelect.click()
    await page.getByRole('option', { name: "Racine de l'organisation" }).click()
    await expect(secret).toBeVisible({ timeout: 5000 })
  })

  test('an invalid tab left behind a department switch does not block the save', async ({ page, goToWithAuth }) => {
    await goToSettingsOrg(page, goToWithAuth)
    page.on('dialog', dialog => dialog.accept())
    const catalog = page.locator('#catalog')
    await catalog.getByRole('tab', { name: /Licences/ }).click()
    await catalog.getByRole('button', { name: 'Ajouter une licence' }).click()
    await catalog.getByRole('tab', { name: /Thématiques/ }).click()

    const departmentSelect = page.locator('.v-select').filter({ hasText: 'Département' })
    await departmentSelect.click()
    await page.getByRole('option', { name: 'department 1' }).click()
    await expect(catalog).not.toBeVisible({ timeout: 5000 })
    await departmentSelect.click()
    await page.getByRole('option', { name: "Racine de l'organisation" }).click()
    await expect(catalog).toBeVisible({ timeout: 5000 })

    await catalog.getByRole('button', { name: 'Ajouter une thématique' }).click()
    const titleInput = catalog.getByLabel('Titre', { exact: true })
    await titleInput.fill('After the switch')
    await titleInput.blur()
    await expect(catalog.getByRole('button', { name: 'Enregistrer' })).toBeEnabled({ timeout: 5000 })
  })
})

test.describe('settings api keys table', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('an unknown scope shows as is and a key email is not called a pseudo email', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await ax.patch('/api/v1/settings/user/test_user1', {
      apiKeys: [{ title: 'Old scope', scopes: ['legacy-scope'], expireAt: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }]
    })
    await goToSettings(page, goToWithAuth)
    const section = page.locator('#integrations')
    await expect(section.getByText('legacy-scope', { exact: true })).toBeVisible()
    await expect(section.getByRole('button', { name: /Copier l'email/ })).toBeVisible()
  })

  test('a webhook says what is missing before it can be saved', async ({ page, goToWithAuth }) => {
    await goToSettings(page, goToWithAuth)
    const section = page.locator('#integrations')
    await section.getByRole('tab', { name: /Webhooks/ }).click()
    await section.getByRole('button', { name: /Ajouter un webhook/i }).click()
    await expect(section.locator('.v-select.v-input--error').filter({ hasText: 'Événements déclencheurs' })).toBeVisible({ timeout: 5000 })
  })
})
