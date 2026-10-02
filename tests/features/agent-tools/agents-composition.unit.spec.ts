/**
 * The deployment index and data-fair's document composed by `@data-fair/openapi-mcp`, the way
 * the `mcp` server and the agents service consume them: the umbrellas reach data-fair's cells,
 * the deprecated `explore` alias still yields the catalog tools, and data-fair declares nothing
 * outside the index vocabulary.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createComposer } from '@data-fair/openapi-mcp'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const PUBLIC_URL = 'https://example.test/data-fair'
const INDEX_URL = `${PUBLIC_URL}/api/v1/agents/index.json`

const composer = async () => {
  const { agentsIndex } = await import('../../../api/contract/agents-index.ts')
  const apiDocs = (await import('../../../api/contract/api-docs.ts')).default
  const index = agentsIndex(PUBLIC_URL, { publicUrl: PUBLIC_URL })
  const bodies: Record<string, unknown> = { [INDEX_URL]: index, [index.services[0].openapi]: apiDocs(PUBLIC_URL) }
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input)
    const body = bodies[url]
    return body ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 })
  }) as typeof fetch
  return createComposer(INDEX_URL, { fetch: fetchFn, lint: 'error' })
}

const names = (c: { toolSet: { tools: { name: string }[] } }) => c.toolSet.tools.map(t => t.name).sort()

test.describe('agents index composed with the data-fair document', () => {
  test('data-fair declares no profile outside the index vocabulary', async () => {
    const c = await composer()
    assert.deepEqual(c.services.map(s => [s.id, s.status, s.warnings]), [['data-fair', 'ok', undefined]])
  })

  test('the deprecated explore alias yields the catalog tools', async () => {
    const c = await composer()
    assert.deepEqual(names(await c.compose(['explore'])), names(await c.compose(['catalog'])))
    assert.ok(names(await c.compose(['explore'])).includes('datafair_list_datasets'))
  })

  test('the default profile is catalog', async () => {
    const c = await composer()
    assert.deepEqual(names(await c.compose()), names(await c.compose(['catalog'])))
  })

  test('the write umbrella reaches the write cells and nothing of manage', async () => {
    const c = await composer()
    const write = names(await c.compose(['write']))
    assert.ok(write.includes('datafair_update_dataset'))
    assert.ok(write.includes('datafair_update_application'))
    assert.ok(write.includes('datafair_list_account_datasets'), 'write includes read')
    assert.ok(!write.some(n => /publish|delete|permissions/.test(n)), 'no manage tool in write')
    assert.ok(!write.includes('datafair_list_datasets'), 'catalog is not in the grid')
  })

  test('catalog and the manage umbrella compose together', async () => {
    const c = await composer()
    const both = await c.compose(['catalog', 'manage'])
    assert.deepEqual(both.services.map(s => s.status), ['ok'])
    assert.ok(names(both).includes('datafair_list_datasets'))
    assert.ok(names(both).includes('datafair_list_account_datasets'))
  })
})
