import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { ParsedExport } from '@data-fair/lib-agents-sim'
import { costOf } from '../../../simulations/runner/run-cost.ts'

const exportOf = (parts: any[], calls: any[] = [], blobs: [string, unknown][] = []): ParsedExport => ({
  conversationId: 'c1',
  messages: [{ seq: 1, role: 'assistant', parts }],
  runs: [{ calls }],
  blobs: new Map(blobs)
})
const tool = (toolName: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'dynamic-tool', toolName, state: 'output-available', input: {}, output: 'ok', ...extra })
const isWrite = (name: string) => ['write_line', 'patch_line'].includes(name)

test.describe('line edition run cost', () => {
  test('counts tool calls, failed ones and writes, whatever the server prefix', () => {
    const cost = costOf([exportOf([
      { type: 'step-start' },
      tool('datafair__describe_dataset'),
      tool('datafair__write_line', { state: 'output-error', errorText: 'boom' }),
      tool('datafair__patch_line', { output: 'HTTP 200' })
    ])], isWrite)
    assert.deepEqual(cost, { toolCalls: 3, failedToolCalls: 1, writeCalls: 2, failedWriteCalls: 1 })
  })

  test('an output carrying an HTTP status of 400 or more is a failure', () => {
    const cost = costOf([exportOf([
      tool('write_line', { output: 'Error: HTTP 422 unprocessable' }),
      tool('write_line', { output: { status: 404 } }),
      tool('write_line', { output: { statusCode: 200 } }),
      tool('write_line', { output: 'wrote 4040 lines' })
    ])], isWrite)
    assert.equal(cost.failedToolCalls, 2)
    assert.equal(cost.failedWriteCalls, 2)
    assert.equal(cost.writeCalls, 4)
  })

  test('reads calls made by a code_mode script and parts lifted into blobs', () => {
    const cost = costOf([exportOf([
      { type: 'data-subagent', data: { parts: [tool('write_line'), tool('describe_dataset', { state: 'output-error' })] } },
      { type: 'dynamic-tool', __ref: 'p1' }
    ], [], [['p1', tool('patch_line')]])], isWrite)
    assert.deepEqual(cost, { toolCalls: 3, failedToolCalls: 1, writeCalls: 2, failedWriteCalls: 0 })
  })

  test('sums tokens over every export, and omits them when no call has any', () => {
    const withTokens = (input?: number, output?: number) => exportOf([], [{ modelRole: 'assistant', model: 'm', inputTokens: input, outputTokens: output }])
    assert.deepEqual(costOf([withTokens(100, 10), withTokens(50, 5)], isWrite).tokens, { input: 150, output: 15 })
    assert.equal('tokens' in costOf([withTokens(), exportOf([])], isWrite), false)
  })
})
