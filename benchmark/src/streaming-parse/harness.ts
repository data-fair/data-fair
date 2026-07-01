import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
export interface Measurement { msPerIter: number; bytesPerIter: number; peakRssMb: number }

// Total live memory: heap + off-heap (Buffers / ArrayBuffers). Output Buffers and
// large strings live off young-gen, so counting GC events reports 0; measuring the
// delta of this quantity across one gc()-isolated iteration captures real allocation.
function mem (): number { const m = process.memoryUsage(); return m.heapUsed + m.external + m.arrayBuffers }

function median (xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export async function measure (fn: () => Promise<unknown>, warmup = 5, iters = 30, allocSamples = 7): Promise<Measurement> {
  for (let i = 0; i < warmup; i++) await fn()

  // --- allocation metric: bytes retained across one gc()-isolated iteration ---
  // gc() before, do NOT gc during the single iteration; provided the young gen is
  // large enough that no scavenge fires mid-iteration (run with --max-semi-space-size=128),
  // b1-b0 approximates everything this iteration allocated (heap + off-heap).
  const allocs: number[] = []
  for (let i = 0; i < allocSamples; i++) {
    global.gc?.()
    const b0 = mem()
    await fn()
    const b1 = mem()
    allocs.push(b1 - b0)
  }
  const bytesPerIter = median(allocs)

  // --- timing metric: separate tight loop, no gc() interference ---
  global.gc?.()
  let peakRss = process.memoryUsage().rss
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) { await fn(); const rss = process.memoryUsage().rss; if (rss > peakRss) peakRss = rss }
  const totalMs = performance.now() - t0

  return { msPerIter: totalMs / iters, bytesPerIter, peakRssMb: peakRss / 1048576 }
}
export function checkEquivalence (ref: { json: Buffer, csv: Buffer }, got: { json: Buffer, csv: Buffer }) {
  let jsonOk = false
  try { assert.deepEqual(JSON.parse(got.json.toString()), JSON.parse(ref.json.toString())); jsonOk = true } catch { jsonOk = false }
  return { jsonOk, csvOk: ref.csv.equals(got.csv) }   // JSON: deep-equal (key order irrelevant); CSV: byte-equal
}

// Format a byte count as KB or MB with a compact fixed width.
function fmtBytes (b: number): string {
  const mb = b / 1048576
  if (Math.abs(mb) >= 1) return mb.toFixed(1) + 'MB'
  return (b / 1024).toFixed(0) + 'KB'
}

export function printTable (rows: Array<{ substrate: string, task: string } & Measurement>): void {
  console.log('\nsubstrate'.padEnd(18) + 'task'.padEnd(24) + 'ms/iter'.padStart(10) + 'bytes/iter'.padStart(12) + 'peakRSS'.padStart(10))
  for (const r of rows) {
    console.log(r.substrate.padEnd(18) + r.task.padEnd(24) + r.msPerIter.toFixed(2).padStart(10) + fmtBytes(r.bytesPerIter).padStart(12) + (r.peakRssMb.toFixed(0) + 'MB').padStart(10))
  }
}
