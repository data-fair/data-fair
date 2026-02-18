import testEvents from '@data-fair/data-fair-api/src/misc/utils/test-events.ts'
import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset, anonymous, superadmin, dmeadusOrg, ngernier4Org } from './utils/index.ts'

describe('user-notifications about dataset', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('send user notification', async function () {
    const ax = dmeadusOrg
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'user notif 1',
      schema: [{ key: 'str', type: 'string' }]
    })).data

    // listen to all notifications
    const notifications = []
    testEvents.on('notification', (n) => notifications.push(n))

    await assert.rejects(ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { title: 'Title' }), (err: any) => err.status === 400)

    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [])

    await ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].title, 'Title')
    assert.ok(notifications[0].topic.key.endsWith(':topic1'))
    assert.equal(notifications[0].visibility, 'private')

    await assert.rejects(ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' }), (err: any) => err.status === 403)
    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [
      { type: 'user', id: 'ngernier4', operations: ['sendUserNotification'] }
    ])
    await ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    await assert.rejects(ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title', visibility: 'public' }), (err: any) => err.status === 403)

    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [
      { type: 'user', id: 'ngernier4', operations: ['sendUserNotification', 'sendUserNotificationPublic'] }
    ])
    await ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    await ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title', visibility: 'public' })
  })
})
