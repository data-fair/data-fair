/**
 * SIM_CASES is shared by the simulation specs (simulate.sim.spec.ts, autonomous-agent.sim.spec.ts
 * and the line edition runs), and each must take only the requested cases it owns.
 * Names are still checked against every spec's cases, so a typo fails loudly instead of
 * silently running nothing.
 */
import { selectCases, type SimulationCase } from '@data-fair/lib-agents-sim'
import { cases } from './index.ts'
import { agentCases } from './autonomous-agents.ts'
import { lineEditionRuns } from './line-edition.ts'

// line edition runs are named per arm and repeat, so SIM_ARMS and SIM_REPEAT say which exist
export const allCases: SimulationCase[] = [...cases, ...agentCases, ...lineEditionRuns()]

export const requestedCaseNames = () => (process.env.SIM_CASES ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function selectOwnCases <T extends SimulationCase> (own: T[], names: string[] = requestedCaseNames()): T[] {
  selectCases(allCases, names)
  if (names.length === 0) return own
  return own.filter(c => names.includes(c.name))
}
