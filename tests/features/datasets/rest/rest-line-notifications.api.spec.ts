import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize } from '../../../support/workers.ts'
import { TestEventClient } from '../../../support/events.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('datasets - REST line notifications', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('emits data-updated notif on DELETE /lines/:lineId', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'delete-line notif',
      schema: [{ key: 'str', type: 'string' }]
    })).data

    // seed one line so we can delete it
    const line = (await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { str: 'hello' })).data
    await waitForFinalize(ax, dataset.id)

    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))
      await new Promise(resolve => setTimeout(resolve, 200))

      await ax.delete(`/api/v1/datasets/${dataset.id}/lines/${line._id}`)
      await new Promise(resolve => setTimeout(resolve, 500))

      const notif = notifs.find((n: any) => n.topic.key === `data-fair:dataset-data-updated:${dataset.slug}`)
      assert.ok(notif, `expected dataset-data-updated notif, got: ${JSON.stringify(notifs.map((n: any) => n.topic.key))}`)
      assert.match(notif.body.fr, /1 ligne supprimée/)
      assert.match(notif.body.en, /1 line deleted/)
    } finally {
      events.close()
    }
  })

  test('emits data-updated notif on POST /lines (create)', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'create-line notif',
      schema: [{ key: 'str', type: 'string' }]
    })).data

    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))
      await new Promise(resolve => setTimeout(resolve, 200))

      await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { str: 'hello' })
      await new Promise(resolve => setTimeout(resolve, 500))

      const notif = notifs.find((n: any) => n.topic.key === `data-fair:dataset-data-updated:${dataset.slug}`)
      assert.ok(notif, `expected dataset-data-updated notif, got: ${JSON.stringify(notifs.map((n: any) => n.topic.key))}`)
      assert.match(notif.body.fr, /1 ligne créée/)
    } finally {
      events.close()
    }
  })

  test('emits data-updated notif on PUT /lines/:id (update)', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'update-line notif',
      schema: [{ key: 'str', type: 'string' }]
    })).data
    const line = (await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { str: 'hello' })).data
    await waitForFinalize(ax, dataset.id)

    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))
      await new Promise(resolve => setTimeout(resolve, 200))

      await ax.put(`/api/v1/datasets/${dataset.id}/lines/${line._id}`, { str: 'world' })
      await new Promise(resolve => setTimeout(resolve, 500))

      const notif = notifs.find((n: any) => n.topic.key === `data-fair:dataset-data-updated:${dataset.slug}`)
      assert.ok(notif, `expected dataset-data-updated notif, got: ${JSON.stringify(notifs.map((n: any) => n.topic.key))}`)
      assert.match(notif.body.fr, /1 ligne modifiée/)
    } finally {
      events.close()
    }
  })

  test('emits data-updated notif on PATCH /lines/:id', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'patch-line notif',
      schema: [{ key: 'str', type: 'string' }, { key: 'n', type: 'integer' }]
    })).data
    const line = (await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { str: 'hello', n: 1 })).data
    await waitForFinalize(ax, dataset.id)

    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))
      await new Promise(resolve => setTimeout(resolve, 200))

      await ax.patch(`/api/v1/datasets/${dataset.id}/lines/${line._id}`, { n: 2 })
      await new Promise(resolve => setTimeout(resolve, 500))

      const notif = notifs.find((n: any) => n.topic.key === `data-fair:dataset-data-updated:${dataset.slug}`)
      assert.ok(notif, `expected dataset-data-updated notif, got: ${JSON.stringify(notifs.map((n: any) => n.topic.key))}`)
      assert.match(notif.body.fr, /1 ligne modifiée/)
    } finally {
      events.close()
    }
  })

  test('emits one data-updated notif on POST /_bulk_lines with summary', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'bulk-lines notif',
      schema: [{ key: 'str', type: 'string' }]
    })).data

    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))
      await new Promise(resolve => setTimeout(resolve, 200))

      await doAndWaitForFinalize(ax, dataset.id, () => ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
        { _action: 'create', str: 'a' },
        { _action: 'create', str: 'b' },
        { _action: 'create', str: 'c' }
      ]))
      await new Promise(resolve => setTimeout(resolve, 500))

      const matching = notifs.filter((n: any) => n.topic.key === `data-fair:dataset-data-updated:${dataset.slug}`)
      assert.equal(matching.length, 1, `expected exactly 1 dataset-data-updated notif, got ${matching.length}: ${JSON.stringify(matching.map((n: any) => n.body.fr))}`)
      assert.match(matching[0].body.fr, /3 lignes créées/)
    } finally {
      events.close()
    }
  })

  test('emits data-updated notif on DELETE /lines (all)', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'delete-all notif',
      schema: [{ key: 'str', type: 'string' }]
    })).data
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
      { _action: 'create', str: 'a' },
      { _action: 'create', str: 'b' }
    ])
    await waitForFinalize(ax, dataset.id)

    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))
      await new Promise(resolve => setTimeout(resolve, 200))

      await doAndWaitForFinalize(ax, dataset.id, () => ax.delete(`/api/v1/datasets/${dataset.id}/lines`))
      await new Promise(resolve => setTimeout(resolve, 500))

      const notif = notifs.find((n: any) =>
        n.topic.key === `data-fair:dataset-data-updated:${dataset.slug}` &&
        /toutes les lignes/i.test(n.body.fr)
      )
      assert.ok(notif, `expected delete-all notif with "toutes les lignes", got: ${JSON.stringify(notifs.map((n: any) => n.body.fr))}`)
    } finally {
      events.close()
    }
  })

  test('does not emit notif on PUT /lines/:id when line is unchanged', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'noop-line notif',
      schema: [{ key: 'str', type: 'string' }]
    })).data
    const line = (await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { str: 'hello' })).data
    await waitForFinalize(ax, dataset.id)

    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))
      await new Promise(resolve => setTimeout(resolve, 200))

      // PUT identical body → expect 304, no notif
      await ax.put(`/api/v1/datasets/${dataset.id}/lines/${line._id}`, { str: 'hello' }, {
        validateStatus: (status: number) => status === 304 || (status >= 200 && status < 300)
      })
      await new Promise(resolve => setTimeout(resolve, 500))

      const notif = notifs.find((n: any) => n.topic.key === `data-fair:dataset-data-updated:${dataset.slug}`)
      assert.equal(notif, undefined, `expected NO dataset-data-updated notif for a no-op, got: ${JSON.stringify(notifs.map((n: any) => n.topic.key))}`)
    } finally {
      events.close()
    }
  })
})
