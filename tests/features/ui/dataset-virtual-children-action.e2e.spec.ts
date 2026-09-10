import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'

// saving the structure of a virtual dataset from which a partOf child was removed must offer the
// delete-vs-unflag choice, not let the API refuse the patch with a bare 409
test.describe('dataset structure - removing a partOf child from a virtual dataset', () => {
  let childId: string
  let otherId: string
  let virtualId: string
  let ax: any

  test.beforeEach(async () => {
    await clean()
    ax = await axiosAuth('test_superadmin@test.com', undefined, true)
    const child = await sendDataset('datasets/dataset1.csv', ax)
    childId = child.id
    // a second, plain member: the virtual must keep at least one member, so the partOf child
    // being removed can't be the last one (see the "keep at least one member" rule)
    const other = await sendDataset('datasets/dataset2.csv', ax)
    otherId = other.id
    const virtualRes = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'virtual parent',
      virtual: { children: [childId, otherId] }
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
    // target the partOf child's own row (id shown in parentheses next to its title) so the other
    // member's "Supprimer" button isn't clicked by mistake
    const childRow = structure.locator('.v-list-item', { hasText: childId })
    await childRow.getByRole('button', { name: 'Supprimer', exact: true }).click()

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
    expect(virtual.virtual.children).toEqual([otherId])
  })

  test('choosing delete cascades to the orphaned child', async ({ page, goToWithAuth }) => {
    const dialog = await removeChildAndSave(page, goToWithAuth)

    await dialog.getByText(/Supprimer aussi les jeux enfants/).click()
    await dialog.getByRole('button', { name: /^Enregistrer$|^Save$/ }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    await expect(ax.get(`/api/v1/datasets/${childId}`)).rejects.toThrow()
    const virtual = (await ax.get(`/api/v1/datasets/${virtualId}`)).data
    expect(virtual.virtual.children).toEqual([otherId])
  })

  test('a child dataset has no delete section and the parent section explains the lifecycle', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${childId}`, 'test_superadmin')
    const dangerZone = page.locator('#danger-zone')
    await expect(dangerZone).toBeVisible({ timeout: 10000 })

    await expect(dangerZone.getByRole('button', { name: 'Supprimer le jeu de données', exact: true })).toHaveCount(0)
    await expect(dangerZone.getByText(/retirez d'abord l'attribut enfant/)).toBeVisible()
  })
})
