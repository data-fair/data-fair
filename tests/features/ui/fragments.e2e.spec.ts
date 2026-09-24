import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import type { AxiosInstance } from 'axios'
import type { Page, Locator } from '@playwright/test'

// the login fixture's exchange token can rotate the active-account cookie mid-navigation
// (see fixtures/login.ts); when it does, the app itself offers this recovery button instead
// of the requested page — race it against the expected content and click through it once.
async function pastActiveAccountGate (page: Page, target: Locator) {
  const switchAccountBtn = page.getByRole('button', { name: 'Basculer le compte actif' })
  const outcome = await Promise.race([
    target.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'target' as const).catch(() => 'timeout' as const),
    switchAccountBtn.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'switch' as const).catch(() => 'timeout' as const)
  ])
  if (outcome === 'switch') {
    await switchAccountBtn.click()
    await target.waitFor({ state: 'visible', timeout: 15000 })
  }
}

test.describe('fragments UI', () => {
  let ax: AxiosInstance
  let virtualId: string
  let fragmentId: string

  test.beforeAll(async () => {
    await clean()
    ax = await axiosAuth('test_user1@test.com', 'test_org1')
    virtualId = (await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent' })).data.id
    fragmentId = (await sendDataset('datasets/dataset1.csv', ax, {}, { partOf: { type: 'dataset', id: virtualId } })).id
  })

  test('fragment page shows the banner and hides what the parent covers', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${fragmentId}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.getByText(/fragment de/i))
    await expect(page.getByText(/fragment de/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: 'virtual parent' })).toBeVisible()
    await expect(page.locator('#metadata').getByRole('textbox', { name: 'Titre' })).toBeVisible()
    // shared, published and catalogued through its parent only
    await expect(page.locator('#share')).toHaveCount(0)
    await expect(page.locator('#fragments')).toHaveCount(0)
    await expect(page.locator('#metadata').getByRole('tab', { name: /Pièces jointes/ })).toHaveCount(0)
    await expect(page.locator('#metadata').getByLabel('Licence')).toHaveCount(0)
    await expect(page.locator('#danger-zone').getByText(/Détacher/).first()).toBeVisible()
  })

  test('a fragment becomes a source of its virtual parent only when explicitly added', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${fragmentId}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.getByText(/fragment de/i))
    await expect(page.getByText(/pas encore une source/)).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Ajouter aux sources' }).click()
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${virtualId}`)).data.virtual.children, { timeout: 10000 }).toEqual([fragmentId])
    await expect(page.getByText(/pas encore une source/)).toHaveCount(0)

    // the parent's Fragments section tells its sources apart
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${virtualId}`)).data.status, { timeout: 10000 }).toBe('finalized')
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.locator('#fragments'))
    await expect(page.locator('#fragments').getByText('Source du jeu de données')).toBeVisible({ timeout: 15000 })

    // added from the parent's Fragments section, the virtual editor of the structure section follows
    const second = await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'second fragment', partOf: { type: 'dataset', id: virtualId } })
    await page.reload()
    await expect(page.locator('#fragments').getByText('Pas encore une source')).toBeVisible({ timeout: 15000 })
    await page.locator('#fragments').getByRole('button', { name: 'Ajouter aux sources' }).click()
    await expect(page.locator('#fragments').getByText('Pas encore une source')).toHaveCount(0)
    await page.locator('#structure').getByRole('tab', { name: 'Jeu de données virtuel' }).click()
    await expect(page.locator('#structure').getByRole('link', { name: new RegExp(second.id) })).toBeVisible()
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${virtualId}`)).data.status, { timeout: 10000 }).toBe('finalized')
    // deleting a dataset also pulls it from the virtual datasets using it
    await ax.delete(`/api/v1/datasets/${second.id}`)
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${virtualId}`)).data.status, { timeout: 10000 }).toBe('finalized')

    // expose a column for the creation test below
    await ax.patch(`/api/v1/datasets/${virtualId}`, { schema: [{ key: 'id' }] })
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${virtualId}`)).data.status, { timeout: 10000 }).toBe('finalized')
  })

  test('creating a fragment starts from the parent', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/new-dataset?partOf=dataset:${virtualId}`, 'test_user1', { org: 'test_org1' })
    // the parent is read from the active account, which the switch gate fixes when it is not the org yet
    await pastActiveAccountGate(page, page.getByText('Éditable'))
    // no metadata-only fragment, the breadcrumb leads back to the parent
    await expect(page.getByText('Métadonnées seules')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'virtual parent' })).toBeVisible()
    await page.getByText('Éditable').click()
    // the initialization step starts from the parent's columns
    const stepWindow = page.locator('.v-stepper-window')
    await expect(stepWindow.getByText('virtual parent')).toBeVisible()
    // copying the parent's rows into its own fragment would duplicate them
    await expect(stepWindow.getByText('Copier la donnée')).toHaveCount(0)
    // nor its description: a fragment is described by its parent
    await expect(stepWindow.getByText(/Copier le résumé/)).toHaveCount(0)
    await page.getByRole('button', { name: 'Continuer' }).click()
    await page.getByLabel('Titre').fill('my rest fragment')
    await page.getByRole('button', { name: 'Continuer' }).click()
    // the owner is the parent's: the banner replaces the owner picker
    await expect(page.getByText(/fragment de/i)).toBeVisible()
  })

  test('attaching is only proposed towards the single virtual dataset already using the dataset', async ({ page, goToWithAuth }) => {
    const standalone = await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'standalone' })
    const user = (await ax.post('/api/v1/datasets', { isVirtual: true, title: 'the only user', virtual: { children: [standalone.id] } })).data
    await goToWithAuth(`/data-fair/dataset/${standalone.id}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.locator('#danger-zone'))
    const dangerZone = page.locator('#danger-zone')
    await expect(dangerZone.getByText(/n'est utilisé que par « the only user »/)).toBeVisible({ timeout: 15000 })
    await dangerZone.getByRole('button', { name: 'Rattacher au jeu de données virtuel' }).click()
    await expect(page.getByText(/deviendra un fragment de « the only user »/)).toBeVisible()
    await page.getByRole('button', { name: 'Rattacher', exact: true }).click()
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${standalone.id}`)).data.partOf, { timeout: 10000 }).toEqual({ type: 'dataset', id: user.id })

    // used by two virtual datasets, the dataset is shared: nothing is proposed
    const shared = await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'shared' })
    for (const title of ['first user', 'second user']) {
      await ax.post('/api/v1/datasets', { isVirtual: true, title, virtual: { children: [shared.id] } })
    }
    await goToWithAuth(`/data-fair/dataset/${shared.id}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.locator('#danger-zone'))
    await expect(page.locator('#danger-zone').getByText(/Supprimer le jeu de données/).first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#danger-zone').getByText(/Rattacher/)).toHaveCount(0)
  })

  test('parent page lists fragments and the delete dialog offers to detach them first', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.locator('#fragments'))
    await expect(page.locator('#fragments')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#fragments').getByText('dataset1').first()).toBeVisible()
    await page.locator('#danger-zone').getByRole('button', { name: /Supprimer le jeu de données/ }).click()
    await expect(page.getByText(/1 fragment/)).toBeVisible()
    await page.getByRole('button', { name: /Détacher d'abord/ }).click()
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${fragmentId}`)).data.partOf, { timeout: 10000 }).toBeUndefined()
    await expect.poll(async () => ax.get(`/api/v1/datasets/${virtualId}`).then(() => 200, (err: any) => err.status), { timeout: 10000 }).toBe(404)
  })
})
