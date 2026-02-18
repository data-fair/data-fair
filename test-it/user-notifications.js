import { strict as assert } from 'node:assert'

describe('user-notifications about dataset', function () {
  it('send user notification', async function () {
    const ax = global.ax.dmeadusOrg
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'user notif 1',
      schema: [{ key: 'str', type: 'string' }]
    })).data

    // listen to all notifications
    const notifications = []
    global.events.on('notification', (n) => notifications.push(n))

    await assert.rejects(ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { title: 'Title' }), (err) => err.status === 400)

    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [])

    await ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].title, 'Title')
    assert.ok(notifications[0].topic.key.endsWith(':topic1'))
    assert.equal(notifications[0].visibility, 'private')

    await assert.rejects(global.ax.ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' }), (err) => err.status === 403)
    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [
      { type: 'user', id: 'ngernier4', operations: ['sendUserNotification'] }
    ])
    await global.ax.ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    await assert.rejects(global.ax.ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title', visibility: 'public' }), (err) => err.status === 403)

    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [
      { type: 'user', id: 'ngernier4', operations: ['sendUserNotification', 'sendUserNotificationPublic'] }
    ])
    await global.ax.ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    await global.ax.ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title', visibility: 'public' })
  })
})
