import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'

// the fields owners activate from their settings had no coverage at all, which let two vuetify
// regressions live in master: the date fields not rendering at all, then the temporal range
// becoming impossible to select
test.describe('dataset activable metadata fields', () => {
  let datasetId: string

  const pad = (n: number) => String(n).padStart(2, '0')
  const displayed = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
  const stored = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

  const settings = (staleType = 'integer') => ({
    datasetsMetadata: {
      groups: [{ key: 'gouvernance', title: 'Gouvernance' }],
      origin: { description: 'Page du producteur à renseigner.' },
      spatial: { active: true },
      temporal: { active: true, description: 'Période des relevés.' },
      frequency: { active: true, group: 'gouvernance' },
      modified: { active: true },
      custom: [
        { title: 'Service référent', description: 'Service de la Ville qui répond aux questions sur ce jeu.' },
        { title: 'Domaine métier', group: 'gouvernance' },
        { title: 'Direction', key: 'direction', enum: ['Voirie', 'Urbanisme'] },
        { title: 'Page de contact', key: 'contact', type: 'link' },
        { title: 'Effectif', key: 'effectif', type: 'integer' },
        { title: 'Ancien type', key: 'ancien', type: staleType }
      ]
    }
  })

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_datafair_user1@test.com')
    await ax.put('/api/v1/settings/user/test_datafair_user1', settings())
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('fields activated in the owner settings are rendered in the metadata form', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    await metadata.getByRole('tab', { name: 'Informations complémentaires' }).click()
    await expect(metadata.getByRole('combobox', { name: /Couverture géographique/ })).toBeVisible()
    await expect(metadata.getByRole('textbox', { name: /Couverture temporelle - début/ })).toBeVisible()
    await expect(metadata.getByRole('textbox', { name: /Couverture temporelle - fin/ })).toBeVisible()
    await expect(metadata.getByRole('textbox', { name: /Date de modification de la source/ })).toBeVisible()
  })

  test('temporal coverage is a start and an end date, persisted', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    const coverageTab = metadata.getByRole('tab', { name: 'Informations complémentaires' })
    await coverageTab.click()
    const startField = metadata.getByRole('textbox', { name: /Couverture temporelle - début/ })
    const endField = metadata.getByRole('textbox', { name: /Couverture temporelle - fin/ })
    const start = new Date(2026, 2, 6)
    const end = new Date(2026, 2, 20)

    // the vjsf date field parses what is typed (JJ/MM/AAAA) on blur
    await startField.fill(displayed(start))
    await startField.press('Tab')
    await endField.fill(displayed(end))
    await endField.press('Tab')
    await page.keyboard.press('Escape')
    await metadata.getByRole('button', { name: /Enregistrer/ }).click()
    await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })

    const ax = await axiosAuth('test_datafair_user1@test.com')
    const saved = (await ax.get(`/api/v1/datasets/${datasetId}`)).data
    expect(saved.temporal).toEqual({ start: stored(start), end: stored(end) })

    // and clearing both dates unsets it, vjsf only clears a date from its clear button
    await page.reload()
    await coverageTab.click({ timeout: 15000 })
    await expect(startField).toHaveValue(displayed(start), { timeout: 15000 })
    await metadata.getByRole('button', { name: /Vider Couverture temporelle - début/ }).click()
    await metadata.getByRole('button', { name: /Vider Couverture temporelle - fin/ }).click()
    await metadata.getByRole('button', { name: /Enregistrer/ }).click()
    await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })
    expect((await ax.get(`/api/v1/datasets/${datasetId}`)).data.temporal).toBeUndefined()
  })

  test('a custom metadata shows the help text set in the settings', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    // the help button vjsf renders from the schema description, next to the field
    await metadata.locator('.vjsf-node:not(:has(.vjsf-node))').filter({ hasText: 'Service référent' }).getByRole('button', { name: "Afficher un message d'aide" }).click()
    await expect(page.locator('.v-overlay .v-alert')).toContainText('Service de la Ville qui répond aux questions sur ce jeu.')
  })

  test('the help set in the settings replaces the native help of a standard metadata', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })
    const helpButton = "Afficher un message d'aide"

    await metadata.locator('.vjsf-node:not(:has(.vjsf-node))').filter({ hasText: 'Provenance' }).getByRole('button', { name: helpButton }).click()
    await expect(page.locator('.v-overlay .v-alert')).toContainText('Page du producteur à renseigner.')
    await page.keyboard.press('Escape')

    // the temporal heading is hidden: its help goes with the first date, once
    await metadata.getByRole('tab', { name: 'Informations complémentaires' }).click()
    const temporal = metadata.locator('.vjsf-node:has(.vjsf-node)').filter({ hasText: 'Couverture temporelle - début' }).last()
    await expect(temporal.getByRole('button', { name: helpButton })).toHaveCount(1)
  })

  test('a category from the owner settings gets its own tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })
    await expect(metadata.getByRole('combobox', { name: /Service référent/ })).toBeVisible()
    await expect(metadata.getByRole('combobox', { name: /Domaine métier/ })).not.toBeVisible()

    await metadata.getByRole('tab', { name: 'Gouvernance' }).click()
    await expect(metadata.getByRole('combobox', { name: /Domaine métier/ })).toBeVisible()
    await expect(metadata.getByRole('combobox', { name: /Fréquence de mise à jour/ })).toBeVisible()
    await expect(metadata.getByRole('combobox', { name: /Service référent/ })).not.toBeVisible()
  })
  test('custom metadata inputs follow their type', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    await metadata.locator('.v-select').filter({ hasText: 'Direction' }).click()
    await page.getByRole('option', { name: 'Voirie' }).click()
    await metadata.getByRole('textbox', { name: /Page de contact - URL/ }).fill('https://a.fr')
    await metadata.getByRole('textbox', { name: /Effectif/ }).fill('12')
    await metadata.getByRole('button', { name: /Enregistrer/ }).click()
    await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })

    const ax = await axiosAuth('test_datafair_user1@test.com')
    const saved = (await ax.get(`/api/v1/datasets/${datasetId}`)).data
    expect(saved.customMetadata).toMatchObject({ direction: 'Voirie', contact: { url: 'https://a.fr' }, effectif: 12 })
  })

  test('a typed field keeps what is typed while it is not valid yet', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })
    const url = metadata.getByRole('textbox', { name: /Page de contact - URL/ })
    await url.clear()
    await url.pressSequentially('https://b.fr')
    await expect(url).toHaveValue('https://b.fr')
  })

  test('editing a field keeps the unsaved edits of the other fields', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })
    const summary = metadata.getByRole('textbox', { name: /Résumé/ })
    await summary.pressSequentially('Un résumé')
    await metadata.locator('.CodeMirror').click()
    await page.keyboard.type('Une description')
    await summary.pressSequentially(' modifié')
    await metadata.getByRole('textbox', { name: /^Titre/ }).click()
    await expect(metadata.locator('.CodeMirror')).toContainText('Une description')

    await metadata.getByRole('button', { name: /Enregistrer/ }).click()
    await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })
    const ax = await axiosAuth('test_datafair_user1@test.com')
    const saved = (await ax.get(`/api/v1/datasets/${datasetId}`)).data
    expect(saved.summary).toBe('Un résumé modifié')
    expect(saved.description).toBe('Une description')
  })

  test('owner settings loaded while typing keep the edits', async ({ page, goToWithAuth }) => {
    await page.route(/\/datasets-metadata$/, async route => { await new Promise(resolve => setTimeout(resolve, 3000)); await route.continue() })
    const settingsLoaded = page.waitForResponse(/\/datasets-metadata$/, { timeout: 15000 })
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })
    await metadata.locator('.CodeMirror').click()
    await page.keyboard.type('Une autre description')
    await settingsLoaded
    await expect(metadata.getByRole('textbox', { name: /Résumé/ })).toBeVisible()
    await metadata.getByRole('textbox', { name: /Résumé/ }).fill('Un autre résumé')
    await metadata.getByRole('textbox', { name: /^Titre/ }).click()
    await expect(metadata.locator('.CodeMirror')).toContainText('Une autre description')
  })

  test('topics loaded after the form keep the typed title, before and after saving', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_datafair_user1@test.com')
    await ax.put('/api/v1/settings/user/test_datafair_user1', { ...settings(), topics: [{ id: 'sante', title: 'Santé' }] })
    try {
      await ax.patch(`/api/v1/datasets/${datasetId}`, { title: 'topics title', topics: [{ id: 'sante', title: 'Santé' }] })
      await page.route(/\/topics$/, async route => { await new Promise(resolve => setTimeout(resolve, 2000)); await route.continue() })
      const topicsLoaded = page.waitForResponse(/\/topics$/, { timeout: 15000 })
      await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_datafair_user1')
      const metadata = page.locator('#metadata')
      await expect(metadata).toBeVisible({ timeout: 15000 })
      await topicsLoaded
      const topics = metadata.getByRole('combobox', { name: /Thématiques/ })
      await expect(topics).toBeVisible()
      const title = metadata.getByRole('textbox', { name: /^Titre/ })
      await title.click()
      await page.keyboard.press('End')
      await page.keyboard.type(' edited')
      await expect(topics).toBeVisible()
      await metadata.getByRole('button', { name: /Enregistrer/ }).click()
      await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })
      expect((await ax.get(`/api/v1/datasets/${datasetId}`)).data.title).toBe('topics title edited')
      await expect(title).toHaveValue('topics title edited')
    } finally {
      await ax.put('/api/v1/settings/user/test_datafair_user1', settings())
    }
  })

  test('a type change empties the value and the form still saves', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_datafair_user1@test.com')
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'stale', schema: [{ key: 'a', type: 'string' }], customMetadata: { ancien: 3 } })).data
    await ax.put('/api/v1/settings/user/test_datafair_user1', settings('date'))
    try {
      await goToWithAuth(`/data-fair/dataset/${dataset.id}`, 'test_datafair_user1')
      const metadata = page.locator('#metadata')
      await expect(metadata).toBeVisible({ timeout: 15000 })
      await expect(metadata.getByRole('textbox', { name: /Ancien type/ })).toHaveValue('')
      await metadata.getByRole('textbox', { name: /^Titre/ }).fill('stale renamed')
      await metadata.getByRole('button', { name: /Enregistrer/ }).click()
      await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })
      const saved = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
      expect(saved.title).toBe('stale renamed')
      expect(saved.customMetadata ?? {}).toEqual({})
    } finally {
      await ax.put('/api/v1/settings/user/test_datafair_user1', settings())
    }
  })

  test('a dataset refresh landing while typing keeps the edits', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_datafair_user1@test.com')
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'late refresh', schema: [{ key: 'a', type: 'string' }] })).data
    await waitForFinalize(ax, dataset.id)
    await goToWithAuth(`/data-fair/dataset/${dataset.id}`, 'test_datafair_user1')
    const metadata = page.locator('#metadata')
    const summary = metadata.getByRole('textbox', { name: /Résumé/ })
    await expect(summary).toBeVisible({ timeout: 15000 })

    // a finalization refreshes the dataset store, which refetches the edited documents (no html
    // param, unlike the store): hold that refetch while the user types
    let release!: () => void
    const released = new Promise<void>(resolve => { release = resolve })
    const isEditRefetch = (url: string) => url.includes(`/api/v1/datasets/${dataset.id}?`) && url.includes('draft=true') && !url.includes('html')
    await page.route(`**/api/v1/datasets/${dataset.id}?*`, async route => {
      if (isEditRefetch(route.request().url())) await released
      await route.continue()
    })
    const refetch = page.waitForRequest(r => r.method() === 'GET' && isEditRefetch(r.url()), { timeout: 15000 })
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { a: 'x' })
    await refetch

    await summary.pressSequentially('Un résumé')
    const landed = page.waitForResponse(r => isEditRefetch(r.url()))
    release()
    await landed
    await page.waitForTimeout(500)
    await expect(summary).toHaveValue('Un résumé')
    await expect(metadata.getByRole('button', { name: /Enregistrer/ })).toBeVisible()
  })
})
