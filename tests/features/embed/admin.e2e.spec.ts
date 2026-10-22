import { test as base, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForDatasetError } from '../../support/workers.ts'
import fs from 'fs-extra'
import FormData from 'form-data'

const test = base.extend<{ goToAsAdmin: (path: string) => Promise<void> }>({
  goToAsAdmin: async ({ goToWithAuth }, use) => {
    await use(path => goToWithAuth(path, 'test_superadmin', { adminMode: true }))
  }
})

test.describe('admin pages', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays info page with status and services', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/info')
    await expect(page.getByText('Statut :')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Data Fair - Back Office')).toBeVisible({ timeout: 10000 })
  })

  test('displays errors page listing datasets in error', async ({ page, goToAsAdmin }) => {
    // the errors listing is global (all owners), so asserting an EMPTY datasets state
    // would break whenever the shared dev env contains deliberately-errored datasets
    // (e.g. seeded by `npm run dev-fixtures`). Seed our own errored dataset (owned by
    // a test user, removed by clean()) and assert it is listed.
    const ax = await axiosAuth('test_user1@test.com')
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/csv-cases/dataset-bad-separators.csv'), 'dataset-bad-separators.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForDatasetError(ax, res.data.id)
    // wait for the terminal error state (errorRetryDelay=0: the automatic retry fails
    // instantly too) so the status cannot flip back while the page loads
    const deadline = Date.now() + 10000
    while ((dataset.status !== 'error' || dataset.errorRetry) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 200))
      dataset = (await ax.get(`/api/v1/datasets/${res.data.id}`)).data
    }

    await goToAsAdmin('/data-fair/admin/errors')
    await expect(page.getByText(dataset.title).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Aucune application en erreur')).toBeVisible({ timeout: 10000 })
  })

  test('displays owners page with title', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/owners')
    await expect(page.getByRole('heading', { name: 'Propriétaires' })).toBeVisible({ timeout: 10000 })
  })

  test('displays base-apps page with title', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/base-apps')
    await expect(page.getByRole('heading', { name: "Modèles d'application" })).toBeVisible({ timeout: 10000 })
  })

  // The agents page is now a pure d-frame embedding the /agents/admin/ service, which owns
  // the title and the account/organization selector. Assert the embed, not the iframe's content.
  test('displays agents page as a d-frame embedding the agents admin service', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/admin/agents')
    const dFrame = page.locator('d-frame#agents')
    await expect(dFrame).toBeAttached({ timeout: 10000 })
    const src = await dFrame.getAttribute('src')
    expect(src).toContain('/agents/admin/')
  })
})
