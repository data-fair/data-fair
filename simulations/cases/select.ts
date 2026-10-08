/**
 * SIM_CASES is shared by the two simulation specs (simulate.sim.spec.ts and
 * autonomous-agent.sim.spec.ts), and each must take only the requested cases it owns.
 * Names are still checked against every spec's cases, so a typo fails loudly instead of
 * silently running nothing.
 */
import { selectCases, type SimulationCase } from '@data-fair/lib-agents-sim'
import { cases } from './index.ts'
import { agentCases } from './autonomous-agents.ts'

export const allCases: SimulationCase[] = [...cases, ...agentCases]

export const requestedCaseNames = () => (process.env.SIM_CASES ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function selectOwnCases <T extends SimulationCase> (own: T[], names: string[] = requestedCaseNames()): T[] {
  selectCases(allCases, names)
  if (names.length === 0) return own
  return own.filter(c => names.includes(c.name))
}
