import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import type { StepDelta } from './metrics.ts'

interface BaseResult {
  name: string
  description: string
  steps?: StepDelta[]
  rssDeltaMb?: number
}

export interface HttpScenarioResult extends BaseResult {
  kind: 'http'
  latency: { p50: number, p97_5: number, p99: number, avg: number }
  throughput: { avg: number, total: number }
  errors: number
  non2xx: number
  duration: number
}

export interface OneShotScenarioResult extends BaseResult {
  kind: 'oneshot'
  repetitions: number
  metrics: Record<string, number[]>
}

export type ScenarioResult = HttpScenarioResult | OneShotScenarioResult

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function printResults (results: ScenarioResult[]) {
  const httpResults = results.filter((r): r is HttpScenarioResult => r.kind === 'http')
  const oneShotResults = results.filter((r): r is OneShotScenarioResult => r.kind === 'oneshot')

  if (httpResults.length) {
    const nameWidth = Math.max(20, ...httpResults.map(r => r.name.length + 2))
    console.log('')
    console.log(`Benchmark Results - ${new Date().toISOString().split('T')[0]}`)
    console.log('='.repeat(nameWidth + 62))
    console.log('Scenario'.padEnd(nameWidth) + '| p50 (ms) | p97.5(ms)| p99 (ms) | req/s  | non2xx | errors')
    console.log('-'.repeat(nameWidth + 62))
    for (const r of httpResults) {
      console.log(
        r.name.padEnd(nameWidth) +
        `| ${fmtMs(r.latency.p50)} | ${fmtMs(r.latency.p97_5)} | ${fmtMs(r.latency.p99)} | ${fmtReqs(r.throughput.avg)} | ${String(r.non2xx).padStart(6)} | ${r.errors}`
      )
    }
    console.log('='.repeat(nameWidth + 62))
  }

  for (const r of oneShotResults) {
    console.log(`\n[${r.name}] (${r.repetitions} repetition${r.repetitions > 1 ? 's' : ''}, median shown)`)
    for (const [key, values] of Object.entries(r.metrics)) {
      const extra = values.length > 1 ? `  (min ${fmtNum(Math.min(...values))}, max ${fmtNum(Math.max(...values))})` : ''
      console.log(`  ${key}: ${fmtNum(median(values))}${extra}`)
    }
  }

  for (const r of results) {
    if (r.steps?.length || r.rssDeltaMb !== undefined) {
      console.log(`\n[${r.name}] server-side detail:`)
      if (r.rssDeltaMb !== undefined) console.log(`  rss delta: ${r.rssDeltaMb.toFixed(1)} MB`)
      for (const s of r.steps ?? []) {
        console.log(`  ${s.routeName} ${s.step}: n=${s.count} avg=${s.avgMs.toFixed(2)}ms total=${(s.totalMs / 1000).toFixed(2)}s`)
      }
    }
  }
  console.log('')
}

const fmtMs = (v: number) => String(v.toFixed(1)).padStart(8)
const fmtReqs = (v: number) => String(Math.round(v)).padStart(6)
const fmtNum = (v: number) => v >= 100 ? String(Math.round(v)) : v.toFixed(1)

export function saveResults (results: ScenarioResult[]) {
  let gitCommit = 'unknown'
  let gitBranch = 'unknown'
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
  } catch { /* ignore */ }

  const output = {
    timestamp: new Date().toISOString(),
    git: { commit: gitCommit, branch: gitBranch },
    node: process.version,
    results
  }

  const dir = path.resolve(import.meta.dirname, '../results')
  mkdirSync(dir, { recursive: true })
  const filepath = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(filepath, JSON.stringify(output, null, 2))
  console.log(`Results saved to ${filepath}`)
}
