import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import type { Scenario } from './scenarios.ts'
import type { RunResult } from './runner.ts'

// ---- throughput reporting (autocannon) -------------------------------------

export interface ScenarioResult {
  scenario: Scenario
  latency: { p50: number, p97_5: number, p99: number, avg: number }
  throughput: { avg: number, total: number }
  errors: number
  duration: number
}

export function printResults (results: ScenarioResult[]): void {
  const nameWidth = Math.max(20, ...results.map(r => r.scenario.name.length + 2))
  console.log('')
  console.log(`Throughput Results - ${new Date().toISOString().split('T')[0]}`)
  console.log('='.repeat(nameWidth + 52))
  console.log('Scenario'.padEnd(nameWidth) + '| p50 (ms) | p97.5(ms)| p99 (ms) | req/s  | errors')
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

// ---- experiment (A/B) reporting --------------------------------------------

export interface VariantResult {
  variant: string
  description: string
  isBaseline: boolean
  result: RunResult
}

export interface ExperimentResult {
  experiment: string
  description: string
  preset: string
  rows: number
  variants: VariantResult[]
  /** Non-latency measurements from a self-building experiment's setup (index size, sanity
   *  checks, corpus stats) — see `Experiment.setup`. */
  findings?: Record<string, unknown>
}

/** Signed percentage change from `baseline` to `value`. */
export function pctDelta (baseline: number, value: number): number {
  if (baseline === 0) return value === 0 ? 0 : Infinity
  return ((value - baseline) / baseline) * 100
}

/** True when two runs returned the same top-k hit ids (the total may legitimately differ). */
export function sameHits (a: RunResult, b: RunResult): boolean {
  return a.topHitIds.length === b.topHitIds.length &&
    a.topHitIds.every((id, i) => id === b.topHitIds[i])
}

export function printExperimentReport (er: ExperimentResult): void {
  const baseline = er.variants.find(v => v.isBaseline)
  if (!baseline) throw new Error(`printExperimentReport: no baseline variant in experiment "${er.experiment}"`)
  console.log('')
  console.log(`Experiment: ${er.experiment} — ${er.description}`)
  console.log(`Dataset: ${er.preset} (${er.rows.toLocaleString()} rows), runs=${baseline.result.runs}, ${baseline.result.cold ? 'cold' : 'warm'} cache`)
  console.log('-'.repeat(100))
  console.log('Variant'.padEnd(16) + '| took p50 | took min | e2e p50  | hits.total          | Δ took   | results')
  console.log('-'.repeat(100))
  for (const v of er.variants) {
    const r = v.result
    const delta = v.isBaseline ? '    —   ' : fmtPct(pctDelta(baseline.result.took.median, r.took.median))
    const results = v.isBaseline ? 'baseline' : (sameHits(baseline.result, r) ? 'same' : 'DIFFERS')
    console.log(
      v.variant.padEnd(16) +
      `| ${fmtMs(r.took.median)} | ${fmtMs(r.took.min)} | ${fmtMs(r.roundTripMs.median)} | ${fmtTotal(r).padEnd(19)} | ${delta} | ${results}`
    )
  }
  console.log('-'.repeat(100))
  if (er.findings) console.log(`  setup findings attached to the results JSON: ${Object.keys(er.findings).join(', ')}`)
  for (const v of er.variants) {
    if (v.result.profile) {
      const top = v.result.profile.topQueryTypes.map(t => `${t.type} ${t.timeMs.toFixed(1)}ms`).join(', ')
      console.log(`  profile [${v.variant}]: rewrite ${v.result.profile.rewriteTimeMs.toFixed(1)}ms; ${top}`)
    }
  }
}

// ---- JSON persistence ------------------------------------------------------

function gitInfo (): { commit: string, branch: string } {
  try {
    return {
      commit: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
      branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
    }
  } catch {
    return { commit: 'unknown', branch: 'unknown' }
  }
}

function saveJson (kind: string, payload: object): void {
  const dir = path.resolve(import.meta.dirname, '../results')
  mkdirSync(dir, { recursive: true })
  const filename = `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const filepath = path.join(dir, filename)
  writeFileSync(filepath, JSON.stringify(payload, null, 2))
  console.log(`Results saved to ${filepath}`)
}

export function saveResults (results: ScenarioResult[]): void {
  saveJson('throughput', {
    timestamp: new Date().toISOString(),
    git: gitInfo(),
    node: process.version,
    results: results.map(r => ({
      scenario: r.scenario.name,
      description: r.scenario.description,
      latency: r.latency,
      throughput: r.throughput,
      errors: r.errors,
      duration: r.duration
    }))
  })
}

export function saveExperimentResults (results: ExperimentResult[]): void {
  saveJson('experiment', {
    timestamp: new Date().toISOString(),
    git: gitInfo(),
    node: process.version,
    experiments: results
  })
}

// ---- formatting helpers ----------------------------------------------------

function fmtMs (v: number): string {
  return v.toFixed(1).padStart(8)
}

function fmtReqs (v: number): string {
  return String(Math.round(v)).padStart(6)
}

function fmtPct (v: number): string {
  if (!Number.isFinite(v)) return 'n/a'.padStart(8)
  const s = v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)
  return `${s}%`.padStart(8)
}

function fmtTotal (r: RunResult): string {
  return `${r.totalValue.toLocaleString()} (${r.totalRelation})`
}
