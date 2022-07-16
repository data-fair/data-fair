const assert = require('assert').strict

const workers = require('../server/workers')

describe('markdown contents management', () => {
  it('Get dataset description and content as HTML', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Rest dataset markdown',
      description: 'This is a **markdown** description.',
      schema: [{ key: 'prop1', type: 'string', description: 'This is a **markdown** property description.', 'x-display': 'markdown' }]
    })
    assert.equal(res.status, 201)
    const dataset = res.data
    await workers.hook('finalizer/' + dataset.id)
    res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { prop1: 'This is a **markdown** content.' })
    await workers.hook('finalizer/' + dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.data.description, 'This is a **markdown** description.')

    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { truncate: 16 } })
    assert.equal(res.data.description, 'This is a **mark...')
    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { html: true, truncate: 16 } })
    assert.equal(res.data.description, '<p>This is a <strong>markdo...</strong></p>')

    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { html: true } })
    assert.equal(res.data.description, '<p>This is a <strong>markdown</strong> description.</p>')
    assert.equal(res.data.schema[0].description, '<p>This is a <strong>markdown</strong> property description.</p>')

    res = await ax.get('/api/v1/datasets', { params: { html: true } })
    assert.equal(res.data.results[0].description, '<p>This is a <strong>markdown</strong> description.</p>')
    assert.equal(res.data.results[0].schema[0].description, '<p>This is a <strong>markdown</strong> property description.</p>')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { html: true } })
    assert.equal(res.data.results[0].prop1, '<p>This is a <strong>markdown</strong> content.</p>')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { html: true, truncate: 16 } })
    assert.equal(res.data.results[0].prop1, '<p>This is a <strong>markdo...</strong></p>')
  })

  it('Get application description as HTML', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', {
      title: 'app markdown',
      description: 'This is a **markdown** description.',
      url: 'http://monapp1.com/'
    })
    assert.equal(res.status, 201)
    const app = res.data

    res = await ax.get(`/api/v1/applications/${app.id}`)
    assert.equal(res.data.description, 'This is a **markdown** description.')
    res = await ax.get(`/api/v1/applications/${app.id}`, { params: { html: true } })
    assert.equal(res.data.description, '<p>This is a <strong>markdown</strong> description.</p>')
    res = await ax.get('/api/v1/applications', { params: { html: true } })
    assert.equal(res.data.results[0].description, '<p>This is a <strong>markdown</strong> description.</p>')
  })
})
