import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import { axiosAuth, clean, anonymousAx, apiUrl } from '../../support/axios.ts'
import { collectNotifs, expectNotif, expectNoNotif } from '../../support/notifications.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// Trigger the cron task once via the test-env endpoint.
const runWorker = async () => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/api-keys-expiration/run`)
}

// Create an API key on test_user1 with a specific expireAt, return its id.
const createApiKey = async (expireAt: string, title = 'k-' + Math.random().toString(36).slice(2, 8)) => {
  const res = await testUser1.put('/api/v1/settings/user/test_user1', {
    apiKeys: [{ title, scopes: ['datasets-read'], expireAt }]
  })
  const apiKey = res.data.apiKeys.find((k: any) => k.title === title)
  assert.ok(apiKey?.id, 'created key has id')
  return { id: apiKey.id, title, expireAt }
}

test.describe('API key expiration notifications', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('emits :expiring when expireAt is today + 3 days', async () => {
    const notifs = await collectNotifs()
    const expireAt = dayjs().add(3, 'day').format('YYYY-MM-DD')
    const apiKey = await createApiKey(expireAt)

    await runWorker()
    const captured = await notifs.waitFor(1, { keyPrefix: `data-fair:api-key-expiration:${apiKey.id}` })

    const notif = expectNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expiring`)
    expectNoNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expired`)
    // sender must mirror the settings doc owner, otherwise no subscription matches
    assert.deepEqual(notif.sender, { type: 'user', id: 'test_user1' })
  })

  test('does not re-emit :expiring on a second run', async () => {
    const notifs = await collectNotifs()
    const expireAt = dayjs().add(3, 'day').format('YYYY-MM-DD')
    const apiKey = await createApiKey(expireAt)

    await runWorker()
    await notifs.waitFor(1, { keyPrefix: `data-fair:api-key-expiration:${apiKey.id}` })

    await runWorker()
    const captured = await notifs.drain(500)
    const matches = captured.filter(n => n.topic?.key === `data-fair:api-key-expiration:${apiKey.id}:expiring`)
    assert.equal(matches.length, 1, `expected exactly 1 :expiring notif across both runs, got ${matches.length}`)
  })

  test('emits only :expiring on the day of expireAt (key still valid)', async () => {
    const notifs = await collectNotifs()
    const today = dayjs().format('YYYY-MM-DD')
    const apiKey = await createApiKey(today)

    await runWorker()
    const captured = await notifs.waitFor(1, { keyPrefix: `data-fair:api-key-expiration:${apiKey.id}` })

    expectNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expiring`)
    expectNoNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expired`)
  })

  test('emits :expired when expireAt was in the past, also catches up :expiring', async () => {
    const notifs = await collectNotifs()
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
    const apiKey = await createApiKey(yesterday)

    await runWorker()
    const captured = await notifs.waitFor(2, { keyPrefix: `data-fair:api-key-expiration:${apiKey.id}` })

    expectNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expiring`)
    expectNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expired`)
  })

  test('does not emit anything for keys expiring more than 3 days from now', async () => {
    const notifs = await collectNotifs()
    const farFuture = dayjs().add(10, 'day').format('YYYY-MM-DD')
    const apiKey = await createApiKey(farFuture)

    await runWorker()
    const captured = await notifs.drain(500)
    expectNoNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expiring`)
    expectNoNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expired`)
  })

  test('does not emit anything for keys without expireAt', async () => {
    const notifs = await collectNotifs()
    const res = await testUser1.put('/api/v1/settings/user/test_user1', {
      apiKeys: [{ title: 'no-expire', scopes: ['datasets-read'] }]
    })
    const apiKey = res.data.apiKeys.find((k: any) => k.title === 'no-expire')
    assert.ok(apiKey?.id)

    await runWorker()
    const captured = await notifs.drain(500)
    expectNoNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expiring`)
    expectNoNotif(captured, `data-fair:api-key-expiration:${apiKey.id}:expired`)
  })
})
