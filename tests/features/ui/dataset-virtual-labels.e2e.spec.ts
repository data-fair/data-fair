import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

test.describe('virtual dataset — consult value labels (x-labels) in the schema tab', () => {
  let virtualId: string

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')

    // two REST children sharing the same column, each carrying its own value labels —
    // the virtual dataset's schema is derived (labels merged) and cannot be edited directly,
    // which is why the UI must still let users consult them
    const child = async (id: string, labels: Record<string, string>) => {
      await ax.put(`/api/v1/datasets/${id}`, {
        isRest: true,
        title: id,
        schema: [{ key: 'id', title: 'Identifiant', type: 'string', 'x-labels': labels }]
      })
      await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [{ id: Object.keys(labels)[0] }])
      await waitForFinalize(ax, id)
    }
    await child('virtual-labels-child1', { koumoul: 'Koumoul' })
    await child('virtual-labels-child2', { bidule: 'Bidule' })

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset with labels',
      virtual: { children: ['virtual-labels-child1', 'virtual-labels-child2'] },
      schema: [{ key: 'id' }]
    })
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    virtualId = virtualDataset.id
    // sanity check: the derived schema really carries the merge of the children labels
    expect(virtualDataset.schema[0]['x-labels']).toEqual({ koumoul: 'Koumoul', bidule: 'Bidule' })
  })

  test('labels dialog is available in read-only mode for a virtual dataset', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_user1')

    // select the column in the schema tab (default structure tab)
    const columnChip = page.locator('#structure').getByRole('button', { name: 'Identifiant' })
    await expect(columnChip).toBeVisible({ timeout: 10000 })
    await columnChip.click()

    // the labels button is present even though the dataset is virtual (the action row used to be hidden entirely)
    const labelsButton = page.getByRole('button', { name: 'Libellés des valeurs' })
    await expect(labelsButton).toBeVisible()
    await labelsButton.click()

    // read-only presentation with the labels merged from both children
    await expect(page.getByText('Consultation seule : les libellés de ce champ ne sont pas modifiables ici.')).toBeVisible()
    await expect(page.getByText('Koumoul', { exact: true })).toBeVisible()
    await expect(page.getByText('bidule', { exact: true })).toBeVisible()
    await expect(page.getByText('Bidule', { exact: true })).toBeVisible()
    // no editing affordances in read-only mode
    await expect(page.getByText('Associer un libellé à une valeur')).not.toBeVisible()
  })
})
