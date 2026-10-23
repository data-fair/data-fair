/**
 * The autonomous agent a case drives: owned by test_org1, acting as its own NHI, calling the mcp
 * server's tools — the configuration production runs.
 *
 * The NHI is declared in simple-directory's file storage (dev/resources/users.template.json) with the
 * subject autonomous-agent:sim-mcp, which pins the agent id. The public creation route always
 * generates the id, so the agent is seeded through the agents test-env route (development mode only),
 * the same contract the agents repo's own simulations use.
 */
import type { ParsedExport, SimulationCase } from '@data-fair/lib-agents-sim'
import { ROOT, OWNER, OWNER_USER } from './settings.ts'

export const SIM_AGENT_ID = 'sim-mcp'
export const SIM_NHI = 'test_org1_agent_nhi'
const SUPER_ADMIN = 'test_superadmin@test.com'

export interface SimulatedAgentConfig {
  title?: string
  persona?: string
  instructions?: string
  /** References into the agents service's MCP_SERVERS catalog, beside data-fair's mcp, which every agent with an identity has built in (PRIVATE_MCP_URL, docker-compose.yaml). */
  mcpServers?: Array<{ serverId: string, toolFilter?: string[] }>
}

export const DEFAULT_SIMULATED_AGENT: Required<SimulatedAgentConfig> = {
  title: 'Assistant données de l\'organisation',
  persona: 'Tu es l\'assistant données de l\'organisation. Tu réponds brièvement, en français, et tu dis clairement quand tu ne peux pas faire quelque chose.',
  instructions: 'Appuie-toi sur tes outils plutôt que de deviner. Si un outil échoue ou qu\'aucun outil ne permet de répondre, dis-le au lieu d\'inventer un résultat.',
  mcpServers: []
}

export type AgentCase = SimulationCase & {
  agent?: SimulatedAgentConfig
  /** What must have happened for the run to have tested its case; an invalid run is never judged. */
  premise?: { description: string, holds: (exports: ParsedExport[]) => boolean }
}

const superAdmin = async () => {
  const { axiosAuth } = await import('../../tests/support/axios.ts')
  return axiosAuth(SUPER_ADMIN, undefined, true, { baseURL: ROOT })
}

/**
 * Create the agent afresh, enrolled with the fixture NHI, instructed by OWNER_USER. Deleted first, which takes
 * its conversations with it: the agents page reopens the agent's latest thread, so a kept history would carry
 * an earlier run's conversation into this one (and clean() resets data-fair, not the agents service).
 */
export async function seedAutonomousAgent (agent: SimulatedAgentConfig = {}) {
  const admin = await superAdmin()
  await admin.delete(`/agents/api/autonomous-agents/${OWNER.type}/${OWNER.id}/${SIM_AGENT_ID}`, { validateStatus: status => status < 300 || status === 404 })
  await admin.post('/agents/api/test-env/autonomous-agent', {
    id: SIM_AGENT_ID,
    owner: OWNER,
    clientId: SIM_NHI,
    siteUrl: ROOT,
    issuer: `${ROOT}/agents/api/nhi`,
    autonomousAgent: {
      ...DEFAULT_SIMULATED_AGENT,
      ...agent,
      instructors: [{ mode: 'member', type: 'user', id: OWNER_USER }],
      enabled: true
    }
  })
}

/**
 * The agents service keys catalog tools by their bare name; a `<server>__` prefix is accepted too, so
 * a change of naming there does not silently invalidate every run.
 */
export const toolMatches = (toolName: string, name: string) => toolName === name || toolName.endsWith(`__${name}`)

/**
 * Fail before any model call when the agent cannot reach its tools. The diagnostic performs the NHI
 * exchange and lists the tools as the agent would get them, so a broken issuer, a missing NHI or an
 * mcp server that composed nothing is named here, not discovered as a run where the agent "has no tools".
 */
export async function assertAgentTools (expected: string[]) {
  const admin = await superAdmin()
  let names: string[]
  try {
    const res = await admin.get(`/agents/api/autonomous-agents/${OWNER.type}/${OWNER.id}/${SIM_AGENT_ID}/tools`)
    names = (res.data.results as Array<{ name: string }>).map(t => t.name)
  } catch (err: any) {
    throw new Error(`the autonomous agent cannot list its tools (NHI exchange or mcp server): ${err.status ?? ''} ${typeof err.data === 'string' ? err.data : JSON.stringify(err.data ?? err.message)}`)
  }
  const missing = expected.filter(name => !names.some(n => toolMatches(n, name)))
  if (missing.length) throw new Error(`the autonomous agent lacks ${missing.join(', ')}; it has: ${names.join(', ') || 'no tools'}`)
}

type ToolPart = { type?: string, toolName?: string, input?: unknown, __ref?: string, data?: { parts?: ToolPart[] } }

/**
 * Whether a conversation called the tool, optionally with an input matching `input`. A call a code_mode
 * script made counts too: it is recorded as a part of the script's `data-subagent` part, as a sub-agent's are.
 */
export function calledTool (exports: ParsedExport[], name: string, input?: (input: any) => boolean): boolean {
  return exports.some(exported => {
    const matches = (stub: ToolPart): boolean => {
      // a part too large for its message line is lifted into a blob record, with a stub left behind
      const part = (stub.__ref ? exported.blobs.get(stub.__ref) as ToolPart | undefined : undefined) ?? stub
      if (part.type === 'data-subagent') return (part.data?.parts ?? []).some(matches)
      return part.type === 'dynamic-tool' && !!part.toolName && toolMatches(part.toolName, name) && (!input || input(part.input))
    }
    return exported.messages.some(message => (message.parts as ToolPart[]).some(matches))
  })
}
