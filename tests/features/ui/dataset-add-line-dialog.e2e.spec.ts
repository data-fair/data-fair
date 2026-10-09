import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

test.describe('add line dialog', () => {
  test.beforeEach(clean)

  test('opening the dialog before the JSON schema has loaded still renders the form', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const { data: created } = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Registre',
      schema: [{ key: 'nom', type: 'string', title: 'Nom' }]
    })

    const errors: Error[] = []
    page.on('pageerror', e => errors.push(e))
    let releaseSchema!: () => void
    const schemaHeld = new Promise<void>(resolve => { releaseSchema = resolve })
    await page.route(`**/api/v1/datasets/${created.id}/schema*`, async route => {
      await schemaHeld
      await route.continue()
    })

    await goToWithAuth(`/data-fair/dataset/${created.id}/edit-data`, 'test_user1')
    await page.getByRole('button', { name: /Ajouter une ligne/ }).click({ timeout: 15000 })
    await expect(page.locator('.v-dialog')).toBeVisible()
    releaseSchema()

    await expect(page.locator('.v-dialog').getByLabel('Nom')).toBeVisible()
    expect(errors.map(e => e.message)).toEqual([])
  })
})
