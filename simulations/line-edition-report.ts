/**
 * Compares the arms of the line edition experiment from the evidence of the runs
 * (simulations/line-edition.sim.spec.ts) and writes simulations/tmp/line-edition-report.md: one table
 * per case, a table of arm totals, and the field diffs of every run. A run that did not run, is
 * invalid or was not judged is listed as such and never scored. Reads only; spends nothing.
 *
 * Runs are the ones SIM_ARMS / SIM_REPEAT ask for (as the spec), narrowed by argv then SIM_CASES.
 *
 *   npm run simulate:line-edition-report
 */
import fs from 'node:fs'
import path from 'node:path'
import { evidenceDir, parseConversationExport, type ParsedExport } from '@data-fair/lib-agents-sim'
import { lineEditionRuns, writeTools, type LineEditionRun } from './cases/line-edition.ts'
import { selectOwnCases } from './cases/select.ts'
import { costOf, type RunCost } from './runner/run-cost.ts'
import type { RowCheck } from './runner/row-check.ts'

type Outcome =
  | { state: 'not run' | 'not judged' | 'invalid', why?: string }
  | { state: 'scored', satisfied: boolean, turns: number, durationMs: number, cost: RunCost, check?: RowCheck }

const names = process.argv.slice(2)
const runs = selectOwnCases(lineEditionRuns(), names.length ? names : undefined)

const readJson = (file: string): any => {
  try { return JSON.parse(fs.readFileSync(path.join(evidenceDir, file), 'utf8')) } catch { return undefined }
}

/** The write tools of the arm; removing a line counts as a write in both. */
const isWriteTool = (run: LineEditionRun) => (name: string) => writeTools[run.arm](name) || name === 'datafair_delete_line'

function exportsOf (run: LineEditionRun): ParsedExport[] {
  const prefix = `sim-${run.name}.`
  return fs.readdirSync(evidenceDir)
    .filter(file => file.startsWith(prefix) && file.endsWith('.export.jsonl'))
    .map(file => parseConversationExport({ conversationId: file.slice(prefix.length, -'.export.jsonl'.length), jsonl: fs.readFileSync(path.join(evidenceDir, file), 'utf8') }))
}

function outcomeOf (run: LineEditionRun): Outcome {
  const sidecar = readJson(`sim-${run.name}.run.json`)
  if (!sidecar) return { state: 'not run' }
  if (sidecar.valid !== true) return { state: 'invalid', why: String(sidecar.error ?? 'no reason recorded') }
  const verdict = readJson(`sim-${run.name}.verdict.json`)
  // a verdict is written by a model: the same checks as the other reports, a stringified boolean is not a verdict
  if (!verdict || verdict.case !== run.name || typeof verdict.satisfied !== 'boolean') return { state: 'not judged' }
  const cost = costOf(exportsOf(run), isWriteTool(run))
  return { state: 'scored', satisfied: verdict.satisfied, turns: sidecar.turns, durationMs: sidecar.durationMs, cost, check: readJson(`sim-${run.name}.rows.json`)?.check }
}

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`
const cell = (text: unknown) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const table = (head: string[], rows: unknown[][]) =>
  [head, head.map(() => '---'), ...rows].map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')

const outcomes = new Map(runs.map(run => [run, outcomeOf(run)]))
const bases = [...new Set(runs.map(run => run.base))]
const lines: string[] = ['# Line edition arms: comparison', '']

for (const base of bases) {
  lines.push(`## ${base}`, '')
  lines.push(table(
    ['arm', 'repeat', 'valid', 'rows exact', 'fields correct', 'unexpected rows', 'judge satisfied', 'turns', 'tool calls', 'failed writes', 'duration'],
    runs.filter(run => run.base === base).map(run => {
      const o = outcomes.get(run)!
      if (o.state !== 'scored') {
        const valid = o.state === 'invalid' ? `no (${o.why})` : o.state === 'not run' ? 'not run' : 'yes'
        return [run.arm, run.repeat, valid, '-', '-', '-', o.state === 'not judged' ? 'not judged' : '-', '-', '-', '-', '-']
      }
      const c = o.check
      return [
        run.arm, run.repeat, 'yes',
        c ? `${c.rowsExact}/${c.rowsExpected}` : 'no rows evidence',
        c ? `${c.fieldsCorrect}/${c.fieldsExpected}` : '-',
        c ? c.unexpectedPresent.length : '-',
        o.satisfied ? 'yes' : 'no',
        o.turns, o.cost.toolCalls, `${o.cost.failedWriteCalls}/${o.cost.writeCalls}`, seconds(o.durationMs)
      ]
    })
  ), '')
}

// totals over the scored runs only
lines.push('## Arm totals', '', 'Scored runs only: a run that did not run, is invalid or was not judged counts in "runs" and nowhere else.', '')
const arms = [...new Set(runs.map(run => run.arm))]
lines.push(table(
  ['arm', 'runs', 'scored', 'satisfied', 'rows exact', 'fields correct', 'unexpected rows', 'turns', 'tool calls', 'failed tool calls', 'write calls', 'failed writes', 'duration', 'tokens in/out'],
  arms.map(arm => {
    const armRuns = runs.filter(run => run.arm === arm)
    const scored = armRuns.map(run => outcomes.get(run)!).filter((o): o is Extract<Outcome, { state: 'scored' }> => o.state === 'scored')
    const checks = scored.flatMap(o => o.check ? [o.check] : [])
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
    const tokens = scored.flatMap(o => o.cost.tokens ? [o.cost.tokens] : [])
    return [
      arm, armRuns.length, scored.length, `${scored.filter(o => o.satisfied).length}/${scored.length}`,
      `${sum(checks.map(c => c.rowsExact))}/${sum(checks.map(c => c.rowsExpected))}`,
      `${sum(checks.map(c => c.fieldsCorrect))}/${sum(checks.map(c => c.fieldsExpected))}`,
      sum(checks.map(c => c.unexpectedPresent.length)),
      sum(scored.map(o => o.turns)), sum(scored.map(o => o.cost.toolCalls)), sum(scored.map(o => o.cost.failedToolCalls)),
      sum(scored.map(o => o.cost.writeCalls)), sum(scored.map(o => o.cost.failedWriteCalls)),
      seconds(sum(scored.map(o => o.durationMs))),
      tokens.length ? `${sum(tokens.map(t => t.input))}/${sum(tokens.map(t => t.output))}` : '-'
    ]
  })
), '')

lines.push('## Field diffs', '')
for (const run of runs) {
  const o = outcomes.get(run)!
  if (o.state !== 'scored') { lines.push(`- ${run.name}: ${o.state}${o.state === 'invalid' ? ` (${o.why})` : ''}`); continue }
  if (!o.check) { lines.push(`- ${run.name}: no rows evidence`); continue }
  lines.push(`- ${run.name}: ${o.check.diffs.length ? '' : 'no diff'}`)
  for (const d of o.check.diffs) lines.push(`  - ${JSON.stringify(d.match)} ${d.field}: expected ${JSON.stringify(d.expected)}, got ${JSON.stringify(d.actual)}`)
  for (const m of o.check.unexpectedPresent) lines.push(`  - unexpected row present: ${JSON.stringify(m)}`)
}

const out = path.join(evidenceDir, 'line-edition-report.md')
fs.mkdirSync(evidenceDir, { recursive: true })
fs.writeFileSync(out, lines.join('\n') + '\n')
console.log(`${out} (${runs.length} runs: ${[...new Set([...outcomes.values()].map(o => o.state))].join(', ')})`)
