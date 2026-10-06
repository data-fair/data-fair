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

  test('serves only the known skill names', async () => {
    const { readAgentSkill } = await import('../../../api/contract/agent-skills.ts')
    assert.equal(readAgentSkill('../x-agent'), undefined)
    assert.equal(readAgentSkill('nope'), undefined)
  })
})
