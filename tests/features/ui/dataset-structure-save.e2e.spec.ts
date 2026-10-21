import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

test.describe('dataset structure save', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    await ax.put('/api/v1/datasets/structure-save', { isRest: true, title: 'structure save', schema: [{ key: 'nom', type: 'string', title: 'Nom' }] })
    await waitForFinalize(ax, 'structure-save')
  })

  // without the finalize-end refresh, the errorStatus/errorRetry nulls of a reprocessing save stayed in the form
  test('successive saves after a reprocessing one do not send pipeline fields', async ({ page, goToWithAuth }) => {
    await page.routeWebSocket(/.*/, () => {})
    const patchBodies: Record<string, unknown>[] = []
    page.on('request', r => { if (r.method() === 'PATCH' && r.url().includes('/datasets/structure-save')) patchBodies.push(r.postDataJSON()) })

    await goToWithAuth('/data-fair/dataset/structure-save', 'test_user1')
    const structure = page.locator('#structure')
    await expect(structure).toBeVisible({ timeout: 10000 })
    const saveBtn = structure.getByRole('button', { name: /Enregistrer|Save/ })
    const save = async () => {
      const response = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/datasets/structure-save'))
      await saveBtn.click()
      expect((await response).status()).toBe(200)
      await expect(saveBtn).not.toBeVisible({ timeout: 10000 })
    }

    await structure.getByRole('button', { name: /Ajouter une colonne|Add a column/ }).click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByRole('textbox').first().fill('Col A')
    await dialog.getByRole('button', { name: /^(Ajouter|Add)$/ }).click()
    await save()

    await structure.getByRole('button', { name: 'Nom', exact: true }).click()
    const label = structure.getByRole('textbox', { name: /Libellé|Label/ })
    await label.fill('Nom B')
    await save()
    await label.fill('Nom C')
    await save()

    expect(patchBodies).toHaveLength(3)
    for (const body of patchBodies) expect(Object.keys(body)).toEqual(['schema'])
  })
})
