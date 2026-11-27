/**
 * `agent_text=true` on the data query routes (lines, values_agg, metric_agg): the JSON answer also
 * carries `agentText`, the text the page tools' formatters render, with the "Filter query:" line
 * and absolute links to the filtered table (and map) of the dataset's page for the calling host.
 * The MCP tools read it through `response.text`, so an assistant gets the same text, and the same
 * links, as the page tools.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config } from '../../support/axios.ts'
import { sendDataset, clearPublicationSitesCache, doAndWaitForFinalize } from '../../support/workers.ts'

const testUser1Org = await axiosAuth('test_datafair_user1@test.com', 'test_datafair_org1')

const portalUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT2}`

test.describe('agent text of the data queries', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('lines: filter query, table and map links, no internal columns', async () => {
    const ax = testUser1Org
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'koumoul', select: 'id,nb', agent_text: 'true' } })
    const text: string = res.data.agentText
    assert.equal(typeof text, 'string')
    assert.equal(res.data.results.length, 1, 'the rows stay in the JSON answer')
    const filterLine = text.split('\n').find(l => l.startsWith('Filter query: '))
    assert.ok(filterLine, text)
    assert.ok(filterLine.includes('_c_q=koumoul'), filterLine)
    assert.ok(filterLine.includes('cols=id%2Cnb'), filterLine)
    const filterQuery = filterLine.slice('Filter query: '.length)
    assert.ok(text.includes(`${config.publicUrl}/dataset/${dataset.id}/table?${filterQuery}`), text)
    // no map: the dataset is not geolocalized
    assert.ok(!text.includes('/map'), text)
    assert.ok(!/\b_i\b|_rand/.test(text), text)
    assert.ok(!text.includes('Hint:'), text)
  })

  test('lines of a geolocalized dataset: the map link too', async () => {
    const ax = testUser1Org
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const schema = dataset.schema.map((p: any) => p.key === 'loc' ? { ...p, 'x-refersTo': 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long' } : p)
    await doAndWaitForFinalize(ax, dataset.id, () => ax.patch(`/api/v1/datasets/${dataset.id}`, { schema }))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { bool_eq: 'true', agent_text: 'true' } })
    const text: string = res.data.agentText
    assert.ok(text.includes(`${config.publicUrl}/dataset/${dataset.id}/map?bool_eq=true`), text)
  })

  test('lines without agent_text: unchanged', async () => {
    const ax = testUser1Org
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'koumoul' } })
    assert.ok(!('agentText' in res.data))
    const agg = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg`, { params: { field: 'id' } })
    assert.ok(!('agentText' in agg.data))
    const metric = await ax.get(`/api/v1/datasets/${dataset.id}/metric_agg`, { params: { field: 'nb', metric: 'avg' } })
    assert.ok(!('agentText' in metric.data))
  })

  test('values_agg: nested groups of a 2-column grouping', async () => {
    const ax = testUser1Org
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg`, { params: { field: 'bool,id', agent_text: 'true' } })
    const text: string = res.data.agentText
    assert.ok(text.includes('- **true**: 1 rows'), text)
    assert.ok(text.includes('\n  - **bidule**: 1 rows'), text)
    assert.ok(Array.isArray(res.data.aggs))
  })

  test('metric_agg: names the metric and the column, filter query line', async () => {
    const ax = testUser1Org
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/metric_agg`, { params: { field: 'nb', metric: 'avg', bool_eq: 'true', agent_text: 'true' } })
    const text: string = res.data.agentText
    assert.ok(text.includes('**avg** of `nb`'), text)
    assert.ok(text.includes('Result: **22.2**'), text)
    assert.ok(text.includes('Filter query: bool_eq=true'), text)
    assert.ok(text.includes(`${config.publicUrl}/dataset/${dataset.id}/table?bool_eq=true`), text)
  })

  test('lines on a portal host: the table link is on the portal', async () => {
    const ax = testUser1Org
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const portal = { type: 'data-fair-portals', id: 'portal1', url: portalUrl, datasetUrlTemplate: portalUrl + '/datasets/{slug}' }
    await ax.post('/api/v1/settings/organization/test_datafair_org1/publication-sites', portal)
    await clearPublicationSitesCache()
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })
    const res = await ax.get(`${portalUrl}/data-fair/api/v1/datasets/${dataset.id}/lines`, { params: { bool_eq: 'true', agent_text: 'true' } })
    const text: string = res.data.agentText
    assert.ok(text.includes(`${portalUrl}/datasets/${dataset.slug}/table?bool_eq=true`), text)
    assert.ok(!text.includes(`${config.publicUrl}/dataset/`), text)
  })
})
