/**
 * The line edition cases and their runs: one run per case, arm and repeat, each with its own name
 * (evidence files are named after it) and a premise that only a write tool of its own arm satisfies.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { lineEditionCases, expandRuns, lineEditionRuns } from '../../../simulations/cases/line-edition.ts'
import { REGISTER_COLUMNS, EXTENSION_COLUMNS, registerId } from '../../../simulations/runner/line-edition-fixtures.ts'

const exportWith = (toolName: string, input: Record<string, unknown>) =>
  [{ conversationId: 'c', messages: [{ seq: 1, role: 'assistant', parts: [{ type: 'dynamic-tool', toolName, input }] }], runs: [], blobs: new Map() }] as any

test('expandRuns names are unique', () => {
  const runs = expandRuns(lineEditionCases, ['json', 'editor'], 2)
  assert.equal(runs.length, 12)
  assert.equal(new Set(runs.map(r => r.name)).size, 12)
  for (const run of runs) assert.match(run.name, /^[a-z-]+--(json|editor)--r[12]$/)
  assert.equal(runs.find(r => r.name === 'saisie-courriel--editor--r1')?.base, 'saisie-courriel')
})

test('json runs come first', () => {
  const arms = expandRuns(lineEditionCases, ['editor', 'json'], 2).map(r => r.arm)
  assert.equal(arms.lastIndexOf('json'), arms.indexOf('editor') - 1)
})

test('every expected row field is a register column', () => {
  const columns = new Set([...REGISTER_COLUMNS, ...EXTENSION_COLUMNS])
  assert.equal(lineEditionCases.length, 3)
  for (const c of lineEditionCases) {
    const objects = [...c.expected.rows.flatMap(r => [r.match, r.fields]), ...(c.expected.absent ?? [])]
    for (const o of objects) {
      for (const key of Object.keys(o)) assert.ok(columns.has(key), `${c.name}: ${key} is not a column of the register`)
    }
  }
})

test('a run goes to the lines agent as a member of test_org1', () => {
  for (const run of expandRuns(lineEditionCases, ['json'], 1)) {
    assert.equal(run.route, '/agents/organization/test_org1/chat?agentId=sim-lines')
    assert.equal(run.surface, 'autonomous-agent')
    assert.equal(run.user, 'test_user1')
    assert.ok(run.expected.rows.length > 0)
  }
})

test('the premise holds only for a write tool of the run\'s own arm, on a register', () => {
  const [json] = expandRuns(lineEditionCases, ['json'], 1)
  const [editor] = expandRuns(lineEditionCases, ['editor'], 1)
  const register = registerId(json.name)
  for (const tool of ['datafair_write_line', 'datafair_patch_line', 'mcp__datafair_bulk_lines']) {
    assert.equal(json.premise!.holds(exportWith(tool, { id: register })), true, tool)
    assert.equal(editor.premise!.holds(exportWith(tool, { id: register })), false, tool)
  }
  for (const tool of ['datafair_create_line_saveForm', 'mcp__datafair_edit_line_saveForm']) {
    assert.equal(editor.premise!.holds(exportWith(tool, { id: register, lineId: 'lieu-2' })), true, tool)
    assert.equal(json.premise!.holds(exportWith(tool, { id: register })), false, tool)
  }
  // filling a form is not writing, nor is writing to another dataset
  assert.equal(editor.premise!.holds(exportWith('datafair_create_line_setFieldValue', { id: register })), false)
  assert.equal(json.premise!.holds(exportWith('datafair_write_line', { id: 'sim-communes-agglo' })), false)
  assert.equal(json.premise!.holds(exportWith('datafair_read_line', { id: register })), false)
})

test('the runs follow SIM_ARMS and SIM_REPEAT, both arms twice by default', () => {
  assert.equal(lineEditionRuns({}).length, 12)
  const runs = lineEditionRuns({ SIM_ARMS: 'editor', SIM_REPEAT: '3' })
  assert.deepEqual([...new Set(runs.map(r => r.arm))], ['editor'])
  assert.equal(runs.length, 9)
  assert.throws(() => lineEditionRuns({ SIM_ARMS: 'json,form' }), /SIM_ARMS/)
  assert.throws(() => lineEditionRuns({ SIM_REPEAT: '0' }), /SIM_REPEAT/)
})
