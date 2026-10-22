import { test } from '../../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('markdown contents management', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  // Wiring smoke test: proves the endpoint renders markdown to HTML for the
  // dataset description, a schema field description, and a line's content
  // (a distinct rendering path in datasets/es/commons.ts). The rendering /
  // sanitization / truncation matrix of prepareMarkdownContent itself is
  // unit-tested in markdown.unit.spec.ts.
  test('Get dataset description and content as HTML', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Rest dataset markdown',
      description: 'This is a **markdown** description.',
      schema: [{ key: 'prop1', type: 'string', description: 'This is a **markdown** property description.', 'x-display': 'markdown' }]
    })
    assert.equal(res.status, 201)
    const dataset = res.data
    res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { prop1: 'This is a **markdown** content.' })
    await waitForFinalize(ax, dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { html: true } })
    assert.equal(res.data.description, '<p>This is a <strong>markdown</strong> description.</p>')
    assert.equal(res.data.schema[0].description, '<p>This is a <strong>markdown</strong> property description.</p>')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { html: true } })
    assert.equal(res.data.results[0].prop1, '<p>This is a <strong>markdown</strong> content.</p>')
  })

  // applications go through their own call site, on the single resource and on the listing
  test('Get application description as HTML', async () => {
    const ax = testUser1
    const app = (await ax.post('/api/v1/applications', {
      title: 'app markdown',
      description: 'This is a **markdown** description.',
      url: mockAppUrl('monapp1')
    })).data

    let res = await ax.get(`/api/v1/applications/${app.id}`, { params: { html: true } })
    assert.equal(res.data.description, '<p>This is a <strong>markdown</strong> description.</p>')
    res = await ax.get('/api/v1/applications', { params: { html: true } })
    assert.equal(res.data.results[0].description, '<p>This is a <strong>markdown</strong> description.</p>')
  })
})
