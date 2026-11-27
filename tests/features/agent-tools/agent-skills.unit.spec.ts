/**
 * The skills of the root document are markdown files served next to it
 * (api/contract/agent-skills/<name>.md at /api/v1/agents/skills/<name>.md): the document only
 * carries their name, a short description and the link.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

test.describe('agent skills served as markdown files', () => {
  test('every skill of the root document links a file this API serves', async () => {
    const { root } = await import('../../../api/contract/x-agent.ts')
    const { readAgentSkill } = await import('../../../api/contract/agent-skills.ts')
    assert.ok(root.skills?.length)
    for (const skill of root.skills!) {
      assert.equal(skill.href, `agents/skills/${skill.name}.md`)
      assert.ok(readAgentSkill(skill.name), `${skill.name}.md exists`)
      assert.ok((skill.description as string).length <= 1024)
    }
  })

  test('the workflow file states the filters the search tools accept, verbatim', async () => {
    const { filtersDescription } = await import('../../../api/contract/x-agent.ts')
    const { readAgentSkill } = await import('../../../api/contract/agent-skills.ts')
    assert.ok(readAgentSkill('workflow')!.includes(filtersDescription), 'update agent-skills/workflow.md when filtersDescription changes')
  })

  // Both mcp servers serve the workflow skill, the datasets server under its own tool names (data-fair/mcp
  // DATASETS_TOOLS, which it renames in the body too): the body names only the tools both have.
  test('the workflow file names only the tools of both mcp servers', async () => {
    const { readAgentSkill } = await import('../../../api/contract/agent-skills.ts')
    const named = new Set(readAgentSkill('workflow')!.match(/\bdatafair_[a-z0-9_]+\b/g))
    const shared = ['datafair_describe_dataset', 'datafair_search_data', 'datafair_get_field_values', 'datafair_aggregate_data', 'datafair_calculate_metric']
    assert.deepEqual([...named].filter(name => !shared.includes(name)), [])
  })

  // the query tools print the table and map links (the API's agent text): a link built from the
  // tool's inputs is wrong for query, geo, date and select, which the page takes as _c_* and cols
  test('the workflow file copies the result\'s links and states the format rules', async () => {
    const { readAgentSkill } = await import('../../../api/contract/agent-skills.ts')
    const body = readAgentSkill('workflow')!
    assert.ok(body.includes('`Table:`') && body.includes('`Map:`'), body)
    assert.ok(/never build/i.test(body), body)
    assert.ok(!body.includes('/table?'), 'no recipe to assemble a table link')
    assert.ok(/every figure/i.test(body), body)
    assert.ok(/compact markdown table/i.test(body), body)
  })

  test('serves only the known skill names', async () => {
    const { readAgentSkill } = await import('../../../api/contract/agent-skills.ts')
    assert.equal(readAgentSkill('../x-agent'), undefined)
    assert.equal(readAgentSkill('nope'), undefined)
  })
})
