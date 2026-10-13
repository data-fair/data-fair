import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareRuns, verdict, MEASUREMENTS, type RunRecord } from './compare.ts'

const rec = (over: Partial<RunRecord> = {}): RunRecord => ({
  spanMs: 100,
  scriptMs: 50,
  layoutMs: 10,
  styleMs: 5,
  taskMs: 80,
  longTaskCount: 1,
  longTaskMs: 60,
  frameP95Ms: 17,
  domNodes: 3000,
  renderedRows: 30,
  linesRequests: 2,
  heapMB: 40,
  ...over
})
const row = (rows: ReturnType<typeof compareRuns>, m: keyof RunRecord) => rows.find(r => r.measurement === m)!

test('every RunRecord field has a kind', () => {
  assert.deepEqual(Object.keys(MEASUREMENTS).sort(), Object.keys(rec()).sort())
})

test('identical runs flag nothing', () => {
  const rows = compareRuns([rec(), rec(), rec()], [rec(), rec(), rec()])
  assert.ok(rows.every(r => r.flag === ''))
  assert.deepEqual(verdict({ load: rows }), [])
})

test('timing: non-overlapping and > 10% is slower', () => {
  const rows = compareRuns([rec({ scriptMs: 50 }), rec({ scriptMs: 52 })], [rec({ scriptMs: 60 }), rec({ scriptMs: 62 })])
  assert.equal(row(rows, 'scriptMs').flag, 'slower')
  assert.equal(Math.round(row(rows, 'scriptMs').deltaPct), 20)
})

test('timing: non-overlapping and > 10% lower is faster', () => {
  const rows = compareRuns([rec({ scriptMs: 60 }), rec({ scriptMs: 62 })], [rec({ scriptMs: 50 }), rec({ scriptMs: 52 })])
  assert.equal(row(rows, 'scriptMs').flag, 'faster')
})

test('timing: overlapping ranges are noise even with a big median gap', () => {
  const rows = compareRuns([rec({ scriptMs: 50 }), rec({ scriptMs: 90 })], [rec({ scriptMs: 80 }), rec({ scriptMs: 85 })])
  assert.equal(row(rows, 'scriptMs').flag, '')
})

test('timing: non-overlapping but under 10% is not flagged', () => {
  const rows = compareRuns([rec({ scriptMs: 100 }), rec({ scriptMs: 101 })], [rec({ scriptMs: 105 }), rec({ scriptMs: 106 })])
  assert.equal(row(rows, 'scriptMs').flag, '')
})

test('structural: any median difference is changed', () => {
  const rows = compareRuns([rec({ renderedRows: 30 }), rec({ renderedRows: 30 })], [rec({ renderedRows: 31 }), rec({ renderedRows: 31 })])
  assert.equal(row(rows, 'renderedRows').flag, 'changed')
})

test('structural: variation within one variant is unstable, even with equal medians', () => {
  const rows = compareRuns([rec({ linesRequests: 2 }), rec({ linesRequests: 2 }), rec({ linesRequests: 3 })], [rec(), rec(), rec()])
  assert.equal(row(rows, 'linesRequests').flag, 'unstable')
})

test('verdict lists flagged rows with scenario and direction', () => {
  const rows = compareRuns([rec({ renderedRows: 30 })], [rec({ renderedRows: 2000 })])
  assert.deepEqual(verdict({ scroll: rows }), ['scroll / renderedRows: changed (30 → 2000)'])
})
