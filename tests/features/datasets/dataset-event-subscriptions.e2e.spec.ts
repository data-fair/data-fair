import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

const frameParams = async (page: Page, path: string) => {
  const frame = page.locator(`d-frame[src*="/events/embed/${path}?"]`)
  await expect(frame).toHaveCount(1)
  const url = new URL((await frame.getAttribute('src'))!)
  return { keys: url.searchParams.get('key')!.split(','), titles: url.searchParams.get('title')!.split(',') }
}

test.describe('dataset event subscriptions', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('webhooks and notifications tabs offer every dataset topic with its label', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'Webhooks check', schema: [{ key: 'a', type: 'string' }] })).data

    await goToWithAuth(`/data-fair/dataset/${dataset.id}`, 'test_user1')
    await page.getByRole('tab', { name: 'Webhooks' }).click({ timeout: 15000 })
    const webhooks = await frameParams(page, 'subscribe-webhooks')
    expect(webhooks.keys).toEqual([
      `data-fair:dataset-data-updated:${dataset.id}`,
      `data-fair:dataset-structure-updated:${dataset.id}`,
      `data-fair:dataset-error:${dataset.id}`,
      `data-fair:dataset-breaking-change:${dataset.id}`
    ])
    expect(webhooks.titles).toHaveLength(webhooks.keys.length)
    expect(webhooks.titles[0]).toBe('Les données du jeu de données ont été mises à jour')
    expect(webhooks.titles).not.toContain('Webhooks check')

    // REST line operations signal data-updated to webhooks only
    await page.getByRole('tab', { name: 'Notifications' }).click()
    const notifications = await frameParams(page, 'subscribe')
    expect(notifications.keys).toEqual(webhooks.keys.slice(1))
  })
})
