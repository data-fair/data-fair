import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, anonymousAx, apiUrl } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import type { Page } from '@playwright/test'

// The integrity panel as the dataset owner reads it (no superadmin actions): it must state what the
// guarantee is, how fresh the verdict is, and what "verified" means for each part.
test.describe('dataset integrity panel', () => {
  let datasetId: string

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    datasetId = (await sendDataset('datasets/dataset1.csv', ax)).id
    const superadmin = await axiosAuth('test_superadmin@test.com', undefined, true)
    await superadmin.put(`/api/v1/datasets/${datasetId}/_integrity`, { active: true })
    const check = (await superadmin.post(`/api/v1/datasets/${datasetId}/_integrity/_check`)).data
    expect(check.status).toBe('ok')
  })

  test('explains the guarantee, the verdict freshness and each verified part', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const tab = page.getByRole('tab', { name: 'Intégrité' })
    await tab.waitFor({ state: 'visible', timeout: 15000 })
    await tab.click()

    // the guarantee statement, open on first visit
    await expect(page.getByText(/scellée sous forme de révision dans un entrepôt verrouillé/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Le contrôle n'empêche pas une altération/)).toBeVisible()

    // verdict, its age and the protection it rests on
    await expect(page.getByText('L\'intégrité a été vérifiée, aucune divergence détectée.')).toBeVisible()
    await expect(page.getByText(/Dernier contrôle : .*\(il y a/)).toBeVisible()
    await expect(page.getByText(/Dernière révision scellée n°\d+ du .*, verrouillée jusqu'au/)).toBeVisible()
    await expect(page.getByText(/Ce verdict a/)).toHaveCount(0)

    // one row per part, each with its own explanation
    await expect(page.getByText('Fichier de données', { exact: true })).toBeVisible()
    await expect(page.getByText('Cohérence de l\'historique', { exact: true })).toBeVisible()
    const indexRow = page.getByText('Index de recherche', { exact: true }).locator('xpath=ancestor::div[contains(@class, "flex-grow-1")][1]')
    await indexRow.getByRole('button', { name: 'Afficher l\'aide' }).click()
    await expect(page.getByText(/un échantillon tiré au hasard/)).toBeVisible()
  })

  // the states below are display state written straight into the dataset doc: the panel's job is
  // to render them, how the checker reaches them is covered by the API suites
  const openPanel = async (page: Page, goToWithAuth: (url: string, user: string) => Promise<void>) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const tab = page.getByRole('tab', { name: 'Intégrité' })
    await tab.waitFor({ state: 'visible', timeout: 15000 })
    await tab.click()
  }

  test('an old ok verdict is flagged as stale', async ({ page, goToWithAuth }) => {
    const date = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-dataset/${datasetId}`, { 'integrity.lastCheck.date': date })
    await openPanel(page, goToWithAuth)
    await expect(page.getByText('Ce verdict a 5 jours : l\'état actuel n\'a pas été contrôlé depuis.')).toBeVisible({ timeout: 15000 })
  })

  test('a breach tells a reader without remedies who acts', async ({ page, goToWithAuth }) => {
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-dataset/${datasetId}`, { 'integrity.lastCheck.status': 'breach', 'integrity.lastCheck.breach': ['metadata'], 'integrity.lastCheck.date': new Date().toISOString() })
    await openPanel(page, goToWithAuth)
    await expect(page.getByText('Intégrité compromise')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/eux seuls peuvent restaurer ou réconcilier/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Réconcilier' })).toHaveCount(0)
  })
})
