import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

// the fields owners activate from their settings had no coverage at all, which let two vuetify
// regressions live in master: the date fields not rendering at all, then the temporal range
// becoming impossible to select
test.describe('dataset activable metadata fields', () => {
  let datasetId: string

  // the picker opens on the current month, so use days that always exist in it
  const dayOfCurrentMonth = (day: number) => {
    const date = new Date()
    date.setDate(day)
    return date
  }
  // aria-label of a day button, e.g. "jeudi 6 août 2026", today's being prefixed with "Aujourd'hui, "
  const dayLabel = (date: Date) => new RegExp(date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  const displayed = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
  const stored = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    await ax.put('/api/v1/settings/user/test_user1', {
      datasetsMetadata: {
        spatial: { active: true },
        temporal: { active: true },
        frequency: { active: true },
        modified: { active: true }
      }
    })
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('fields activated in the owner settings are rendered in the metadata form', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    await expect(metadata.getByRole('combobox', { name: /Couverture spatiale/ })).toBeVisible()
    await expect(metadata.getByRole('combobox', { name: /Fréquence de mise à jour/ })).toBeVisible()
    await expect(metadata.getByRole('textbox', { name: /Couverture temporelle/ })).toBeVisible()
    await expect(metadata.getByRole('textbox', { name: /Date de modification de la source/ })).toBeVisible()
  })

  test('temporal coverage takes two clicks to form a range and is persisted', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const metadata = page.locator('#metadata')
    await expect(metadata).toBeVisible({ timeout: 15000 })

    const temporal = metadata.getByRole('textbox', { name: /Couverture temporelle/ })
    const start = dayOfCurrentMonth(6)
    const end = dayOfCurrentMonth(20)

    await temporal.click()
    const picker = page.locator('.v-date-picker-month')
    await expect(picker).toBeVisible({ timeout: 5000 })
    await picker.getByRole('button', { name: dayLabel(start) }).click()
    await picker.getByRole('button', { name: dayLabel(end) }).click()
    await expect(temporal).toHaveValue(`${displayed(start)} - ${displayed(end)}`)

    await page.keyboard.press('Escape')
    await metadata.getByRole('button', { name: /Enregistrer/ }).click()
    await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })

    const ax = await axiosAuth('test_user1@test.com')
    const saved = (await ax.get(`/api/v1/datasets/${datasetId}`)).data
    expect(saved.temporal).toEqual({ start: stored(start), end: stored(end) })

    // and clearing the field unsets it
    await page.reload()
    await expect(temporal).toHaveValue(`${displayed(start)} - ${displayed(end)}`, { timeout: 15000 })
    await metadata.getByRole('button', { name: /Vider Couverture temporelle/ }).click()
    await expect(temporal).toHaveValue('')
    await metadata.getByRole('button', { name: /Enregistrer/ }).click()
    await expect(metadata.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })
    expect((await ax.get(`/api/v1/datasets/${datasetId}`)).data.temporal).toBeUndefined()
  })
})
