import assert from 'node:assert/strict'
import { PerformanceObserver, performance } from 'node:perf_hooks'
export interface Measurement { msPerIter: number; gcCount: number; gcPauseMs: number; peakRssMb: number }

export async function measure (fn: () => Promise<unknown>, warmup = 5, iters = 30): Promise<Measurement> {
  for (let i = 0; i < warmup; i++) await fn()
  let gcCount = 0; let gcPauseMs = 0
  const obs = new PerformanceObserver(list => { for (const e of list.getEntries()) { gcCount++; gcPauseMs += e.duration } })
  obs.observe({ entryTypes: ['gc'] })
  global.gc?.()
  let peakRss = process.memoryUsage().rss
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) { await fn(); const rss = process.memoryUsage().rss; if (rss > peakRss) peakRss = rss }
  const totalMs = performance.now() - t0
  obs.disconnect()
  return { msPerIter: totalMs / iters, gcCount, gcPauseMs, peakRssMb: peakRss / 1048576 }
}
export function checkEquivalence (ref: { json: Buffer, csv: Buffer }, got: { json: Buffer, csv: Buffer }) {
  let jsonOk = false
  try { assert.deepEqual(JSON.parse(got.json.toString()), JSON.parse(ref.json.toString())); jsonOk = true } catch { jsonOk = false }
  return { jsonOk, csvOk: ref.csv.equals(got.csv) }   // JSON: deep-equal (key order irrelevant); CSV: byte-equal
}

export function printTable (rows: Array<{ substrate: string, task: string } & Measurement>): void {
  console.log('\nsubstrate'.padEnd(18) + 'task'.padEnd(8) + 'ms/iter'.padStart(10) + 'gc#'.padStart(7) + 'gcPause'.padStart(10) + 'peakRSS'.padStart(10))
  for (const r of rows) {
    console.log(r.substrate.padEnd(18) + r.task.padEnd(8) + r.msPerIter.toFixed(2).padStart(10) + String(r.gcCount).padStart(7) + (r.gcPauseMs.toFixed(1) + 'ms').padStart(10) + (r.peakRssMb.toFixed(0) + 'MB').padStart(10))
  }
}
