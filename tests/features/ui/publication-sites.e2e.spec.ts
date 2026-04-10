import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, mockAppUrl } from '../../support/axios.ts'
import type { AxiosInstance } from 'axios'

const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`

async function createPublicationSite (ax: AxiosInstance, opts?: {
  id?: string
  staging?: boolean
  requiredMetadata?: string[]
  datasetUrlTemplate?: string
  applicationUrlTemplate?: string
}) {
  await ax.post('/api/v1/settings/organization/test_org1/publication-sites', {
    type: 'data-fair-portals',
    id: opts?.id ?? 'portal1',
    url: 'http://portal.com',
    title: 'Test Portal',
    datasetUrlTemplate: opts?.datasetUrlTemplate ?? 'http://portal.com/datasets/{id}',
    applicationUrlTemplate: opts?.applicationUrlTemplate ?? 'http://portal.com/apps/{id}',
    settings: {
      staging: opts?.staging ?? false,
      datasetsRequiredMetadata: opts?.requiredMetadata ?? []
    }
  })
}

async function goToPublicationSitesTab (
  page: any,
  goToWithAuth: any,
  resourceType: 'dataset' | 'application',
  resourceId: string,
  user = 'test_user1',
  orgLabel = 'Test Org 1'
) {
  await goToWithAuth('/data-fair/', user)
  await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
  await page.getByRole('listitem').filter({ hasText: orgLabel }).click()
  await page.waitForURL(`${baseUrl}/data-fair/`, { timeout: 10000 })
  await page.goto(`${baseUrl}/data-fair/${resourceType}/${resourceId}`)
  await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
  await page.locator('#share').scrollIntoViewIfNeeded()
  await page.getByRole('tab', { name: /Portails/i }).click()
}

test.describe('dataset publication sites', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('empty state when no publication sites configured', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data

    await goToPublicationSitesTab(page, goToWithAuth, 'dataset', dataset.id)
    await expect(page.getByText("Vous n'avez pas configuré de portail")).toBeVisible({ timeout: 10000 })
  })

  test('shows configured publication sites', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await createPublicationSite(ax)
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data

    await goToPublicationSitesTab(page, goToWithAuth, 'dataset', dataset.id)
    await expect(page.getByText('Publiez ce jeu de données')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: 'Test Portal' })).toBeVisible()
    await expect(page.getByLabel('publié')).toBeVisible()
  })

  test('admin publishes a dataset', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await createPublicationSite(ax)
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data
    // clear default permissions that may trigger contrib permissions risk warning
    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [])

    await goToPublicationSitesTab(page, goToWithAuth, 'dataset', dataset.id)
    await expect(page.getByLabel('publié')).toBeVisible({ timeout: 10000 })
    await page.getByLabel('publié').click()

    await expect.poll(async () => {
      const ds = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
      return ds.publicationSites?.includes('data-fair-portals:portal1')
    }, { timeout: 5000 }).toBeTruthy()
  })

  test('shows published URL when dataset is published', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await createPublicationSite(ax, { datasetUrlTemplate: 'http://portal.com/datasets/{id}' })
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    await goToPublicationSitesTab(page, goToWithAuth, 'dataset', dataset.id)
    await expect(page.getByRole('link', { name: new RegExp(`http://portal.com/datasets/${dataset.id}`) })).toBeVisible({ timeout: 10000 })
  })

  test('metadata warnings disable publish', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await createPublicationSite(ax, { requiredMetadata: ['license', 'description'] })
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data

    await goToPublicationSitesTab(page, goToWithAuth, 'dataset', dataset.id)
    await expect(page.getByText(/Métadonnées manquantes.*licence.*description/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByLabel('Publié')).toBeDisabled()
  })

  test('contrib can request publication', async ({ page, goToWithAuth }) => {
    const axAdmin = await axiosAuth('test_user1@test.com', 'test_org1')
    const axContrib = await axiosAuth('test_user5@test.com', 'test_org1')
    await createPublicationSite(axAdmin)
    const dataset = (await axContrib.post('/api/v1/datasets', { isRest: true, title: 'contrib dataset', schema: [] })).data

    await goToPublicationSitesTab(page, goToWithAuth, 'dataset', dataset.id, 'test_user5')
    await expect(page.getByLabel('publié')).toBeDisabled({ timeout: 10000 })
    await expect(page.getByLabel('publication demandée par un contributeur')).toBeVisible()
    await expect(page.getByLabel('publication demandée par un contributeur')).toBeEnabled()
    await page.getByLabel('publication demandée par un contributeur').click()

    await expect.poll(async () => {
      const ds = (await axContrib.get(`/api/v1/datasets/${dataset.id}`)).data
      return ds.requestedPublicationSites?.includes('data-fair-portals:portal1')
    }, { timeout: 5000 }).toBeTruthy()
  })

  test('contrib can publish on staging site', async ({ page, goToWithAuth }) => {
    const axAdmin = await axiosAuth('test_user1@test.com', 'test_org1')
    const axContrib = await axiosAuth('test_user5@test.com', 'test_org1')
    await createPublicationSite(axAdmin, { id: 'staging1', staging: true })
    const dataset = (await axContrib.post('/api/v1/datasets', { isRest: true, title: 'staging dataset', schema: [] })).data

    await goToPublicationSitesTab(page, goToWithAuth, 'dataset', dataset.id, 'test_user5')
    await expect(page.getByLabel('publié')).toBeEnabled({ timeout: 10000 })
    await expect(page.getByLabel('publication demandée par un contributeur')).not.toBeVisible()
    await page.getByLabel('publié').click()

    await expect.poll(async () => {
      const ds = (await axContrib.get(`/api/v1/datasets/${dataset.id}`)).data
      return ds.publicationSites?.includes('data-fair-portals:staging1')
    }, { timeout: 5000 }).toBeTruthy()
  })
})

test.describe('application publication sites', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('empty state when no publication sites configured', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'test app' })).data

    await goToPublicationSitesTab(page, goToWithAuth, 'application', app.id)
    await expect(page.getByText("Vous n'avez pas configuré de portail sur lequel publier cette application")).toBeVisible({ timeout: 10000 })
  })

  test('admin publishes an application', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await createPublicationSite(ax)
    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'test app' })).data

    await goToPublicationSitesTab(page, goToWithAuth, 'application', app.id)
    await expect(page.getByText('Publiez cette application')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: 'Test Portal' })).toBeVisible()
    await expect(page.getByLabel('publié')).toBeVisible()
    await page.getByLabel('publié').click()

    await expect.poll(async () => {
      const a = (await ax.get(`/api/v1/applications/${app.id}`)).data
      return a.publicationSites?.includes('data-fair-portals:portal1')
    }, { timeout: 5000 }).toBeTruthy()

    await expect(page.getByLabel('privilégier un rendu large')).toBeVisible()
  })
})
