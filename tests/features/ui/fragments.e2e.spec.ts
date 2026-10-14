import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, mockAppUrl } from '../../support/axios.ts'
import { sendDataset, setupMockRoute, clearMockRoutes } from '../../support/workers.ts'
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

  test('fragment page links to its parent and hides what the parent covers', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${fragmentId}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.getByText(/fragment de/i))
    await expect(page.getByText(/fragment de/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: 'virtual parent' })).toBeVisible()
    await expect(page.locator('#metadata').getByRole('textbox', { name: 'Titre' })).toBeVisible()
    // shared, published and catalogued through its parent only
    await expect(page.locator('#share')).toHaveCount(0)
    await expect(page.locator('#structure').getByRole('tab', { name: 'Fragments' })).toHaveCount(0)
    await expect(page.locator('#metadata').getByRole('tab', { name: /Pièces jointes/ })).toHaveCount(0)
    await expect(page.locator('#metadata').getByLabel('Licence')).toHaveCount(0)
    await expect(page.locator('#metadata').getByText('Description', { exact: true }).first()).toBeVisible()
    await expect(page.locator('#danger-zone').getByText(/Détacher/).first()).toBeVisible()
  })

  test('a fragment becomes a source of its virtual parent only when explicitly added', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${fragmentId}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.getByText(/fragment de/i))
    await expect(page.getByText(/pas encore une source/)).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Ajouter aux sources' }).click()
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${virtualId}`)).data.virtual.children, { timeout: 10000 }).toEqual([fragmentId])
    await expect(page.getByText(/pas encore une source/)).toHaveCount(0)

    // the parent's Fragments tab tells its sources apart
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${virtualId}`)).data.status, { timeout: 10000 }).toBe('finalized')
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_user1', { org: 'test_org1' })
    const fragmentsTab = page.locator('#structure').getByRole('tab', { name: 'Fragments' })
    await pastActiveAccountGate(page, fragmentsTab)
    await fragmentsTab.click()
    await expect(page.locator('#structure').getByText('Source du jeu de données')).toBeVisible({ timeout: 15000 })

    // added from the parent's Fragments tab, the virtual editor of the structure section follows
    const second = await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'second fragment', partOf: { type: 'dataset', id: virtualId } })
    await page.reload()
    await fragmentsTab.click()
    await expect(page.locator('#structure').getByText('Pas encore une source')).toBeVisible({ timeout: 15000 })
    await page.locator('#structure').getByRole('button', { name: 'Ajouter aux sources' }).click()
    await expect(page.locator('#structure').getByText('Pas encore une source')).toHaveCount(0)
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
    // nor its catalog metadata: a fragment is not catalogued
    await expect(stepWindow.getByText(/Copier le résumé/)).toHaveCount(0)
    await page.getByRole('button', { name: 'Continuer' }).click()
    await page.getByLabel('Titre').fill('my rest fragment')
    await page.getByRole('button', { name: 'Continuer' }).click()
    // the owner is the parent's: the parent link replaces the owner picker
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

  test('attaching is only proposed towards the single application already embedding the application', async ({ page, goToWithAuth }) => {
    const embed = async (parentTitle: string, childIds: string[]) => {
      const parent = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: parentTitle })).data
      await ax.put(`/api/v1/applications/${parent.id}/config`, { applications: childIds.map(id => ({ id })) })
      return parent
    }
    const standalone = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'standalone app' })).data
    const dashboard = await embed('the only dashboard', [standalone.id])
    await goToWithAuth(`/data-fair/application/${standalone.id}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.locator('#danger-zone'))
    const dangerZone = page.locator('#danger-zone')
    await expect(dangerZone.getByText(/n'est intégrée que dans « the only dashboard »/)).toBeVisible({ timeout: 15000 })
    await dangerZone.getByRole('button', { name: 'Rattacher à l\'application parente' }).click()
    await expect(page.getByText(/deviendra un fragment de « the only dashboard »/)).toBeVisible()
    await page.getByRole('button', { name: 'Rattacher', exact: true }).click()
    await expect.poll(async () => (await ax.get(`/api/v1/applications/${standalone.id}`)).data.partOf, { timeout: 10000 }).toEqual({ type: 'application', id: dashboard.id })

    // embedded in two applications, the application is shared: nothing is proposed
    const shared = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'shared app' })).data
    await embed('first dashboard', [shared.id])
    await embed('second dashboard', [shared.id])
    await goToWithAuth(`/data-fair/application/${shared.id}`, 'test_user1', { org: 'test_org1' })
    await pastActiveAccountGate(page, page.locator('#danger-zone'))
    await expect(page.locator('#danger-zone').getByText(/Supprimer l'application/).first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#danger-zone').getByText(/Rattacher/)).toHaveCount(0)
  })

  test('creating a sub-application fragment is only offered on base apps that embed applications', async ({ page, goToWithAuth }) => {
    // a dashboard-like base app declaring that it embeds other applications
    await setupMockRoute({
      path: '/dashapp/index.html',
      contentType: 'text/html',
      body: '<html><head><title>Dashboard</title><meta name="application-name" content="dashapp"><meta name="df:use-apps" content="true"></head><body>dashboard</body></html>'
    })
    const superadmin = await axiosAuth('test_superadmin@test.com', undefined, true)
    await superadmin.post('/api/v1/base-applications', { url: mockAppUrl('dashapp') })
    const dashboard = (await ax.post('/api/v1/applications', { url: mockAppUrl('dashapp'), title: 'a dashboard' })).data
    const plain = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'a plain app' })).data

    const fragmentsTab = page.locator('#render').getByRole('tab', { name: 'Fragments' })
    const render = page.locator('#render')
    try {
      await goToWithAuth(`/data-fair/application/${dashboard.id}`, 'test_user1', { org: 'test_org1' })
      await pastActiveAccountGate(page, fragmentsTab)
      await fragmentsTab.click()
      await expect(render.getByRole('link', { name: 'Nouveau jeu de données fragment' })).toBeVisible({ timeout: 15000 })
      await expect(render.getByRole('link', { name: 'Nouvelle application fragment' })).toBeVisible()

      // the tab stays, dataset fragments are relevant to any application
      await goToWithAuth(`/data-fair/application/${plain.id}`, 'test_user1', { org: 'test_org1' })
      await pastActiveAccountGate(page, fragmentsTab)
      await fragmentsTab.click()
      await expect(render.getByRole('link', { name: 'Nouveau jeu de données fragment' })).toBeVisible({ timeout: 15000 })
      await expect(render.getByRole('link', { name: 'Nouvelle application fragment' })).toHaveCount(0)
    } finally {
      await clearMockRoutes()
    }
  })

  test('parent page lists fragments and the delete dialog offers to detach them first', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_user1', { org: 'test_org1' })
    const fragmentsTab = page.locator('#structure').getByRole('tab', { name: 'Fragments' })
    await pastActiveAccountGate(page, fragmentsTab)
    await fragmentsTab.click()
    await expect(page.locator('#structure').getByText('dataset1').first()).toBeVisible({ timeout: 15000 })
    // unlike its fragments, the parent has a description
    await expect(page.locator('#metadata').getByText('Description', { exact: true }).first()).toBeVisible()
    await page.locator('#danger-zone').getByRole('button', { name: /Supprimer le jeu de données/ }).click()
    await expect(page.getByText(/1 fragment/)).toBeVisible()
    await page.getByRole('button', { name: /Détacher d'abord/ }).click()
    await expect.poll(async () => (await ax.get(`/api/v1/datasets/${fragmentId}`)).data.partOf, { timeout: 10000 }).toBeUndefined()
    await expect.poll(async () => ax.get(`/api/v1/datasets/${virtualId}`).then(() => 200, (err: any) => err.status), { timeout: 10000 }).toBe(404)
  })

  test('the application config pickers offer the application\'s own fragment datasets', async ({ page, goToWithAuth }) => {
    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'fragments app' })).data
    const otherApp = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'other app' })).data
    await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'own fragment', partOf: { type: 'application', id: app.id } })
    await sendDataset('datasets/dataset1.csv', ax, {}, { title: 'foreign fragment', partOf: { type: 'application', id: otherApp.id } })

    const listing = page.waitForRequest(req => {
      const url = decodeURIComponent(req.url())
      return url.includes('/api/v1/datasets?') && url.includes(`partOf=false,application:${app.id}`)
    }, { timeout: 20000 })
    // the mock app server sends no CORS header, the config form could not read the schema
    await page.route('**/monapp1/config-schema.json', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } })
    })
    await goToWithAuth(`/data-fair/application/${app.id}/config`, 'test_user1', { org: 'test_org1' })
    const panel = page.locator('.v-expansion-panel-title').first()
    await pastActiveAccountGate(page, panel)
    await panel.click()
    await page.getByRole('combobox', { name: 'Jeu de données', exact: true }).click()
    await listing
    await expect(page.getByRole('option', { name: 'own fragment' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('option', { name: 'foreign fragment' })).toHaveCount(0)
  })
})
