import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

test.describe('edit own lines embed', () => {
  test.beforeEach(clean)

  test('a crowd-sourcing contributor lists and edits only their own lines', async ({ page, goToWithAuth }) => {
    const owner = await axiosAuth('test_user1@test.com')
    const { data: dataset } = await owner.post('/api/v1/datasets', {
      isRest: true,
      title: 'Contributions',
      rest: { lineOwnership: true },
      schema: [{ key: 'nom', type: 'string', title: 'Nom' }]
    })
    // the permission granted by the crowd-sourcing toggle of the permissions editor
    await owner.put(`/api/v1/datasets/${dataset.id}/permissions`, [
      { type: 'user', id: '*', operations: ['readSafeDescription', 'readSafeSchema'], classes: ['manageOwnLines'] }
    ])
    const other = await axiosAuth('test_user3@test.com')
    await other.post(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines`, { nom: 'ligne des autres' })
    const contributor = await axiosAuth('test_alone@test.com')
    await contributor.post(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines`, { nom: 'ma ligne' })
    await waitForFinalize(owner, dataset.id)

    const refused: string[] = []
    page.on('response', r => { if (r.status() === 403) refused.push(r.url()) })
    const errors: Error[] = []
    page.on('pageerror', e => errors.push(e))

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/edit-own-lines`, 'test_alone')
    await expect(page.getByText('ma ligne')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('ligne des autres')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Ajouter une ligne/ })).toBeVisible()

    expect(refused).toEqual([])
    expect(errors.map(e => e.message)).toEqual([])
  })
})
