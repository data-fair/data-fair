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

/** Serves what the root router serves at /api/v1/agents/skills/<name>.md, so linked skill bodies resolve offline. */
const skillFetch = (async (input: RequestInfo | URL) => {
  const url = input instanceof Request ? input.url : String(input)
  const prefix = `${PUBLIC_URL}/api/v1/agents/skills/`
  const { readAgentSkill } = await import('../../../api/contract/agent-skills.ts')
  const body = url.startsWith(prefix) && url.endsWith('.md') ? readAgentSkill(url.slice(prefix.length, -3)) : undefined
  return body ? new Response(body, { headers: { 'content-type': 'text/markdown' } }) : new Response('not found', { status: 404 })
}) as typeof fetch

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
  read_applications: ['datafair_list_account_applications', 'datafair_describe_application'],
  write_applications: ['datafair_list_account_applications', 'datafair_describe_application', 'datafair_update_application'],
  manage_applications: ['datafair_list_account_applications', 'datafair_describe_application', 'datafair_update_application', 'datafair_publish_application', 'datafair_delete_application']
}

/** Every nested property path under a schema, `[]` marking array items, composition keywords followed. */
const nestedPaths = (schema: any, prefix: string, out: string[] = [], depth = 0): string[] => {
  if (!schema || typeof schema !== 'object' || depth > 8) return out
  for (const k of ['oneOf', 'anyOf', 'allOf']) for (const s of schema[k] ?? []) nestedPaths(s, prefix, out, depth + 1)
  if (schema.items) nestedPaths(schema.items, `${prefix}[]`, out, depth + 1)
  for (const [k, v] of Object.entries<any>(schema.properties ?? {})) {
    out.push(`${prefix}.${k}`)
    nestedPaths(v, `${prefix}.${k}`, out, depth + 1)
  }
  return out
}

const annotatedOperationIds = (doc: any): string[] => Object.values<any>(doc.paths)
  .flatMap(item => Object.values<any>(item))
  .filter(op => op?.operationId && op['x-agent'])
  .map(op => op.operationId)
  .sort()

test.describe('agent surface of the root document', () => {
  test('declares the cells data-fair fills, all of them in the index vocabulary', async () => {
    const { apiDocs, agentsIndex } = await generators()
    const declared = Object.keys(apiDocs(PUBLIC_URL)['x-agent']!.profiles!)
    assert.deepEqual([...declared].sort(), Object.keys(expectedTools).sort())
    const vocabulary = Object.keys(agentsIndex(PUBLIC_URL, { publicUrl: PUBLIC_URL }).profiles!)
    for (const p of declared) assert.ok(vocabulary.includes(p), `${p} is in the index vocabulary`)
  })

  for (const [profile, tools] of Object.entries(expectedTools)) {
    test(`${profile}: loads without a lint error and matches its golden`, async () => {
      const { apiDocs } = await generators()
      const toolSet = await load(apiDocs(PUBLIC_URL), { fetch: skillFetch, profiles: [profile], lint: 'error' })
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
    const toolSet = await load(doc, { fetch: skillFetch, profiles: Object.keys(doc['x-agent']!.profiles!), lint: 'error' })
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

  test('places every application PATCH body field in exactly one view', async () => {
    const { apiDocs, xAgent } = await generators()
    const body = apiDocs(PUBLIC_URL).components.schemas.applicationPatch
    const placed = [...xAgent.applicationPatchFields.write, ...xAgent.applicationPatchFields.manage]
    assert.equal(new Set(placed).size, placed.length, 'no field is in two views')
    assert.deepEqual([...placed].sort(), Object.keys(body.properties).sort(), 'a new PATCH field must be placed in write or manage')
  })

  test('fields that change who can access a resource are offered in manage only', async () => {
    const { xAgent } = await generators()
    for (const lists of [xAgent.datasetPatchFields, xAgent.applicationPatchFields]) {
      for (const field of ['partOf', 'publicationSites', 'publications']) {
        assert.ok(lists.manage.includes(field), `${field} in manage`)
        assert.ok(!lists.write.includes(field), `${field} not in write`)
      }
    }
  })

  test('the account listings are scoped to the active account', async () => {
    const { apiDocs } = await generators()
    const urls: string[] = []
    const fetchFn = (async (input: RequestInfo | URL) => {
      urls.push(input instanceof Request ? input.url : String(input))
      return new Response(JSON.stringify({ count: 0, results: [] }), { headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const toolSet = await load(apiDocs(PUBLIC_URL), { profiles: ['read_datasets', 'read_applications'], fetch: fetchFn })
    for (const name of ['datafair_list_account_datasets', 'datafair_list_account_applications']) {
      const result = await toolSet.tools.find(t => t.name === name)!.execute({})
      assert.ok(!result.isError, result.text)
    }
    assert.equal(urls.length, 2)
    for (const url of urls) assert.equal(new URL(url).searchParams.get('mine'), 'true', url)
  })

  test('grid dataset tools point to a listing tool of the grid for ids', async () => {
    const { apiDocs } = await generators()
    const toolSet = await load(apiDocs(PUBLIC_URL), { fetch: skillFetch, profiles: ['manage_datasets'] })
    for (const tool of toolSet.tools.filter(t => t.inputSchema.properties?.datasetId)) {
      assert.match(tool.inputSchema.properties.datasetId.description, /list_account_datasets/, tool.name)
    }
  })

  test('tools replacing whole values say so, and the ACL replacement is destructive', async () => {
    const { apiDocs } = await generators()
    const toolSet = await load(apiDocs(PUBLIC_URL), { fetch: skillFetch, profiles: ['manage_datasets', 'manage_applications'] })
    const tool = (name: string) => toolSet.tools.find(t => t.name === name)!
    for (const name of ['datafair_update_dataset', 'datafair_update_application']) {
      assert.match(tool(name).description, /replace the current value entirely/, name)
    }
    assert.equal(tool('datafair_set_dataset_permissions').annotations.destructiveHint, true)
  })

  // The field placement tests above are top-level only: a governance sub-field added later inside a
  // write field (rest.*, configuration.*) would ride along. Pinning every nested path turns it into
  // a diff a reviewer has to accept. Regenerate with UPDATE_GOLDEN=1 when the change is intended.
  test('pins the nested fields the write views offer', async () => {
    const { apiDocs, xAgent } = await generators()
    const doc = apiDocs(PUBLIC_URL)
    const bodies = {
      datasets: [doc.paths['/datasets/{id}'].patch.requestBody.content['application/json'].schema, xAgent.datasetPatchFields.write],
      applications: [doc.components.schemas.applicationPatch, xAgent.applicationPatchFields.write]
    } as const
    const pinned: Record<string, string[]> = {}
    for (const [resource, [body, fields]] of Object.entries(bodies)) {
      pinned[resource] = [...new Set(fields.flatMap((f: string) => nestedPaths(body.properties[f], f)))].sort()
    }
    const pinPath = path.resolve(import.meta.dirname, '../../fixtures/agent-patch-write-nested-fields.json')
    if (process.env.UPDATE_GOLDEN) writeFileSync(pinPath, JSON.stringify(pinned, null, 2) + '\n')
    assert.deepEqual(pinned, JSON.parse(readFileSync(pinPath, 'utf8')))
  })

  test('the delete tools say that the resources attached to the deleted one go with it', async () => {
    const { apiDocs } = await generators()
    const toolSet = await load(apiDocs(PUBLIC_URL), { fetch: skillFetch, profiles: ['manage_datasets', 'manage_applications'] })
    for (const name of ['datafair_delete_dataset', 'datafair_delete_application']) {
      assert.match(toolSet.tools.find(t => t.name === name)!.description, /attached to it \(partOf\) are deleted too/, name)
    }
  })

  test('update_application asks not to change application key permissions unless asked', async () => {
    const { apiDocs } = await generators()
    const toolSet = await load(apiDocs(PUBLIC_URL), { fetch: skillFetch, profiles: ['write_applications'] })
    assert.match(toolSet.tools.find(t => t.name === 'datafair_update_application')!.description, /Do not change configuration\.datasets\[\]\.applicationKeyPermissions unless explicitly asked/)
  })

  test('the catalog workflow skill comes with the catalog profile only', async () => {
    const { apiDocs } = await generators()
    const catalog = await load(apiDocs(PUBLIC_URL), { fetch: skillFetch, profiles: ['catalog'] })
    assert.deepEqual(catalog.skills.map(s => s.id), ['workflow'])
    assert.equal(catalog.skills[0].error, undefined, 'the linked body is read, so the golden pins its real digest')
    assert.deepEqual((await load(apiDocs(PUBLIC_URL), { fetch: skillFetch, profiles: ['read_datasets'] })).skills.map(s => s.id), [])
  })

  test('the annotated surface does not depend on the session', async () => {
    const { apiDocs } = await generators()
    const anonymous = apiDocs(PUBLIC_URL)
    const admin = apiDocs(PUBLIC_URL, adminSession)
    assert.ok(annotatedOperationIds(admin).length > 0)
    assert.deepEqual(annotatedOperationIds(admin), annotatedOperationIds(anonymous))
    const profiles = Object.keys(anonymous['x-agent']!.profiles!)
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
    assert.deepEqual(Object.keys(doc['x-agent'].profiles), ['catalog', 'read_datasets', 'write_datasets', 'manage_datasets'], 'a dataset document declares only the cells it can fill')
    const toolSet = await load(doc, { fetch: skillFetch, profiles: ['read_datasets'], lint: 'error' })
    const search = toolSet.tools.find(t => t.name === 'datafair_search_data')
    assert.ok(search, 'search_data is generated from the per-dataset document')
    assert.deepEqual(search.inputSchema.properties.select.items.enum, ['code', 'nom', 'population'])
  })
})
