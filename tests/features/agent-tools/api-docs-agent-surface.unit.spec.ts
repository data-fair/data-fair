/**
 * The agent-facing surface of this API: what `@data-fair/openapi-mcp` generates from the
 * x-agent annotations in the served document. `lint: 'error'` refuses a description that
 * contradicts its schema; the golden turns any change to a tool's name, description or schema
 * into a diff a reviewer sees. Regenerate with UPDATE_GOLDEN=1 when the change is intended.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { load, toolSetSnapshot } from '@data-fair/openapi-mcp'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const goldenPath = path.resolve(import.meta.dirname, '../../fixtures/agent-surface.explore.json')
const PUBLIC_URL = 'https://example.test/data-fair'

const generators = async () => ({
  apiDocs: (await import('../../../api/contract/api-docs.ts')).default,
  datasetAPIDocs: (await import('../../../api/contract/dataset-api-docs.ts')).default
})

const adminSession: any = {
  user: { id: 'admin', name: 'Admin', email: 'admin@test.com', adminMode: 1, isAdmin: 1, organizations: [] },
  account: { type: 'user', id: 'admin', name: 'Admin' },
  accountRole: 'admin'
}

const annotatedOperationIds = (doc: any): string[] => Object.values<any>(doc.paths)
  .flatMap(item => Object.values<any>(item))
  .filter(op => op?.operationId && op['x-agent'])
  .map(op => op.operationId)
  .sort()

test.describe('agent surface of the root document', () => {
  test('explore tools load without a lint error and match the golden', async () => {
    const { apiDocs } = await generators()
    const toolSet = await load(apiDocs(PUBLIC_URL), { profiles: ['explore'], lint: 'error' })
    // Through JSON: the golden is a file, and an `enum: undefined` left by the generator is not.
    const snapshot = JSON.parse(JSON.stringify(toolSetSnapshot(toolSet)))
    assert.deepEqual(toolSet.tools.map(t => t.name), [
      'datafair_list_datasets', 'datafair_describe_dataset', 'datafair_search_data',
      'datafair_get_field_values', 'datafair_aggregate_data', 'datafair_calculate_metric'
    ])
    assert.deepEqual(toolSet.skills.map(s => s.id), ['workflow'])
    if (process.env.UPDATE_GOLDEN) writeFileSync(goldenPath, JSON.stringify(snapshot, null, 2) + '\n')
    assert.deepEqual(snapshot, JSON.parse(readFileSync(goldenPath, 'utf8')))
  })

  test('the annotated surface does not depend on the session', async () => {
    const { apiDocs } = await generators()
    const anonymous = apiDocs(PUBLIC_URL)
    const admin = apiDocs(PUBLIC_URL, adminSession)
    assert.ok(annotatedOperationIds(admin).length > 0)
    assert.deepEqual(annotatedOperationIds(admin), annotatedOperationIds(anonymous))
    const [a, b] = await Promise.all([anonymous, admin].map(doc => load(doc, { profiles: ['explore'], lint: 'error' })))
    assert.deepEqual(toolSetSnapshot(a), toolSetSnapshot(b))
  })

  test('the per-dataset document carries the same annotations, with real column keys', async () => {
    const { datasetAPIDocs } = await generators()
    const dataset: any = {
      id: 'communes',
      slug: 'communes',
      title: 'Communes',
      isRest: true,
      finalizedAt: '2026-01-01T00:00:00.000Z',
      schema: [
        { key: 'code', type: 'string' },
        { key: 'nom', type: 'string' },
        { key: 'population', type: 'integer' }
      ]
    }
    const doc = datasetAPIDocs(dataset, PUBLIC_URL).api
    const toolSet = await load(doc, { profiles: ['explore'], lint: 'error' })
    const search = toolSet.tools.find(t => t.name === 'datafair_search_data')
    assert.ok(search, 'search_data is generated from the per-dataset document')
    assert.deepEqual(search.inputSchema.properties.select.items.enum, ['code', 'nom', 'population'])
  })
})
