import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

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
      spatial: { active: true },
      temporal: { active: true },
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
    const ax = await axiosAuth('test_user1@test.com')
    await ax.put('/api/v1/settings/user/test_user1', settings())
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('fields activated in the owner settings are rendered in the metadata form', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    await metadata.getByRole('tab', { name: 'Informations complémentaires' }).click()
    await expect(metadata.getByRole('combobox', { name: /Couverture géographique/ })).toBeVisible()
    await expect(metadata.getByRole('textbox', { name: /Couverture temporelle - début/ })).toBeVisible()
    await expect(metadata.getByRole('textbox', { name: /Couverture temporelle - fin/ })).toBeVisible()
    await expect(metadata.getByRole('textbox', { name: /Date de modification de la source/ })).toBeVisible()
  })

  test('temporal coverage is a start and an end date, persisted', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
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

    const ax = await axiosAuth('test_user1@test.com')
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
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    // the help button vjsf renders from the schema description, next to the field
    await metadata.locator('.vjsf-node:not(:has(.vjsf-node))').filter({ hasText: 'Service référent' }).getByRole('button', { name: "Afficher un message d'aide" }).click()
    await expect(page.locator('.v-overlay .v-alert')).toContainText('Service de la Ville qui répond aux questions sur ce jeu.')
  })

  test('a category from the owner settings gets its own tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
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
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    await metadata.locator('.v-select').filter({ hasText: 'Direction' }).click()
    await page.getByRole('option', { name: 'Voirie' }).click()
    await metadata.getByRole('textbox', { name: /Page de contact - URL/ }).fill('https://a.fr')
    await metadata.getByRole('textbox', { name: /Effectif/ }).fill('12')
    await metadata.getByRole('button', { name: /Enregistrer/ }).click()
    await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })

    const ax = await axiosAuth('test_user1@test.com')
    const saved = (await ax.get(`/api/v1/datasets/${datasetId}`)).data
    expect(saved.customMetadata).toMatchObject({ direction: 'Voirie', contact: { url: 'https://a.fr' }, effectif: 12 })
  })

  test('a typed field keeps what is typed while it is not valid yet', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })
    const url = metadata.getByRole('textbox', { name: /Page de contact - URL/ })
    await url.clear()
    await url.pressSequentially('https://b.fr')
    await expect(url).toHaveValue('https://b.fr')
  })

  test('a type change empties the value and the form still saves', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'stale', schema: [{ key: 'a', type: 'string' }], customMetadata: { ancien: 3 } })).data
    await ax.put('/api/v1/settings/user/test_user1', settings('date'))
    try {
      await goToWithAuth(`/data-fair/dataset/${dataset.id}`, 'test_user1')
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
      await ax.put('/api/v1/settings/user/test_user1', settings())
    }
  })
})
