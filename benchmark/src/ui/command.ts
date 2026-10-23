// `npm run benchmark -- ui-table`: A/B of the dataset table between a base ref and the
// working tree, on production builds served on the running dev stack.
import '../env.ts'
import { parseArgs } from 'node:util'
import { chromium, type Browser } from 'playwright'
import { buildVariant } from './build.ts'
import { installVariantRoutes, extractUiConfigPath } from './routing.ts'
import { openInstrumentedPage } from './collect.ts'
import { uiScenarios } from './scenarios.ts'
import { compareRuns, verdict, type RunRecord, type Row } from './compare.ts'
import { saveUiTableResults } from '../reporter.ts'
import { loginCookies, cookieHeader } from './auth.ts'
import { TABLE_PERF_ID } from '../../../dev/table-perf-fixture.ts'

export function preflightMessage (probe: { reachable: false } | { reachable: true, status: number, body?: { status?: string } }): string | null {
  if (!probe.reachable) return 'the dev stack is not reachable — check it with `npx --no df-dev status`'
  if (probe.status === 404) return `the ${TABLE_PERF_ID} dataset is missing — run \`npm run dev-fixtures\``
  if (probe.status === 401 || probe.status === 403) return `the dev user cannot read ${TABLE_PERF_ID} — run \`npm run dev-fixtures\``
  if (probe.status !== 200) return `unexpected HTTP ${probe.status} reading the ${TABLE_PERF_ID} dataset — check \`npx --no df-dev status\``
  if (probe.body?.status !== 'finalized') return `${TABLE_PERF_ID} is still indexing (status: ${probe.body?.status}) — retry later`
  return null
}

export function assertComplete (samples: Record<string, { base: unknown[], current: unknown[] }>, runs: number): void {
  for (const [scenario, s] of Object.entries(samples)) {
    for (const variant of ['base', 'current'] as const) {
      if (s[variant].length !== runs) throw new Error(`scenario ${scenario}: ${variant} has ${s[variant].length}/${runs} samples`)
    }
  }
}

const fmt = (v: number) => Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)
const fmtPct = (v: number) => !Number.isFinite(v) ? '  n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

function printScenario (name: string, description: string, rows: Row[]) {
  console.log(`\n${name} — ${description}`)
  console.log('measurement'.padEnd(15) + '| base med | curr med |    Δ %   | base min–max    | curr min–max    | flag')
  console.log('-'.repeat(100))
  for (const r of rows) {
    console.log(
      r.measurement.padEnd(15) +
      `| ${fmt(r.base.median).padStart(8)} | ${fmt(r.current.median).padStart(8)} | ${fmtPct(r.deltaPct).padStart(8)} ` +
      `| ${`${fmt(r.base.min)}–${fmt(r.base.max)}`.padEnd(15)} | ${`${fmt(r.current.min)}–${fmt(r.current.max)}`.padEnd(15)} | ${r.flag}`
    )
  }
}

export async function uiTableCommand (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: 'string', default: 'master' },
      runs: { type: 'string', default: '5' },
      scenarios: { type: 'string', default: 'all' },
      'no-throttle': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      'no-save': { type: 'boolean', default: false }
    }
  })
  const runs = parseInt(values.runs!)
  const scenarios = values.scenarios === 'all' ? uiScenarios : uiScenarios.filter(s => values.scenarios!.split(',').includes(s.name))
  if (!scenarios.length) throw new Error(`no scenario matches "${values.scenarios}" (${uiScenarios.map(s => s.name).join(', ')})`)
  const origin = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}`
  const tableUrl = `${origin}/data-fair/embed/dataset/${TABLE_PERF_ID}/table`

  let probe: Parameters<typeof preflightMessage>[0]
  try {
    const res = await fetch(`${origin}/data-fair/api/v1/datasets/${TABLE_PERF_ID}`, { headers: { Cookie: cookieHeader(await loginCookies(origin)) } })
    probe = { reachable: true, status: res.status, body: res.ok ? await res.json() : undefined }
  } catch {
    probe = { reachable: false }
  }
  const blocker = preflightMessage(probe)
  if (blocker) throw new Error(blocker)
  const uiConfigPath = extractUiConfigPath(await (await fetch(`${origin}/data-fair/`)).text())

  const base = await buildVariant({ kind: 'ref', ref: values.base! })
  const current = await buildVariant({ kind: 'current' })
  const variants = { base, current }
  console.log(`\n[ui-table] base: ${base.label}  current: ${current.label}  runs: ${runs}  CPU throttling: ${values['no-throttle'] ? 'off' : '4x'}`)

  const browser: Browser = await chromium.launch({ headless: !values.headed })
  const samples: Record<string, { base: RunRecord[], current: RunRecord[] }> = {}
  try {
    const runOnce = async (variant: 'base' | 'current', scenario: typeof scenarios[number]) => {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
      try {
        await installVariantRoutes(context, { origin, buildDir: variants[variant].dir, uiConfigPath })
        await context.addCookies(await loginCookies(origin))
        const h = await openInstrumentedPage(context, { throttle: !values['no-throttle'] })
        return await scenario.run(h, tableUrl)
      } catch (err: any) {
        throw new Error(`scenario ${scenario.name} failed on ${variant} (${variants[variant].label}): ${err.message}`)
      } finally {
        await context.close()
      }
    }
    for (const scenario of scenarios) {
      process.stdout.write(`[ui-table] ${scenario.name}: warm-up`)
      await runOnce('base', scenario)
      await runOnce('current', scenario)
      samples[scenario.name] = { base: [], current: [] }
      for (let i = 0; i < runs; i++) {
        // alternate which variant goes first, so drift over time affects both equally
        const order: ('base' | 'current')[] = i % 2 === 0 ? ['base', 'current'] : ['current', 'base']
        for (const v of order) samples[scenario.name][v].push(await runOnce(v, scenario))
        process.stdout.write(` ${i + 1}`)
      }
      process.stdout.write('\n')
    }
  } finally {
    await browser.close()
  }
  assertComplete(samples, runs)

  const byScenario: Record<string, Row[]> = {}
  for (const s of scenarios) {
    byScenario[s.name] = compareRuns(samples[s.name].base, samples[s.name].current)
    printScenario(s.name, s.description, byScenario[s.name])
  }
  const flagged = verdict(byScenario)
  console.log('\nVerdict: ' + (flagged.length ? `${flagged.length} flagged measurement(s)` : 'no notable difference'))
  for (const line of flagged) console.log(`  - ${line}`)
  console.log('\nNotes: durations in ms, heap in MB; spanMs includes a 300ms settle window; both variants use the stack\'s uiConfig (from the current tree).')
  if (!values['no-save']) {
    saveUiTableResults({ base: base.label, current: current.label, runs, throttle: !values['no-throttle'], samples, rows: byScenario, verdict: flagged })
  }
}
