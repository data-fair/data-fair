import { PerformanceObserver } from 'node:perf_hooks'
import { makeBuffers } from '../buffers.ts'
import { referenceOutputSync as referenceOutput } from '../substrates/v8.ts'
import { chunked, streaming, bufferedV8, collectSink, nullSink } from './pipeline.ts'
import assert from 'node:assert/strict'

const ROWS = Number(process.env.ROWS || 10000)
const CHUNK = Number(process.env.CHUNK || 65536)
const mem = () => { const m = process.memoryUsage(); return m.heapUsed + m.external + m.arrayBuffers }

// run one variant once; return { peakLiveMb, ms, gcMs }
// Two-pass approach to avoid polluting timing with forced GCs:
//   Pass 1 (timing): no forced gc during run; records ms and natural-GC gcMs.
//   Pass 2 (peak-live): forces gc() BEFORE reading memory at each high-water point so
//     dead garbage is collected first and only the LIVE set is measured.
//     Throttled to ≤~50 gc calls (stride = max(1, floor(N/50))) so cost is bounded
//     even for K=1 which has ~ROWS flush points. Always does a final gc+read at end.
function measureRun (run: (sample: () => void) => void) {
  // Pass 1: timing (natural GC only — no forced gc during run)
  global.gc?.()
  let gcMs = 0
  const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) gcMs += e.duration })
  obs.observe({ entryTypes: ['gc'] })
  const t0 = performance.now(); run(() => {}); const ms = performance.now() - t0
  obs.disconnect()

  // Count sample() calls so we can compute the throttle stride
  let sampleCount = 0
  run(() => { sampleCount++ })
  const stride = Math.max(1, Math.floor(sampleCount / 50))

  // Pass 2: peak-live — gc() before reading memory so only live objects are counted
  global.gc?.()
  const base = mem(); let peak = base
  let callCount = 0
  run(() => {
    if ((callCount % stride) === 0) {
      global.gc?.()
      const v = mem()
      if (v > peak) peak = v
    }
    callCount++
  })
  // Always do a final gc+read at the very end of the run
  global.gc?.()
  const vFinal = mem()
  if (vFinal > peak) peak = vFinal

  return { peakLiveMb: (peak - base) / 1048576, ms, gcMs }
}
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const variants: Array<{ name: string, run: (buf: Buffer, chunks: Buffer[], d: any, sample: () => void) => void }> = [
  { name: 'buffered-v8', run: (buf, _c, d, s) => bufferedV8(buf, d, 'json', nullSink(), s) },
  ...[1, 100, 1000, Infinity].map(K => ({ name: `stream-K${K === Infinity ? 'whole' : K}`, run: (_b: Buffer, c: Buffer[], d: any, s: () => void) => streaming(c, d, 'json', K, nullSink(), s) }))
]

for (const nb of makeBuffers(ROWS)) {
  console.log(`\n=== ${nb.name} (${nb.descriptor.columns.length} cols, ${ROWS} rows) ===`)
  const ref = referenceOutput(nb.buf, nb.descriptor)
  const chunks = chunked(nb.buf, CHUNK)
  console.log('variant'.padEnd(16) + 'peakLiveMB'.padStart(12) + 'ms/iter'.padStart(10) + 'gcMs'.padStart(9))
  for (const v of variants) {
    // gate (skip buffered-v8 vs itself): streaming output must equal buffered-V8
    if (v.name !== 'buffered-v8') {
      const js = collectSink(); streaming(chunks, nb.descriptor, 'json', v.name.endsWith('whole') ? Infinity : Number(v.name.slice(8)), js.sink, () => {})
      try { assert.deepEqual(JSON.parse(js.get().toString()), JSON.parse(ref.json.toString())) } catch { console.log(`${v.name}: DISQUALIFIED`); continue }
    }
    const runs = Array.from({ length: 5 }, () => measureRun(s => v.run(nb.buf, chunks, nb.descriptor, s)))
    console.log(v.name.padEnd(16) + median(runs.map(r => r.peakLiveMb)).toFixed(1).padStart(12) + median(runs.map(r => r.ms)).toFixed(1).padStart(10) + median(runs.map(r => r.gcMs)).toFixed(1).padStart(9))
  }
}
