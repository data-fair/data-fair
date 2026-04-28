import { test, expect } from '@playwright/test'
import { axiosAuth, clean } from '../../support/axios.ts'
import { clearPublicationSitesCache, waitForFinalize } from '../../support/workers.ts'

const DEV_HOST = process.env.DEV_HOST!
const NGINX_PORT1 = process.env.NGINX_PORT1!
const NGINX_PORT2 = process.env.NGINX_PORT2!
const baseUrl1 = `http://${DEV_HOST}:${NGINX_PORT1}`
const baseUrl2 = `http://${DEV_HOST}:${NGINX_PORT2}`

test.describe('new-dataset wizard — virtual dataset from master-data on a secondary-domain back-office', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('initializes virtual dataset schema from a master-data child of the main domain', async ({ page, context }) => {
    // 1) main-domain master-data dataset, owned by another org (test_org3) but
    //    explicitly shared with test_org1 so the corresponding remote-service is
    //    surfaced by /api/v1/remote-services?privateAccess=organization:test_org1.
    //    This mirrors the production scenario: a master-data published as a
    //    cross-domain reference for another organization.
    const axOtherOrg = await axiosAuth('test_user2@test.com', 'test_org3')
    await axOtherOrg.put('/api/v1/datasets/master-products', {
      isRest: true,
      title: 'Master products',
      schema: [
        { key: 'product_code', type: 'string' },
        { key: 'product_label', type: 'string' }
      ],
      masterData: {
        virtualDatasets: { active: true },
        shareOrgs: [{ id: 'test_org1', name: 'Test Org 1' }]
      }
    })
    // grant public read+list so test_org1 can find it via the bulk listing
    // used by the new-dataset wizard's "fill schema from children" flow
    await axOtherOrg.put('/api/v1/datasets/master-products/permissions', [{ classes: ['read', 'list'] }])
    // populate the master-data with at least one row so it gets finalized
    // (queryable=true filters on finalizedAt, used by dataset-select.vue)
    await axOtherOrg.post('/api/v1/datasets/master-products/_bulk_lines', [
      { product_code: 'P001', product_label: 'Product 1' }
    ])
    await waitForFinalize(axOtherOrg, 'master-products')

    // 2) test_org1 registers a publication site bound to NGINX_PORT2
    const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
    await axOrg.post('/api/v1/settings/organization/test_org1/publication-sites', {
      type: 'data-fair-portals',
      id: 'portal1',
      url: baseUrl2
    })
    await clearPublicationSitesCache()

    // 3) cookies (i18n + cache bypass) — set per-port; session cookies will be
    //    issued during login below
    await context.addCookies([
      { name: 'i18n_lang', value: 'fr', url: baseUrl1 },
      { name: 'cache_bypass', value: '1', url: baseUrl1 },
      { name: 'i18n_lang', value: 'fr', url: baseUrl2 },
      { name: 'cache_bypass', value: '1', url: baseUrl2 }
    ])

    // 4) login through simple-directory on the main domain. The session
    //    cookie is host-scoped (not port-scoped) so it also applies on
    //    NGINX_PORT2.
    const mainTarget = `${baseUrl1}/data-fair/`
    const loginUrl = `${baseUrl1}/simple-directory/login?redirect=${encodeURIComponent(mainTarget)}`
    await page.goto(loginUrl)
    await page.getByLabel('Adresse mail').fill('test_user1@test.com')
    await page.getByLabel('Mot de passe').fill('passwd')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.waitForURL(/\/data-fair\/(\?|$|#)/, { timeout: 10000 })

    // 5) switch from personal account to test_org1 context (org context is
    //    stored in the session cookie too, so it carries over to NGINX_PORT2)
    await page.getByRole('button', { name: /Ouvrez le menu personnel/ }).click()
    await page.getByRole('listitem').filter({ hasText: 'Test Org 1' }).click()
    await page.waitForURL(/\/data-fair\/(\?|$|#)/, { timeout: 10000 })

    // 6) navigate to the new-dataset wizard on the secondary domain
    await page.goto(`${baseUrl2}/data-fair/new-dataset`)

    const virtualCard = page.locator('.v-card-title', { hasText: 'Virtuel' })
    await expect(virtualCard).toBeVisible({ timeout: 10000 })
    await virtualCard.click()

    const titleInput = page.getByLabel(/Titre du jeu de données/)
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await titleInput.fill('Virtual master-data secondary E2E')

    // pick the master-data child via the dataset-select autocomplete
    const childrenInput = page.getByRole('combobox', { name: 'Jeux enfants' })
    await childrenInput.click()
    await childrenInput.pressSequentially('Master', { delay: 50 })

    const dropdown = page.locator('.v-overlay__content .v-list')
    await expect(dropdown.getByText('Données de référence')).toBeVisible({ timeout: 10000 })
    await dropdown.locator('.v-list-item', { hasText: 'Master products' }).click()
    await expect(page.locator('.v-chip', { hasText: 'Master products' })).toBeVisible({ timeout: 5000 })
    // close the dropdown so the subheader doesn't intercept clicks on the next checkbox
    await page.keyboard.press('Escape')

    // enable "fill schema from children" — this is the path the PR fix changed
    await page.getByLabel(/Initialiser le schéma avec toutes les colonnes des jeux enfants/).check()

    await page.getByRole('button', { name: /Continuer/ }).click()
    const createBtn = page.getByRole('button', { name: /Créer le jeu de données/ })
    await expect(createBtn).toBeVisible({ timeout: 5000 })
    await expect(createBtn).toBeEnabled({ timeout: 5000 })
    await createBtn.click()

    // 7) redirect to the new dataset page
    await expect(page).toHaveURL(/\/dataset\/[^/]+/, { timeout: 30000 })
    const match = page.url().match(/\/dataset\/([^/?#]+)/)
    expect(match).not.toBeNull()
    const datasetId = match![1]

    // 8) regression check: the new virtual dataset's schema must contain the
    //    master-data columns. Pre-fix, the wizard fetched each child via
    //    GET /api/v1/datasets/:id which 404'd through getByUniqueRef on a
    //    secondary-domain back-office, so this assertion fails on master.
    const created = (await axOrg.get(`/api/v1/datasets/${datasetId}`)).data
    expect(created.isVirtual).toBe(true)
    expect(created.virtual.children).toContain('master-products')
    const schemaKeys = (created.schema || []).map((p: any) => p.key)
    expect(schemaKeys).toContain('product_code')
    expect(schemaKeys).toContain('product_label')
  })
})
