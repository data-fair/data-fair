import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}`

test.describe('bin page', () => {
  test.beforeAll(async () => {
    await clean()
  })

  test('enable the bin, shelve a dataset, restore it, then disable the bin', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await ax.post('/api/v1/datasets/bin-ui', { isRest: true, title: 'Bin UI', schema: [{ key: 'str', type: 'string' }] })
    await waitForFinalize(ax, 'bin-ui')

    // enable the bin in the org settings
    await goToWithAuth('/data-fair/settings', 'test_user1', { org: 'test_org1' })
    const features = page.locator('#features')
    await expect(features).toBeVisible({ timeout: 15000 })
    const nav = page.locator('.v-navigation-drawer')
    await expect(nav.getByText('Paramètres')).toBeVisible()
    await expect(nav.getByText('Corbeille')).toHaveCount(0)
    await features.getByLabel('Activer la corbeille').check()
    await features.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Les paramètres ont été mis à jour')).toBeVisible()
    await expect(nav.getByText('Corbeille')).toBeVisible()

    // the delete dialog announces the bin
    await page.goto(`${baseUrl}/data-fair/dataset/bin-ui`)
    const dangerZone = page.locator('#danger-zone')
    await expect(dangerZone.getByText(/placé dans la corbeille/)).toBeVisible({ timeout: 15000 })
    await dangerZone.getByRole('button', { name: /Supprimer le jeu de données/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/sera placé dans la corbeille et deviendra immédiatement inaccessible/)).toBeVisible()
    await expect(dialog.getByText(/pendant 30 jours/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Oui' }).click()
    await page.waitForURL(`${baseUrl}/data-fair/datasets`)

    // the bin lists it, restore it
    await page.goto(`${baseUrl}/data-fair/bin`)
    await expect(nav.getByText('Corbeille')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/conservés 30 jours avant suppression définitive/)).toBeVisible()
    const row = page.locator('tr').filter({ hasText: 'Bin UI' })
    await expect(row).toBeVisible()
    await expect(row.getByText('bin-ui', { exact: true })).toBeVisible()
    await expect(row.getByText(/dans (29|30) jours/)).toBeVisible()
    await row.getByRole('button', { name: 'Restaurer' }).click()
    await expect(page.getByText('« Bin UI » a été restauré')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ouvrir' })).toBeVisible()
    await expect(page.locator('tr').filter({ hasText: 'Bin UI' })).toHaveCount(0)

    // the dataset is back
    await page.goto(`${baseUrl}/data-fair/dataset/bin-ui`)
    await expect(page.locator('#danger-zone')).toBeVisible({ timeout: 15000 })

    // shelve it again, then disable the bin: the purge is announced
    await ax.delete('/api/v1/datasets/bin-ui')
    await page.goto(`${baseUrl}/data-fair/settings`)
    await expect(features).toBeVisible({ timeout: 15000 })
    await features.getByLabel('Activer la corbeille').uncheck()
    await features.getByRole('button', { name: 'Enregistrer' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm.getByText('1 élément dans la corbeille sera définitivement supprimé')).toBeVisible()
    await confirm.getByRole('button', { name: 'Confirmer' }).click()
    await expect(page.getByText('Les paramètres ont été mis à jour')).toBeVisible()
    await expect(nav.getByText('Corbeille')).toHaveCount(0)
  })
})
