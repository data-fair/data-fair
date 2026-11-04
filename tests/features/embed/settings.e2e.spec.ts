import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

test.describe('embed settings pages', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays api-keys settings page', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/embed/settings/user/test_user1/api-keys', 'test_user1')
    await expect(page.getByRole('button', { name: 'Ajouter une clé d\'API' })).toBeVisible({ timeout: 10000 })
  })

  test('the api key form grows the page, an iframe sized on its content shows it', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/embed/settings/user/test_user1/api-keys', 'test_user1')
    await page.getByRole('button', { name: 'Ajouter une clé d\'API' }).click()
    const addButton = page.getByRole('button', { name: 'Ajouter', exact: true })
    await expect(addButton).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const frameHeight = await page.locator('[data-iframe-height]').evaluate(el => el.getBoundingClientRect().bottom)
    const buttonBottom = await addButton.evaluate(el => el.getBoundingClientRect().bottom)
    expect(buttonBottom).toBeLessThanOrEqual(frameHeight)
  })

  test('a refused api key is rolled back, the form keeps it to retry', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await goToWithAuth('/data-fair/embed/settings/user/test_user1/api-keys', 'test_user1')
    await page.getByRole('button', { name: 'Ajouter une clé d\'API' }).click()
    await page.getByLabel('Titre', { exact: true }).fill('Refused key')

    await page.route('**/api/v1/settings/**', route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, body: 'refused' })
      : route.fallback())
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(page.getByText('refused')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('row').filter({ hasText: 'Refused key' })).not.toBeVisible()
    await expect(page.getByLabel('Titre', { exact: true })).toHaveValue('Refused key')

    await page.unroute('**/api/v1/settings/**')
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: 'Refused key' })).toBeVisible({ timeout: 5000 })
    expect((await ax.get('/api/v1/settings/user/test_user1')).data.apiKeys.map((k: any) => k.title)).toEqual(['Refused key'])
  })

  test('a webhook is saved on explicit save, not while incomplete', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const patches: string[] = []
    page.on('request', request => { if (request.method() === 'PATCH') patches.push(request.url()) })

    await goToWithAuth('/data-fair/embed/settings/user/test_user1/webhooks', 'test_user1')
    await page.getByRole('button', { name: /Ajouter un webhook/i }).click()
    const titleInput = page.getByLabel('Titre', { exact: true })
    await titleInput.fill('Embed hook')
    await titleInput.blur()
    const urlInput = page.getByLabel('URL du serveur HTTP cible')
    await urlInput.fill('https://example.com/hook')
    await urlInput.blur()
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled({ timeout: 5000 })

    await page.locator('.v-select').filter({ hasText: 'Événements déclencheurs' }).click()
    await page.getByRole('option', { name: 'Un nouveau jeu de données a été créé' }).click()
    await page.keyboard.press('Escape')
    expect(patches).toEqual([])
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.poll(async () => (await ax.get('/api/v1/settings/user/test_user1')).data.webhooks?.length ?? 0, { timeout: 5000 }).toBe(1)
  })

  test('displays settings with pre-seeded topics', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await ax.put('/api/v1/settings/user/test_user1', {
      topics: [{ id: 'topic1', title: 'Mon thème test' }]
    })

    await goToWithAuth('/data-fair/embed/settings/user/test_user1/topics', 'test_user1')
    await expect(page.getByLabel('Titre').first()).toHaveValue('Mon thème test', { timeout: 10000 })
  })

  test('displays licenses settings page', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    await ax.put('/api/v1/settings/user/test_user1', {
      licenses: [{ title: 'Licence Ouverte', href: 'https://example.com' }]
    })

    await goToWithAuth('/data-fair/embed/settings/user/test_user1/licenses', 'test_user1')
    await expect(page.getByText('Licence Ouverte')).toBeVisible({ timeout: 10000 })
  })
})
