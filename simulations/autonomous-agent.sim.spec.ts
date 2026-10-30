/**
 * One judged scenario per autonomous-agent case: an agent of test_org1, acting as its own NHI, on the
 * mcp server's tools (simulations/cases/autonomous-agents.ts). There are no assertions about what the
 * agent should say — the test fails only when the run itself is invalid (the bridge is down, the
 * agent cannot reach its tools, the turn never finished, the premise did not hold). Whether the person
 * was served is the judge's call, from the transcript and the conversation export.
 *
 * A spec of its own rather than a branch of simulate.sim.spec.ts: the chat is the agents page itself
 * here, not the back-office drawer, and the run is set up around a seeded agent.
 */
import { test } from '../tests/fixtures/login.ts'
import { agentCases } from './cases/autonomous-agents.ts'
import { selectOwnCases } from './cases/select.ts'
import { seedDatasets, seedDecoys } from './runner/fixtures.ts'
import { seedSettings } from './runner/settings.ts'
import { seedAutonomousAgent, assertAgentTools } from './runner/autonomous-agent.ts'
import { runAgentCase, ASSISTANT_MODEL, TOOLS_MODEL } from './runner/agent-conversation.ts'

/** The tools every case needs: a run without them would test nothing. */
const REQUIRED_TOOLS = ['datafair_list_account_datasets', 'datafair_describe_dataset', 'datafair_search_data']
const selected = selectOwnCases(agentCases)

for (const simCase of selected) {
  test(`simulation: ${simCase.name}`, async ({ page, goToWithAuth }) => {
    await runAgentCase(simCase, page, goToWithAuth, async () => {
      const ownerAx = await seedDatasets()
      await seedDecoys()
      await seedSettings(ASSISTANT_MODEL, TOOLS_MODEL, ownerAx)
      await seedAutonomousAgent(simCase.agent)
      await assertAgentTools(REQUIRED_TOOLS)
    })
  })
}
