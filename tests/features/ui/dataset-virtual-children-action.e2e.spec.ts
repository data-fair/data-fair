import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'

// saving the structure of a virtual dataset from which a partOf child was removed must offer the
// delete-vs-unflag choice, not let the API refuse the patch with a bare 409
test.describe('dataset structure - removing a partOf child from a virtual dataset', () => {
  let childId: string
  let virtualId: string
  let ax: any

  test.beforeEach(async () => {
    await clean()
    ax = await axiosAuth('test_superadmin@test.com', undefined, true)
    const child = await sendDataset('datasets/dataset1.csv', ax)
    childId = child.id
    const virtualRes = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'virtual parent',
      virtual: { children: [childId] }
    })
    virtualId = virtualRes.data.id
    await waitForFinalize(ax, virtualId)
    await ax.patch(`/api/v1/datasets/${childId}`, { partOf: { type: 'dataset', id: virtualId } })
  })

  const removeChildAndSave = async (page: any, goToWithAuth: any) => {
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_superadmin')
    const structure = page.locator('#structure')
    await expect(structure).toBeVisible({ timeout: 10000 })

    await structure.getByRole('tab', { name: /Jeu de données virtuel|Virtual dataset/ }).click()
    // the trash button of the single aggregated dataset (the danger-zone "Supprimer le jeu de
    // données" button lives outside #structure, so an exact name match is unambiguous here)
    await structure.getByRole('button', { name: 'Supprimer', exact: true }).click()

    const saveBtn = page.getByRole('button', { name: /^Enregistrer$|^Save$/ })
    await expect(saveBtn).toBeVisible({ timeout: 10000 })
    await saveBtn.click()

    // the dialog only opens after the orphan pre-check request resolves, keep a generous timeout
    const dialog = page.locator('.v-dialog').filter({ hasText: /Jeux de données enfants|Child datasets/ })
    await expect(dialog).toBeVisible({ timeout: 10000 })
    return dialog
  }

  test('offers the delete-vs-unflag choice instead of failing, and unflag keeps the child', async ({ page, goToWithAuth }) => {
    const dialog = await removeChildAndSave(page, goToWithAuth)

    await expect(dialog.getByText(/Un jeu de données enfant est retiré|A child dataset is removed/)).toBeVisible()
    await expect(dialog.getByText(/Conserver les jeux enfants/)).toBeVisible()
    await expect(dialog.getByText(/Supprimer aussi les jeux enfants/)).toBeVisible()

    // "unflag" is the pre-selected option
    await dialog.getByRole('button', { name: /^Enregistrer$|^Save$/ }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // the child survives, stripped of its child attribute, and is no longer a member
    const child = (await ax.get(`/api/v1/datasets/${childId}`)).data
    expect(child.partOf).toBeUndefined()
    const virtual = (await ax.get(`/api/v1/datasets/${virtualId}`)).data
    expect(virtual.virtual.children).toEqual([])
  })

  test('choosing delete cascades to the orphaned child', async ({ page, goToWithAuth }) => {
    const dialog = await removeChildAndSave(page, goToWithAuth)

    await dialog.getByText(/Supprimer aussi les jeux enfants/).click()
    await dialog.getByRole('button', { name: /^Enregistrer$|^Save$/ }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    await expect(ax.get(`/api/v1/datasets/${childId}`)).rejects.toThrow()
  })
})
