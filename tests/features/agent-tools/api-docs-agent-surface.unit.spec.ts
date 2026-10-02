/**
 * The agent-facing surface of this API: what `@data-fair/openapi-mcp` generates from the
 * x-agent annotations in the served document, one golden per declared profile. `lint: 'error'`
 * refuses a description that contradicts its schema; the goldens turn any change to a tool's
 * name, description or schema into a diff a reviewer sees. Regenerate with UPDATE_GOLDEN=1 when
 * the change is intended. Profiles: docs/architecture/agent-profiles.md.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { load, toolSetSnapshot } from '@data-fair/openapi-mcp'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const goldenPath = (profile: string) => path.resolve(import.meta.dirname, `../../fixtures/agent-surface.${profile}.json`)
const PUBLIC_URL = 'https://example.test/data-fair'

const generators = async () => ({
  apiDocs: (await import('../../../api/contract/api-docs.ts')).default,
  datasetAPIDocs: (await import('../../../api/contract/dataset-api-docs.ts')).default,
  agentsIndex: (await import('../../../api/contract/agents-index.ts')).agentsIndex,
  xAgent: await import('../../../api/contract/x-agent.ts')
})

const adminSession: any = {
  user: { id: 'admin', name: 'Admin', email: 'admin@test.com', adminMode: 1, isAdmin: 1, organizations: [] },
  account: { type: 'user', id: 'admin', name: 'Admin' },
  accountRole: 'admin'
}

const datasetReads = ['datafair_aggregate_data', 'datafair_calculate_metric', 'datafair_describe_dataset', 'datafair_get_field_values', 'datafair_search_data']

/** The tools each declared profile yields, `includes` applied. */
const expectedTools: Record<string, string[]> = {
  catalog: [...datasetReads, 'datafair_list_datasets'],
  read_datasets: [...datasetReads, 'datafair_list_account_datasets'],
  write_datasets: [...datasetReads, 'datafair_list_account_datasets', 'datafair_update_dataset'],
  manage_datasets: [...datasetReads, 'datafair_list_account_datasets', 'datafair_update_dataset', 'datafair_publish_dataset', 'datafair_delete_dataset', 'datafair_get_dataset_permissions', 'datafair_set_dataset_permissions'],
  read_applications: [],
  write_applications: [],
  manage_applications: []
}

const annotatedOperationIds = (doc: any): string[] => Object.values<any>(doc.paths)
  .flatMap(item => Object.values<any>(item))
  .filter(op => op?.operationId && op['x-agent'])
  .map(op => op.operationId)
  .sort()

test.describe('agent surface of the root document', () => {
  test('declares the cells data-fair fills, all of them in the index vocabulary', async () => {
    const { apiDocs, agentsIndex } = await generators()
    const declared = Object.keys(apiDocs(PUBLIC_URL)['x-agent'].profiles)
    assert.deepEqual([...declared].sort(), Object.keys(expectedTools).sort())
    const vocabulary = Object.keys(agentsIndex(PUBLIC_URL, { publicUrl: PUBLIC_URL }).profiles!)
    for (const p of declared) assert.ok(vocabulary.includes(p), `${p} is in the index vocabulary`)
  })

  for (const [profile, tools] of Object.entries(expectedTools)) {
    test(`${profile}: loads without a lint error and matches its golden`, async () => {
      const { apiDocs } = await generators()
      const toolSet = await load(apiDocs(PUBLIC_URL), { profiles: [profile], lint: 'error' })
      assert.deepEqual(toolSet.tools.map(t => t.name).sort(), [...tools].sort())
      // Through JSON: the golden is a file, and an `enum: undefined` left by the generator is not.
      const snapshot = JSON.parse(JSON.stringify(toolSetSnapshot(toolSet)))
      if (process.env.UPDATE_GOLDEN) writeFileSync(goldenPath(profile), JSON.stringify(snapshot, null, 2) + '\n')
      assert.deepEqual(snapshot, JSON.parse(readFileSync(goldenPath(profile), 'utf8')))
    })
  }

  test('every profile combines with every other: one tool set, no name twice', async () => {
    const { apiDocs } = await generators()
    const doc = apiDocs(PUBLIC_URL)
    const toolSet = await load(doc, { profiles: Object.keys(doc['x-agent'].profiles), lint: 'error' })
    const names = toolSet.tools.map(t => t.name)
    assert.equal(new Set(names).size, names.length)
    assert.deepEqual([...names].sort(), [...new Set(Object.values(expectedTools).flat())].sort())
  })

  test('places every dataset PATCH body field in exactly one view', async () => {
    const { apiDocs, xAgent } = await generators()
    const body = apiDocs(PUBLIC_URL).paths['/datasets/{id}'].patch.requestBody.content['application/json'].schema
    const placed = [...xAgent.datasetPatchFields.write, ...xAgent.datasetPatchFields.manage]
    assert.equal(new Set(placed).size, placed.length, 'no field is in two views')
    assert.deepEqual([...placed].sort(), Object.keys(body.properties).sort(), 'a new PATCH field must be placed in write or manage')
  })

  test('the catalog workflow skill comes with the catalog profile only', async () => {
    const { apiDocs } = await generators()
    assert.deepEqual((await load(apiDocs(PUBLIC_URL), { profiles: ['catalog'] })).skills.map(s => s.id), ['workflow'])
    assert.deepEqual((await load(apiDocs(PUBLIC_URL), { profiles: ['read_datasets'] })).skills.map(s => s.id), [])
  })

  test('the annotated surface does not depend on the session', async () => {
    const { apiDocs } = await generators()
    const anonymous = apiDocs(PUBLIC_URL)
    const admin = apiDocs(PUBLIC_URL, adminSession)
    assert.ok(annotatedOperationIds(admin).length > 0)
    assert.deepEqual(annotatedOperationIds(admin), annotatedOperationIds(anonymous))
    const profiles = Object.keys(anonymous['x-agent'].profiles)
    const [a, b] = await Promise.all([anonymous, admin].map(doc => load(doc, { profiles, lint: 'error' })))
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
    const toolSet = await load(doc, { profiles: ['read_datasets'], lint: 'error' })
    const search = toolSet.tools.find(t => t.name === 'datafair_search_data')
    assert.ok(search, 'search_data is generated from the per-dataset document')
    assert.deepEqual(search.inputSchema.properties.select.items.enum, ['code', 'nom', 'population'])
  })
})
