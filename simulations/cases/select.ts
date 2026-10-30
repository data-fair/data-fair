/**
 * SIM_CASES is shared by the simulation specs (simulate.sim.spec.ts, autonomous-agent.sim.spec.ts
 * and the line edition runs), and each must take only the requested cases it owns.
 * Names are still checked against every spec's cases, so a typo fails loudly instead of
 * silently running nothing.
 */
import type { SimulationCase } from '@data-fair/lib-agents-sim'
import { cases } from './index.ts'
import { agentCases } from './autonomous-agents.ts'
import { lineEditionRuns } from './line-edition.ts'

/** What runs and is reported when no case is named. The line edition runs are an experiment run on demand only. */
export const allCases: SimulationCase[] = [...cases, ...agentCases]

/**
 * The cases the names designate, every case when none is named. A line edition run is named
 * `<case>--<arm>--r<repeat>`, and its case's name selects all its runs (as SIM_ARMS and SIM_REPEAT
 * expand them).
 */
export function resolveCases (names: string[]): SimulationCase[] {
  if (names.length === 0) return allCases
  const runs = lineEditionRuns()
  const known = [...allCases, ...runs]
  return names.flatMap(name => {
    const found = known.find(c => c.name === name)
    if (found) return [found]
    const expanded = runs.filter(run => run.base === name)
    if (expanded.length) return expanded
    throw new Error(`unknown simulation case: ${name} (have: ${[...known.map(c => c.name), ...new Set(runs.map(r => r.base))].join(', ')})`)
  })
}

export const requestedCaseNames = () => (process.env.SIM_CASES ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function selectOwnCases <T extends SimulationCase> (own: T[], names: string[] = requestedCaseNames()): T[] {
  if (names.length === 0) return own
  const selected = new Set(resolveCases(names).map(c => c.name))
  return own.filter(c => selected.has(c.name))
}
