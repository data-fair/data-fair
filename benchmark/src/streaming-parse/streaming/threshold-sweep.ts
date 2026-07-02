// Two-axis threshold sweep for the streamed /lines pipeline.
//
//   Axis 1 (response SIZE): find the "activation crossover" — the response size above which
//           the streaming pipeline's CPU overhead vs the buffered reference is effectively free
//           (streamed/buffered ms ratio ≤ ~1.10 and flat). Also records peak-live memory for both
//           to confirm buffered grows with size while streamed stays ~flat.
//   Axis 2 (BATCH byte-size): at a fixed largish response, find the smallest byte-batch target that
//           is within a few % of the best ms (amortizes per-JSON.parse call overhead without paying
//           unnecessary peak memory).
//
// Byte-adaptive batching (the production variant): accumulate raw hit slices until their combined
// bytes reach the batch-byte target, then JSON.parse('[' + slices.join(',') + ']'), transform +
// serialize the batch incrementally, drop, repeat. A running byte counter is reset per flush. The
// drain uses a fresh array per flush (no Array.shift loop → no O(n²) queue drain).
//
// Methodology (do NOT repeat past mistakes):
//   * Node RELEASE, strip-types (no native build). Self-re-exec with a LARGE young gen
//     (--max-semi-space-size=256) applied UNIFORMLY to every cell so young-gen GC doesn't distort ms.
//     Never a tiny semi-space that would force GC.
//   * FAIR: buffered includes JSON.parse of the same buffer; both do the SAME transform and produce
//     the SAME output bytes. Equivalence is asserted (deepEqual) before timing — DISQUALIFY on mismatch.
//   * Median of 9 runs per cell, 3 warmups, report min/max spread. Uniform treatment.
//   * ms is the crossover metric; peak-live (gc-before-sample, two-pass) is the memory check.
//
// Run: node --expose-gc --experimental-strip-types --disable-warning=ExperimentalWarning \
//        benchmark/src/streaming-parse/streaming/threshold-sweep.ts

import { spawnSync } from 'node:child_process'
import { PerformanceObserver } from 'node:perf_hooks'
import assert from 'node:assert/strict'
import { generateRows, benchSchema } from '../../seed.ts'
import { schemaToDescriptor, type Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'
import { createHitSplitter } from './splitter.ts'
import { chunked, bufferedV8, collectSink, nullSink, type Sink } from './pipeline.ts'
import { referenceOutputSync } from '../substrates/v8.ts'

// --- self-re-exec with a large young gen so young-gen GC does not distort ms (uniform for all cells) ---
if (!process.env.__SWEEP_REEXEC) {
  const r = spawnSync(process.execPath, [
    '--expose-gc', '--experimental-strip-types', '--disable-warning=ExperimentalWarning',
    '--max-semi-space-size=256',
    import.meta.filename
  ], { stdio: 'inherit', env: { ...process.env, __SWEEP_REEXEC: '1' } })
  process.exit(r.status ?? 1)
}

// ------------------------------------------------------------------ transform helpers
// Copied verbatim from pipeline.ts (module-private there) so the byte-adaptive variant applies the
// identical flatten + multivalue-join semantics as the buffered reference.
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source)
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}
function rowJson (first: boolean, hit: any, d: Descriptor): string {
  let o = first ? '{' : ',{'; let f = true
  if (d.selectIncludesId) { o += '"_id":' + JSON.stringify(hit._id); f = false }
  for (const c of d.columns) { if (!f) o += ','; f = false; o += JSON.stringify(c.outKey) + ':' + JSON.stringify(extract(hit._source, c.sourceKey, c.separator) ?? null) }
  return o + '}'
}
function rowCsv (hit: any, d: Descriptor): string {
  return d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'
}

// ------------------------------------------------------------------ byte-adaptive streaming variant
// Mirrors the production hot loop (hits-stream.ts + lines-pipeline.ts): splitter → accumulate hit slices
// until combined bytes ≥ batchBytes → assemble as ONE Buffer + parse once → serialize the whole batch into
// one string → ONE sink.write per batch → drop → repeat. (The cheap Buffer assembly and per-batch write are
// the two "cheap optims"; the async-generator step per hit that production also removed is not modeled here
// — this variant is synchronous — so this micro is a lower bound on the real production gain.)
const OPEN = Buffer.from('['); const CLOSE = Buffer.from(']'); const COMMA = Buffer.from(',')
export function streamingBytes (chunks: Buffer[], d: Descriptor, format: 'json' | 'csv', batchBytes: number, sink: Sink, sample: () => void): void {
  if (format === 'csv') sink.write(csvHeader(d.columns))
  else sink.write('[')
  let firstRow = true
  let batch: Buffer[] = []
  let batchLen = 0
  const flush = () => {
    if (!batch.length) return
    const parts: Buffer[] = [OPEN]
    for (let i = 0; i < batch.length; i++) { if (i) parts.push(COMMA); parts.push(batch[i]) }
    parts.push(CLOSE)
    const arr = JSON.parse(Buffer.concat(parts).toString())  // only this batch materialized
    let out = ''
    for (const hit of arr) {
      if (format === 'csv') out += rowCsv(hit, d)
      else { out += rowJson(firstRow, hit, d); firstRow = false }
    }
    sink.write(out)     // one write per batch (mirrors lines-pipeline)
    batch = []          // drop batch (fresh array, no shift loop)
    batchLen = 0
    sample()            // high-water: only one batch worth of hits live here
  }
  const sp = createHitSplitter(hitBytes => {
    batch.push(Buffer.from(hitBytes))
    batchLen += hitBytes.length
    if (batchLen >= batchBytes) flush()
  })
  for (const c of chunks) sp.write(c)
  sp.end()
  flush()
  if (format !== 'csv') sink.write(']')
}

// ------------------------------------------------------------------ measurement (validated two-pass)
// Copied from bench.ts measureRun: Pass 1 = timing (natural GC only, no forced gc during run);
// Pass 2 = peak-live (forces gc BEFORE each throttled memory read so only the LIVE set is counted).
const mem = () => { const m = process.memoryUsage(); return m.heapUsed + m.external + m.arrayBuffers }
function measureRun (run: (sample: () => void) => void) {
  global.gc?.()
  let gcMs = 0
  const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) gcMs += e.duration })
  obs.observe({ entryTypes: ['gc'] })
  const t0 = performance.now(); run(() => {}); const ms = performance.now() - t0
  obs.disconnect()

  let sampleCount = 0
  run(() => { sampleCount++ })
  const stride = Math.max(1, Math.floor(sampleCount / 50))

  global.gc?.()
  const base = mem(); let peak = base
  let callCount = 0
  run(() => {
    if ((callCount % stride) === 0) { global.gc?.(); const v = mem(); if (v > peak) peak = v }
    callCount++
  })
  global.gc?.()
  const vFinal = mem(); if (vFinal > peak) peak = vFinal
  return { peakLiveMb: (peak - base) / 1048576, ms, gcMs }
}
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const RUNS = 9
const WARMUP = 3
function cell (run: (sample: () => void) => void) {
  for (let i = 0; i < WARMUP; i++) run(() => {})
  const rs = Array.from({ length: RUNS }, () => measureRun(run))
  const mss = rs.map(r => r.ms)
  return {
    ms: median(mss),
    msMin: Math.min(...mss),
    msMax: Math.max(...mss),
    peakMb: median(rs.map(r => r.peakLiveMb)),
    gcMs: median(rs.map(r => r.gcMs))
  }
}

// ------------------------------------------------------------------ buffer builder (representative schema)
// benchSchema = moderate mix: str1 (3-6 word sentence), str2 (category), num1/num2, date1, lat, lon.
const descriptor = schemaToDescriptor(benchSchema, true)
const wrapRows = (rows: Record<string, any>[]): Buffer => Buffer.from(JSON.stringify({
  hits: {
    total: { value: rows.length, relation: 'eq' },
    hits: rows.map((r, i) => ({ _id: r._id ?? `id-${i}`, _score: null, sort: [i], _source: r }))
  }
}))

// measure representative bytes/row once, then pick a row count to hit each target buffer size
const probe = wrapRows(generateRows(2000))
const bytesPerRow = probe.length / 2000
const CHUNK = 65536

function buildBuffer (targetBytes: number): { buf: Buffer, chunks: Buffer[], rows: number } {
  const rows = Math.max(4, Math.round(targetBytes / bytesPerRow))
  const buf = wrapRows(generateRows(rows))
  return { buf, chunks: chunked(buf, CHUNK), rows }
}

// equivalence gate: streamed output MUST byte/deep-equal the buffered reference, else disqualify
function assertEquivalent (chunks: Buffer[], buf: Buffer, batchBytes: number) {
  const ref = referenceOutputSync(buf, descriptor)
  const s = collectSink()
  streamingBytes(chunks, descriptor, 'json', batchBytes, s.sink, () => {})
  assert.deepEqual(JSON.parse(s.get().toString()), JSON.parse(ref.json.toString()))
}

const fmtBytes = (n: number) => n >= 1048576 ? (n / 1048576).toFixed(2) + 'MB' : (n / 1024).toFixed(0) + 'KB'

// ================================================================== AXIS 1 — response SIZE sweep
console.log(`\n# Node ${process.version}  (young gen: --max-semi-space-size=256, --expose-gc)`)
console.log(`# representative row ≈ ${bytesPerRow.toFixed(0)} bytes (benchSchema, generateRows)`)

const SIZE_TARGETS = [10 * 1024, 25 * 1024, 50 * 1024, 100 * 1024, 250 * 1024, 500 * 1024, 1048576, 2 * 1048576, 5 * 1048576]
const AXIS1_BATCH = 64 * 1024   // fixed "good" batch size in the flat region (validated by axis 2)

console.log(`\n## Axis 1 — response SIZE sweep (streamed batch = ${fmtBytes(AXIS1_BATCH)})`)
console.log(
  'size'.padEnd(9) + 'rows'.padStart(8) + 'actual'.padStart(9) +
  'buf ms'.padStart(9) + 'str ms'.padStart(9) + 'ratio'.padStart(8) +
  'buf peakMB'.padStart(12) + 'str peakMB'.padStart(12) + 'buf spread'.padStart(14) + 'str spread'.padStart(14)
)
const axis1: any[] = []
for (const target of SIZE_TARGETS) {
  const { buf, chunks, rows } = buildBuffer(target)
  assertEquivalent(chunks, buf, AXIS1_BATCH)
  const bufC = cell(s => bufferedV8(buf, descriptor, 'json', nullSink(), s))
  const strC = cell(s => streamingBytes(chunks, descriptor, 'json', AXIS1_BATCH, nullSink(), s))
  const ratio = strC.ms / bufC.ms
  axis1.push({ target, rows, actual: buf.length, buf: bufC, str: strC, ratio })
  console.log(
    fmtBytes(target).padEnd(9) + String(rows).padStart(8) + fmtBytes(buf.length).padStart(9) +
    bufC.ms.toFixed(3).padStart(9) + strC.ms.toFixed(3).padStart(9) + ratio.toFixed(2).padStart(8) +
    bufC.peakMb.toFixed(2).padStart(12) + strC.peakMb.toFixed(2).padStart(12) +
    `${bufC.msMin.toFixed(2)}-${bufC.msMax.toFixed(2)}`.padStart(14) +
    `${strC.msMin.toFixed(2)}-${strC.msMax.toFixed(2)}`.padStart(14)
  )
}

// ================================================================== AXIS 2 — BATCH byte-size sweep
const AXIS2_TARGET = 2 * 1048576   // fixed largish response
const { buf: a2buf, chunks: a2chunks, rows: a2rows } = buildBuffer(AXIS2_TARGET)
const BATCH_TARGETS = [4 * 1024, 8 * 1024, 20 * 1024, 64 * 1024, 100 * 1024, 256 * 1024, 512 * 1024]

console.log(`\n## Axis 2 — BATCH byte-size sweep (fixed response ${fmtBytes(a2buf.length)}, ${a2rows} rows)`)
// buffered reference on the same response, for context
const a2buffered = cell(s => bufferedV8(a2buf, descriptor, 'json', nullSink(), s))
console.log(`   buffered reference: ${a2buffered.ms.toFixed(3)} ms, peak ${a2buffered.peakMb.toFixed(2)}MB`)
console.log(
  'batch'.padEnd(8) + 'str ms'.padStart(9) + 'vs buf'.padStart(8) + 'peakMB'.padStart(9) +
  'gcMs'.padStart(8) + 'spread'.padStart(16)
)
const axis2: any[] = []
for (const batchBytes of BATCH_TARGETS) {
  assertEquivalent(a2chunks, a2buf, batchBytes)
  const c = cell(s => streamingBytes(a2chunks, descriptor, 'json', batchBytes, nullSink(), s))
  axis2.push({ batchBytes, c })
  console.log(
    fmtBytes(batchBytes).padEnd(8) + c.ms.toFixed(3).padStart(9) +
    (c.ms / a2buffered.ms).toFixed(2).padStart(8) + c.peakMb.toFixed(2).padStart(9) +
    c.gcMs.toFixed(1).padStart(8) + `${c.msMin.toFixed(2)}-${c.msMax.toFixed(2)}`.padStart(16)
  )
}

// ------------------------------------------------------------------ machine-readable summary (for the report)
const bestA2 = Math.min(...axis2.map(a => a.c.ms))
console.log('\n## Summary (JSON)')
console.log(JSON.stringify({
  node: process.version,
  bytesPerRow: Math.round(bytesPerRow),
  axis1: axis1.map(a => ({ target: a.target, actual: a.actual, rows: a.rows, bufMs: +a.buf.ms.toFixed(3), strMs: +a.str.ms.toFixed(3), ratio: +a.ratio.toFixed(3), bufPeakMb: +a.buf.peakMb.toFixed(2), strPeakMb: +a.str.peakMb.toFixed(2) })),
  axis2: axis2.map(a => ({ batchBytes: a.batchBytes, strMs: +a.c.ms.toFixed(3), peakMb: +a.c.peakMb.toFixed(2), withinBestPct: +(((a.c.ms - bestA2) / bestA2) * 100).toFixed(1) })),
  bufferedRefMs: +a2buffered.ms.toFixed(3)
}, null, 2))
