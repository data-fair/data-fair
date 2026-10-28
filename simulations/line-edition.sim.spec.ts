/**
 * One judged run per line edition case, arm and repeat (simulations/cases/line-edition.ts): the
 * autonomous agent sim-lines writes lines into a register of its own, with the tools of the arm the
 * platform document is switched to. Beside the judge's verdict, the register's final lines are compared
 * to the case's expected state (simulations/tmp/sim-<run>.rows.json, summarized in the sidecar).
 * As in autonomous-agent.sim.spec.ts, the test fails only when the run itself is invalid: a wrong row
 * is a measure, not a failure.
 *
 * Not part of the unfiltered selection's report (simulations/cases/select.ts): every run spends quota,
 * and SIM_ARMS / SIM_REPEAT say how many.
 */
import fs from 'node:fs'
import path from 'node:path'
import { evidenceDir } from '@data-fair/lib-agents-sim'
import { test } from '../tests/fixtures/login.ts'
import { axiosAuth, waitForWorkerIdle } from '../tests/support/axios.ts'
import type { LineEditionArm } from '../api/contract/x-agent-line-edition.ts'
import { lineEditionRuns, type LineEditionRun } from './cases/line-edition.ts'
import { selectOwnCases } from './cases/select.ts'
import { seedLineEditionDatasets, registerId } from './runner/line-edition-fixtures.ts'
import { seedSettings, OWNER, OWNER_USER } from './runner/settings.ts'
import { seedAutonomousAgent, waitForAgentTools, LINES_AGENT } from './runner/autonomous-agent.ts'
import { runAgentCase, ASSISTANT_MODEL, TOOLS_MODEL } from './runner/agent-conversation.ts'
import { checkRows } from './runner/row-check.ts'

const SUPER_ADMIN = 'test_superadmin@test.com'

/** The tools the agent must have and must not have in each arm: reading tools are the same in both. */
const ARM_TOOLS: Record<LineEditionArm, { present: string[], absent: string[] }> = {
  json: {
    present: ['datafair_write_line', 'datafair_bulk_lines', 'datafair_describe_dataset'],
    absent: []
  },
  editor: {
    present: ['datafair_create_line_saveForm', 'datafair_edit_line_saveForm', 'datafair_create_line_getFieldSuggestions'],
    absent: ['datafair_write_line', 'datafair_patch_line', 'datafair_bulk_lines']
  }
}

/**
 * Arm json must have no editor tool at all, whatever its group: assertAgentTools only names tools, so
 * they are checked by prefix here, once. No retry needed: the tools come from one platform document,
 * and arm json's present tools are absent from arm editor's.
 */
const EDITOR_TOOL_PREFIXES = ['datafair_create_line_', 'datafair_edit_line_']

const superAdmin = () => axiosAuth(SUPER_ADMIN, undefined, true)

/** Switch the platform document to the arm's tools (null: back to today's document). */
async function setArm (arm: LineEditionArm | null) {
  const admin = await superAdmin()
  await admin.post('/api/v1/test-env/line-edition-arm', { arm })
}

/** Wait for the mcp server's refresh to hand the agent the arm's tools, and only them. */
async function waitForArmTools (arm: LineEditionArm) {
  const { present, absent } = ARM_TOOLS[arm]
  const names = await waitForAgentTools(present, absent, { agentId: LINES_AGENT.id, timeoutMs: 60_000 })
  if (arm === 'json') {
    const editorTools = names.filter(name => EDITOR_TOOL_PREFIXES.some(prefix => name.includes(prefix)))
    if (editorTools.length) throw new Error(`arm json still has editor tools ${editorTools.join(', ')}; it has: ${names.join(', ')}`)
  }
}

const rowsFile = (run: LineEditionRun) => path.join(evidenceDir, `sim-${run.name}.rows.json`)

/** The register's lines and schema once every write is indexed, compared to the case's expected state. */
async function checkRegister (run: LineEditionRun) {
  if (!await waitForWorkerIdle(60_000)) throw new Error('the worker was still busy 60s after the conversation; the lines read may be incomplete')
  const admin = await superAdmin()
  const id = registerId(run.name)
  const schema = (await admin.get(`/api/v1/datasets/${id}`)).data.schema
  const actual = (await admin.get(`/api/v1/datasets/${id}/lines`, { params: { size: 1000, arrays: true } })).data.results as Record<string, unknown>[]
  const check = checkRows(run.expected, actual, schema)
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(rowsFile(run), JSON.stringify({ run: run.name, arm: run.arm, repeat: run.repeat, base: run.base, check, actual }, null, 2))
  const { diffs, missing, unexpectedPresent, ...counts } = check
  return { base: run.base, arm: run.arm, repeat: run.repeat, rowCheck: { ...counts, missing: missing.length, unexpectedPresent: unexpectedPresent.length, diffs: diffs.length } }
}

const selected = selectOwnCases(lineEditionRuns())

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
