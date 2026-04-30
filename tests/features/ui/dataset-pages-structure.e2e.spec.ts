import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('dataset page restructuring', () => {
  let datasetId: string

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('main page sections, tabs and right-nav action items are correct', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')

    // All top-level sections rendered
    await expect(page.locator('#informations')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#metadata')).toBeVisible()
    await expect(page.locator('#structure')).toBeVisible()
    await expect(page.locator('#exploration')).toBeVisible()
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()

    // Exploration tabs
    await expect(page.locator('#exploration').getByRole('tab', { name: /Tableau|Table/ })).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Applications/ })).toBeVisible()

    // Structure tabs
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()

    // Share tabs
    await expect(page.locator('#share').getByRole('tab', { name: /Intégrer|Embed/ })).toBeVisible()
    await expect(page.locator('#share').getByRole('tab', { name: /Clé d'API|Read API key/ })).toBeVisible()

    // Activity tab
    await expect(page.locator('#activity').getByRole('tab', { name: /Journal/ })).toBeVisible()

    // Right-nav actions list does NOT contain items moved inline
    const actionsList = page.locator('#navigation-right-local')
    await expect(actionsList).toBeVisible()
    await expect(actionsList.getByText(/Éditer les métadonnées|Edit metadata/)).not.toBeVisible()
    await expect(actionsList.getByText(/Intégrer dans un site|Embed in a website/)).not.toBeVisible()
    await expect(actionsList.getByText('Notifications')).not.toBeVisible()
    await expect(actionsList.getByText('Webhooks')).not.toBeVisible()
  })

  test('/table route loads table view', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/table`, 'test_user1')
    await expect(page.locator('.dataset-table')).toBeAttached({ timeout: 15000 })
  })
})
