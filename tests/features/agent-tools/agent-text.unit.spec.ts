/**
 * The pieces of the API's agent text (api/src/datasets/utils/agent-text.ts) that need no request.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

test.describe('agent text of the data queries (unit)', () => {
  test('a next URL without after gives no next page line, and no blank line in its place', async () => {
    const { nextPageLine } = await import('../../../api/src/datasets/utils/agent-text.ts')
    const searchData = await import('../../../agent-tools/search-data.ts')
    assert.equal(nextPageLine('https://example.test/api/v1/datasets/d/lines?page=2'), '')
    const { text } = searchData.formatResult({ total: 3, results: [{ a: 1 }], next: 'https://example.test/api/v1/datasets/d/lines?page=2' }, { datasetId: 'd', filters: { a_eq: '1' } }, { nextPage: nextPageLine })
    assert.ok(!text.includes('\n\n\n'), JSON.stringify(text))
    assert.ok(text.includes('Filter query: a_eq=1'), text)
  })

  test('x-agent: describe_dataset reads the agent text, no query tool fixes hint=true', async () => {
    const { operations } = await import('../../../api/contract/x-agent.ts')
    const readDescription = operations.readDescription as any
    assert.equal(readDescription.fixed?.agent_text, 'true')
    assert.equal(readDescription.response?.text, '/agentText')
    for (const op of [(operations.readLines as any[])[0], operations.getValuesAgg, operations.getMetricAgg] as any[]) {
      assert.equal(op.fixed?.hint, undefined, op.name)
    }
    assert.ok(/^[\x20-\x7e]+$/.test((operations.readLines as any[])[0].params.after.description), 'after is described in English')
  })

  test('x-agent: describe_application is concise, without the base application\'s form rules', async () => {
    const { operations } = await import('../../../api/contract/x-agent.ts')
    assert.deepEqual((operations.getApplication as any).response.concise, ['id', 'slug', 'title', 'summary', 'url', 'page', 'exposedUrl', 'baseApp', 'status'])
    const apiDocs = (await import('../../../api/contract/api-docs.ts')).default
    const baseApp = apiDocs('https://example.test/data-fair').components.schemas.application.properties.baseApp
    assert.equal(baseApp.properties.datasetsFilters['x-agent'].exclude, true)
  })
})
