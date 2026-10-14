// Aggregation and flagging of UI table runs (pure). See the design spec, section 4.
import { aggregate } from '../metrics.ts'
import { pctDelta } from '../reporter.ts'

export interface RunRecord {
  spanMs: number
  scriptMs: number
  layoutMs: number
  styleMs: number
  taskMs: number
  longTaskCount: number
  longTaskMs: number
  frameP95Ms: number
  domNodes: number
  renderedRows: number
  linesRequests: number
  heapMB: number
}

export type Kind = 'timing' | 'structural'

// structural values are read after the page settled, so they are expected to be
// identical from run to run; everything else depends on timing
export const MEASUREMENTS: Record<keyof RunRecord, Kind> = {
  spanMs: 'timing',
  scriptMs: 'timing',
  layoutMs: 'timing',
  styleMs: 'timing',
  taskMs: 'timing',
  longTaskCount: 'timing',
  longTaskMs: 'timing',
  frameP95Ms: 'timing',
  domNodes: 'structural',
  renderedRows: 'structural',
  linesRequests: 'structural',
  heapMB: 'timing'
}

export type Flag = '' | 'slower' | 'faster' | 'changed' | 'unstable'
export interface Stats { median: number, min: number, max: number }
export interface Row { measurement: keyof RunRecord, kind: Kind, base: Stats, current: Stats, deltaPct: number, flag: Flag }

const TIMING_THRESHOLD_PCT = 10

const stats = (values: number[]): Stats => {
  const a = aggregate(values)
  return { median: a.median, min: a.min, max: a.max }
}

const flagFor = (kind: Kind, base: Stats, current: Stats, deltaPct: number): Flag => {
  if (kind === 'structural') {
    if (base.min !== base.max || current.min !== current.max) return 'unstable'
    return base.median !== current.median ? 'changed' : ''
  }
  if (current.min > base.max && deltaPct > TIMING_THRESHOLD_PCT) return 'slower'
  if (current.max < base.min && deltaPct < -TIMING_THRESHOLD_PCT) return 'faster'
  return ''
}

export function compareRuns (base: RunRecord[], current: RunRecord[]): Row[] {
  return (Object.keys(MEASUREMENTS) as (keyof RunRecord)[]).map(measurement => {
    const kind = MEASUREMENTS[measurement]
    const b = stats(base.map(r => r[measurement]))
    const c = stats(current.map(r => r[measurement]))
    const deltaPct = pctDelta(b.median, c.median)
    return { measurement, kind, base: b, current: c, deltaPct, flag: flagFor(kind, b, c, deltaPct) }
  })
}

const fmt = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(1)

export function verdict (byScenario: Record<string, Row[]>): string[] {
  const lines: string[] = []
  for (const [scenario, rows] of Object.entries(byScenario)) {
    for (const r of rows) {
      if (!r.flag) continue
      lines.push(`${scenario} / ${r.measurement}: ${r.flag} (${fmt(r.base.median)} → ${fmt(r.current.median)})`)
    }
  }
  return lines
}
