import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { load, toolsForScopes } from '@data-fair/openapi-mcp'
import { anonymousAx, axiosAuth, baseURL } from '../../support/axios.ts'
import { nhiSession } from '../../support/nhi.ts'

const withoutFetchedAt = (doc: any) => ({
  ...doc,
  'x-platform': { services: doc['x-platform'].services.map(({ fetchedAt, ...service }: any) => service) }
})

test.describe('GET /api/v1/platform/api-docs.json', () => {
  test('serves the merged platform document of the site, the same to every caller', async () => {
    const res = await anonymousAx.get('/api/v1/platform/api-docs.json')
    assert.equal(res.status, 200)
    assert.match(String(res.headers['cache-control']), /public, max-age=300/)
    const doc = res.data
    assert.equal(doc.servers[0].url, new URL(baseURL).origin)
    const paths = Object.keys(doc.paths)
    assert.ok(paths.some(p => p.startsWith('/simple-directory/api/')), 'simple-directory paths')
    assert.ok(paths.some(p => p.startsWith('/data-fair/api/v1/datasets')), 'data-fair paths')
    assert.ok(doc['x-platform'].services.some((s: any) => s.id === 'sd' && s.status === 'ok'), JSON.stringify(doc['x-platform']))

    const user = await axiosAuth('test_user1@test.com')
    const userDoc = (await user.get('/api/v1/platform/api-docs.json')).data
    assert.deepEqual(withoutFetchedAt(userDoc), withoutFetchedAt(doc))

    const { bearerAx } = await nhiSession('datasets:read')
    const scopedDoc = (await bearerAx.get('/api/v1/platform/api-docs.json')).data
    assert.deepEqual(withoutFetchedAt(scopedDoc), withoutFetchedAt(doc))
  })

  // the contract between this route and its consumer: whatever the services publish, the merged
  // document configures an MCP server, and its tools are offered by scope
  test('loads in openapi-mcp with lint error, tools filtered by scope', async () => {
    const doc = (await anonymousAx.get('/api/v1/platform/api-docs.json')).data
    const warn = console.warn
    console.warn = () => {} // refs simple-directory's schemas make to $ids the document does not embed
    let toolSet
    try {
      toolSet = await load(doc, { lint: 'error' })
    } finally {
      console.warn = warn
    }
    const names = (scopes?: string[]) => (scopes ? toolsForScopes(toolSet, scopes) : toolSet).tools.map(tool => tool.name)
    assert.ok(names().filter(name => name.startsWith('datafair_')).length > 10, names().join(', '))
    assert.ok(names(['datasets:read']).length > 0)
    assert.ok(names(['datasets:write']).includes('datafair_update_dataset'))
    assert.ok(!names(['datasets:write']).includes('datafair_publish_dataset'))
    assert.ok(names(['datasets:admin']).includes('datafair_update_dataset'))
    assert.ok(names(['datasets:admin']).includes('datafair_publish_dataset'))
    assert.deepEqual(names([]), [])
  })
})
