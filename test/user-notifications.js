const assert = require('assert').strict

const workers = require('../server/workers')

describe('user-notifications about dataset', () => {
  it('send user notification', async () => {
    const ax = global.ax.dmeadus
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'user notif 1',
      schema: [{ key: 'str', type: 'string' }]
    })).data
    await workers.hook('finalizer/' + dataset.id)

    // listen to all notifications
    const notifications = []
    global.events.on('notification', (n) => notifications.push(n))

    await assert.rejects(ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { title: 'Title' }), (err) => err.status === 400)

    await ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].title, 'Title')
    assert.ok(notifications[0].topic.key.endsWith(':topic1'))
    assert.equal(notifications[0].visibility, 'private')
  })
})
