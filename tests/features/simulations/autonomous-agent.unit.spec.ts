/**
 * The pieces of the autonomous-agent runner that decide whether a run counts, checked without a model.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calledTool, toolMatches, DEFAULT_SIMULATED_AGENT } from '../../../simulations/runner/autonomous-agent.ts'

const exportWith = (parts: any[]) => [{ conversationId: 'c', messages: [{ seq: 1, role: 'assistant', parts }], runs: [], blobs: new Map() }] as any

test.describe('calledTool', () => {
  test('matches a tool whatever prefix the agents service gives it', () => {
    const exports = exportWith([{ type: 'dynamic-tool', toolName: 'datafair-read__datafair_list_account_datasets', input: {} }])
    assert.equal(calledTool(exports, 'datafair_list_account_datasets'), true)
  })

  test('does not match another tool sharing part of the name', () => {
    const exports = exportWith([{ type: 'dynamic-tool', toolName: 'datafair_list_datasets', input: {} }])
    assert.equal(calledTool(exports, 'datafair_list_account_datasets'), false)
    assert.equal(calledTool(exports, 'list_datasets_x'), false)
  })

  test('checks the input when asked', () => {
    const exports = exportWith([{ type: 'dynamic-tool', toolName: 'datafair_describe_dataset', input: { datasetId: 'sim-equipements-sportifs' } }])
    assert.equal(calledTool(exports, 'datafair_describe_dataset', input => input.datasetId === 'sim-equipements-sportifs'), true)
    assert.equal(calledTool(exports, 'datafair_describe_dataset', input => input.datasetId === 'other'), false)
  })

  test('reads a part lifted into a blob', () => {
    const exports = [{ conversationId: 'c', messages: [{ seq: 1, role: 'assistant', parts: [{ __ref: 'b1' }] }], runs: [], blobs: new Map([['b1', { type: 'dynamic-tool', toolName: 'datafair_search_data', input: {} }]]) }] as any
    assert.equal(calledTool(exports, 'datafair_search_data'), true)
  })

  test('counts a call a code_mode script made', () => {
    const nested = { type: 'data-subagent', data: { name: 'code_mode', parts: [{ type: 'dynamic-tool', toolName: 'datafair_list_account_datasets', input: { size: 50 } }] } }
    const exports = [{ conversationId: 'c', messages: [{ seq: 1, role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'code_mode', input: {} }, { __ref: 'b1' }] }], runs: [], blobs: new Map([['b1', nested]]) }] as any
    assert.equal(calledTool(exports, 'datafair_list_account_datasets', input => input.size === 50), true)
    assert.equal(calledTool(exports, 'datafair_search_data'), false)
  })

  test('takes a test of the bare tool name, for tool families', () => {
    const exports = exportWith([{ type: 'dynamic-tool', toolName: 'datafair-write__datafair_edit_line_saveForm', input: { id: 'x' } }])
    assert.equal(calledTool(exports, name => name.startsWith('datafair_edit_line_')), true)
    assert.equal(calledTool(exports, name => name.startsWith('datafair-write'), input => input.id === 'x'), false)
    assert.equal(calledTool(exports, name => name.endsWith('_saveForm'), input => input.id === 'y'), false)
  })
})

test('toolMatches accepts the bare name and server-prefixed forms only', () => {
  assert.equal(toolMatches('datafair_search_data', 'datafair_search_data'), true)
  assert.equal(toolMatches('datafair-read__datafair_search_data', 'datafair_search_data'), true)
  assert.equal(toolMatches('xdatafair_search_data', 'datafair_search_data'), false)
})

test('the default agent reads only, through its identity\'s scopes', () => {
  assert.deepEqual(DEFAULT_SIMULATED_AGENT.mcpServers, [])
  const users = JSON.parse(readFileSync(new URL('../../../dev/resources/users.template.json', import.meta.url), 'utf8'))
  const identity = users.map((u: any) => u.nhi).find((n: any) => n?.subject === 'autonomous-agent:sim-mcp')
  assert.deepEqual(identity?.scopes, ['all:read'])
})

test.describe('question-sur-un-jeu-du-compte premise', () => {
  const premise = async () => {
    const { agentCases } = await import('../../../simulations/cases/autonomous-agents.ts')
    return agentCases.find(c => c.name === 'question-sur-un-jeu-du-compte')!.premise!
  }

  test('holds when a data tool ran on the sports facilities dataset', async () => {
    const exports = exportWith([{ type: 'dynamic-tool', toolName: 'datafair_aggregate_data', input: { datasetId: 'sim-equipements-sportifs' } }])
    assert.equal((await premise()).holds(exports), true)
  })

  test('does not hold for another of the organization\'s datasets', async () => {
    const exports = exportWith([{ type: 'dynamic-tool', toolName: 'datafair_describe_dataset', input: { datasetId: 'sim-suivi-demandes' } }])
    assert.equal((await premise()).holds(exports), false)
  })
})
