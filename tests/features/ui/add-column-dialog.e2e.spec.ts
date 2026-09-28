import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

// The API accepts any key that does not corrupt the index, so it is the back-office's job to
// make the people it serves use normalized keys: the dialog derives the key from the typed name,
// shows it, and refuses a name that leaves no usable key.
test.describe('add-column dialog', () => {
  test.beforeEach(async () => { await clean() })

  test('shows the normalized key and refuses a name without a usable key', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const { data: created } = await ax.post('/api/v1/datasets', { isRest: true, title: 'Notes', schema: [] })

    await goToWithAuth(`/data-fair/dataset/${created.id}`, 'test_user1')
    await page.getByRole('tab', { name: /Schéma/ }).click()
    await page.getByRole('button', { name: /Ajouter une colonne/ }).click()
    const addButton = page.locator('.v-card-actions').getByRole('button', { name: /^Ajouter$/ })

    await page.getByLabel(/Nom de la colonne/).fill('Note C2.1')
    await expect(page.getByText('Clé de la colonne : note_c21')).toBeVisible()
    await expect(addButton).toBeEnabled()

    await page.getByLabel(/Nom de la colonne/).fill('!!!')
    await expect(page.getByText('Le nom doit contenir au moins une lettre ou un chiffre')).toBeVisible()
    await expect(addButton).toBeDisabled()
  })
})
