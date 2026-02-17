import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus } from './utils/index.ts'

describe('markdown contents management', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get dataset description and content as HTML', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Rest dataset markdown',
      description: 'This is a **markdown** description.',
      schema: [{ key: 'prop1', type: 'string', description: 'This is a **markdown** property description.', 'x-display': 'markdown' }]
    })
    assert.equal(res.status, 201)
    const dataset = res.data
    res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { prop1: 'This is a **markdown** content.' })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/' + dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.data.description, 'This is a **markdown** description.')

    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { truncate: 16 } })
    assert.equal(res.data.description, 'This is a **mark...')
    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { html: true, truncate: 16 } })
    assert.equal(res.data.description, '<p>This is a <strong>markdo...</strong></p>')

    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { html: true } })
    assert.equal(res.data.description, '<p>This is a <strong>markdown</strong> description.</p>')
    assert.equal(res.data.schema[0].description, '<p>This is a <strong>markdown</strong> property description.</p>')

    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { html: 'vuetify' } })
    assert.equal(res.data.description, '<p class="markdown-paragraph">This is a <strong>markdown</strong> description.</p>')
    assert.equal(res.data.schema[0].description, '<p class="markdown-paragraph">This is a <strong>markdown</strong> property description.</p>')

    res = await ax.get('/api/v1/datasets', { params: { html: true } })
    assert.equal(res.data.results[0].description, '<p>This is a <strong>markdown</strong> description.</p>')
    assert.equal(res.data.results[0].schema[0].description, '<p>This is a <strong>markdown</strong> property description.</p>')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { html: true } })
    assert.equal(res.data.results[0].prop1, '<p>This is a <strong>markdown</strong> content.</p>')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { html: true, truncate: 16 } })
    assert.equal(res.data.results[0].prop1, '<p>This is a <strong>markdo...</strong></p>')
  })

  it('Dataset description can also contain HTML tags', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Rest dataset markdown',
      description: 'This is a <span color="blue">html</span><span color="red"> description</span><script>alert("ALERT")</script>.'
    })
    assert.equal(res.status, 201)
    const dataset = res.data
    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { html: true } })
    assert.equal(res.data.description, '<p>This is a <span>html</span><span> description</span>.</p>')
  })
})
