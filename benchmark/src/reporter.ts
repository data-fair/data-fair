import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import type { Scenario } from './scenarios.ts'

export interface ScenarioResult {
  scenario: Scenario
  latency: { p50: number, p97_5: number, p99: number, avg: number }
  throughput: { avg: number, total: number }
  errors: number
  duration: number
}

export function printResults (results: ScenarioResult[]) {
  const nameWidth = Math.max(20, ...results.map(r => r.scenario.name.length + 2))

  console.log('')
  console.log(`Benchmark Results - ${new Date().toISOString().split('T')[0]}`)
  console.log('='.repeat(nameWidth + 52))
  console.log(
    'Scenario'.padEnd(nameWidth) +
    '| p50 (ms) | p97.5(ms)| p99 (ms) | req/s  | errors'
  )
  console.log('-'.repeat(nameWidth + 52))

  for (const r of results) {
    console.log(
      r.scenario.name.padEnd(nameWidth) +
      `| ${fmtMs(r.latency.p50)} | ${fmtMs(r.latency.p97_5)} | ${fmtMs(r.latency.p99)} | ${fmtReqs(r.throughput.avg)} | ${r.errors}`
    )
  }

  console.log('='.repeat(nameWidth + 52))
  console.log('')
}

function fmtMs (v: number): string {
  return String(v.toFixed(1)).padStart(8)
}

function fmtReqs (v: number): string {
  return String(Math.round(v)).padStart(6)
}

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
    results: results.map(r => ({
      scenario: r.scenario.name,
      description: r.scenario.description,
      latency: r.latency,
      throughput: r.throughput,
      errors: r.errors,
      duration: r.duration
    }))
  }

  const dir = path.resolve(import.meta.dirname, '../results')
  mkdirSync(dir, { recursive: true })
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const filepath = path.join(dir, filename)
  writeFileSync(filepath, JSON.stringify(output, null, 2))
  console.log(`Results saved to ${filepath}`)
}
