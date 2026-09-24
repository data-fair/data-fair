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
    await expect(page.locator('#metadata').getByLabel('Titre')).toBeVisible()
    // shared, published and catalogued through its parent only
    await expect(page.locator('#share')).toHaveCount(0)
    await expect(page.locator('#fragments')).toHaveCount(0)
    await expect(page.locator('#metadata').getByRole('tab', { name: /Pièces jointes/ })).toHaveCount(0)
    await expect(page.locator('#metadata').getByLabel('Licence')).toHaveCount(0)
    await expect(page.locator('#danger-zone').getByText(/Détacher/).first()).toBeVisible()
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
