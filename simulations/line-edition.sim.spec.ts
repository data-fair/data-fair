/**
 * One judged run per line edition case, arm and repeat (simulations/cases/line-edition.ts): the
 * autonomous agent sim-lines writes lines into a register of its own, with the tools of the arm the
 * platform document is switched to. Beside the judge's verdict, the register's final lines are compared
 * to the case's expected state (simulations/tmp/sim-<run>.rows.json, summarized in the sidecar).
 * As in autonomous-agent.sim.spec.ts, the test fails only when the run itself is invalid: a wrong row
 * is a measure, not a failure.
 *
 * Run only when SIM_CASES names them (a run name, or a case name for all its runs): every run spends
 * quota, so a bare `npm run simulate` runs none, and SIM_ARMS / SIM_REPEAT say how many a case has.
 * All of them: SIM_CASES=saisie-courriel,import-tableur,corrections npm run simulate
 */
import fs from 'node:fs'
import path from 'node:path'
import { evidenceDir } from '@data-fair/lib-agents-sim'
import { test } from '../tests/fixtures/login.ts'
import { axiosAuth, waitForWorkerIdle } from '../tests/support/axios.ts'
import type { LineEditionArm } from '../api/contract/x-agent-line-edition.ts'
import { lineEditionRuns, type LineEditionRun } from './cases/line-edition.ts'
import { requestedCaseNames, selectOwnCases } from './cases/select.ts'
import { seedLineEditionDatasets, registerId } from './runner/line-edition-fixtures.ts'
import { seedSettings, OWNER, OWNER_USER } from './runner/settings.ts'
import { seedAutonomousAgent, waitForAgentTools, LINES_AGENT, type AbsentTool } from './runner/autonomous-agent.ts'
import { runAgentCase, ASSISTANT_MODEL, TOOLS_MODEL } from './runner/agent-conversation.ts'
import { checkRows } from './runner/row-check.ts'

const SUPER_ADMIN = 'test_superadmin@test.com'

/** Every tool of the editor groups, whatever the group. */
const isEditorTool = (name: string) => name.startsWith('datafair_create_line_') || name.startsWith('datafair_edit_line_')

/** The tools the agent must have and must not have in each arm: reading tools are the same in both. */
const ARM_TOOLS: Record<LineEditionArm, { present: string[], absent: AbsentTool[] }> = {
  json: {
    present: ['datafair_write_line', 'datafair_bulk_lines', 'datafair_describe_dataset'],
    absent: [isEditorTool]
  },
  editor: {
    present: ['datafair_create_line_saveForm', 'datafair_edit_line_saveForm', 'datafair_create_line_getFieldSuggestions'],
    absent: ['datafair_write_line', 'datafair_patch_line', 'datafair_bulk_lines']
  }
}

const superAdmin = () => axiosAuth(SUPER_ADMIN, undefined, true)

/** Switch the platform document to the arm's tools (null: back to today's document). */
async function setArm (arm: LineEditionArm | null) {
  const admin = await superAdmin()
  await admin.post('/api/v1/test-env/line-edition-arm', { arm })
}

/** Wait for the mcp server's refresh to hand the agent the arm's tools, and only them. */
async function waitForArmTools (arm: LineEditionArm) {
  const { present, absent } = ARM_TOOLS[arm]
  await waitForAgentTools(present, absent, { agentId: LINES_AGENT.id, timeoutMs: 60_000 })
}

const rowsFile = (run: LineEditionRun) => path.join(evidenceDir, `sim-${run.name}.rows.json`)

/** The register's lines and schema once every write is indexed, compared to the case's expected state. */
async function checkRegister (run: LineEditionRun) {
  if (!await waitForWorkerIdle(60_000)) throw new Error('the worker was still busy 60s after the conversation; the lines read may be incomplete')
  const admin = await superAdmin()
  const id = registerId(run.name)
  const schema = (await admin.get(`/api/v1/datasets/${id}`)).data.schema
  const { total, results: actual } = (await admin.get(`/api/v1/datasets/${id}/lines`, { params: { size: 1000, arrays: true } })).data as { total: number, results: Record<string, unknown>[] }
  if (total > actual.length) throw new Error(`${id} has ${total} lines, only ${actual.length} were read: the row check would be wrong`)
  const check = checkRows(run.expected, actual, schema)
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(rowsFile(run), JSON.stringify({ run: run.name, arm: run.arm, repeat: run.repeat, base: run.base, check, actual }, null, 2))
  const { diffs, missing, unexpectedPresent, ...counts } = check
  return { base: run.base, arm: run.arm, repeat: run.repeat, rowCheck: { ...counts, missing: missing.length, unexpectedPresent: unexpectedPresent.length, diffs: diffs.length } }
}

// nothing unless SIM_CASES names runs or cases: a bare `npm run simulate` must not spend these
const selected = requestedCaseNames().length ? selectOwnCases(lineEditionRuns()) : []

test.afterAll(async () => {
  if (selected.length) await setArm(null)
})

for (const run of selected) {
  test(`simulation: ${run.name}`, async ({ page, goToWithAuth }) => {
    // a previous run's rows must never be read as this one's, whatever happens below
    fs.rmSync(rowsFile(run), { force: true })
    await runAgentCase(run, page, goToWithAuth, async () => {
      await seedLineEditionDatasets(registerId(run.name))
      await seedSettings(ASSISTANT_MODEL, TOOLS_MODEL, await axiosAuth(`${OWNER_USER}@test.com`, OWNER.id))
      await seedAutonomousAgent(undefined, LINES_AGENT)
      await setArm(run.arm)
      await waitForArmTools(run.arm)
    }, () => checkRegister(run))
  })
}
