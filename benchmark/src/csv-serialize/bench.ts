/*
 * Micro-benchmark: CSV serialisation strategies.
 *
 * Compares the current implementations used in api/src/datasets/utils/outputs.js
 * against fast-csv and against schema-aware JIT-compiled serializers built in
 * the same spirit as api/src/datasets/utils/flatten.ts.
 *
 * Run with:
 *   npm -w @data-fair/data-fair-benchmark run benchmark-csv
 *
 * Or directly:
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning \
 *     benchmark/src/csv-serialize/bench.ts
 */

import { stringify as csvStrSync } from 'csv-stringify/sync'
import { stringify as csvStrStream } from 'csv-stringify'
import { writeToString as fastCsvWriteToString } from '@fast-csv/format'
import { Readable, Writable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { schema, makeRows, type SchemaProp } from './schema.ts'
import { compileJitBulk, compileJitRow } from './jit.ts'
import { compileCsvNoCache as compileProdJit } from '../../../api/src/datasets/utils/csv-jit.ts'

if (typeof global.gc !== 'function') {
  console.error('this benchmark needs --expose-gc; re-run with the script in package.json')
  process.exit(1)
}
const gc = global.gc as () => void

// ---- csv-stringify options as used by results2csv / csvStreams -----------

const csvStringifyOpts = (s: SchemaProp[]) => ({
  bom: true,
  columns: s.map(p => ({ key: p.key, header: p['x-originalName'] || p.key })),
  header: true,
  quoted_string: true as const,
  delimiter: ',',
  cast: {
    boolean: (v: any) => (v === true ? '1' : v === false ? '0' : '')
  }
})

// ---- candidates ----------------------------------------------------------

type Candidate = {
  name: string
  // returns the serialized CSV (or its length, for streams)
  run: (rows: Record<string, any>[]) => Promise<{ output: string | Buffer; len: number }>
  setup?: () => void
}

const candidates = (s: SchemaProp[]): Candidate[] => {
  const opts = csvStringifyOpts(s)

  // streaming candidates capture the compiled artifacts in closure so we don't
  // re-build them each call (mirrors how the real code uses memoize).
  const jitBulk = compileJitBulk(s)
  const jitRow = compileJitRow(s)

  // production csv-jit module — schema-driven, no runtime typeof check
  const prodCols = s.map(p => ({
    key: p.key,
    header: p['x-originalName'] || p.key,
    type: (p.type === 'string' || p.type === 'integer' || p.type === 'number' || p.type === 'boolean') ? p.type : undefined
  }))
  const prodJit = compileProdJit(prodCols as any, { bom: true, header: true, delimiter: ',', newline: '\n' })

  return [
    {
      name: 'csv-stringify/sync (current results2csv)',
      run: async (rows) => {
        // post-replace \0 like the real code does
        const out = csvStrSync(rows, opts).replace(/\0/g, '')
        return { output: out, len: out.length }
      }
    },
    {
      name: 'csv-stringify stream (current csvStreams)',
      run: async (rows) => {
        const stringifier = csvStrStream(opts)
        const chunks: Buffer[] = []
        await pipeline(
          Readable.from(rows, { objectMode: true }),
          stringifier,
          new Writable({
            write (chunk, _enc, cb) { chunks.push(chunk); cb() }
          })
        )
        const buf = Buffer.concat(chunks)
        return { output: buf, len: buf.length }
      }
    },
    {
      name: '@fast-csv/format writeToString',
      run: async (rows) => {
        // fast-csv doesn't write a BOM by default; closest equivalent
        const out = await fastCsvWriteToString(rows, {
          headers: s.map(p => p['x-originalName'] || p.key),
          quote: '"',
          delimiter: ',',
          quoteHeaders: true,
          // emit BOM-prefix manually to match csv-stringify
          writeBOM: true,
          // map row to ordered array
          transform: (row: any) => {
            const o: Record<string, any> = {}
            for (const p of s) {
              const v = row[p.key]
              if (p.type === 'boolean') o[p['x-originalName'] || p.key] = v === true ? '1' : v === false ? '0' : ''
              else if (v == null) o[p['x-originalName'] || p.key] = ''
              else o[p['x-originalName'] || p.key] = v
            }
            return o
          }
        } as any)
        return { output: out, len: out.length }
      }
    },
    {
      name: 'JIT bulk (compile once per schema, serialize whole array)',
      run: async (rows) => {
        const out = jitBulk(rows)
        return { output: out, len: out.length }
      }
    },
    {
      name: 'JIT per-row (compile once, called per row, manual join)',
      run: async (rows) => {
        const parts: string[] = [jitRow.bom, jitRow.header]
        for (let i = 0; i < rows.length; i++) parts.push(jitRow.row(rows[i]))
        const out = parts.join('')
        return { output: out, len: out.length }
      }
    },
    {
      name: 'JIT prod module (api/src/datasets/utils/csv-jit.ts)',
      run: async (rows) => {
        const parts: string[] = [prodJit.prologue]
        for (let i = 0; i < rows.length; i++) parts.push(prodJit.row(rows[i]))
        const out = parts.join('')
        return { output: out, len: out.length }
      }
    },
    {
      name: 'JIT stream (Transform, drop-in replacement for csvStreams)',
      run: async (rows) => {
        // production-shaped variant: feed rows through a real Transform that
        // emits Buffer chunks; this is what would actually replace csvStreams
        let emittedHeader = false
        const chunks: Buffer[] = []
        await pipeline(
          Readable.from(rows, { objectMode: true }),
          new Transform({
            writableObjectMode: true,
            readableObjectMode: false,
            transform (row: any, _enc: any, cb: any) {
              if (!emittedHeader) {
                emittedHeader = true
                this.push(jitRow.bom + jitRow.header)
              }
              this.push(jitRow.row(row))
              cb()
            }
          }),
          new Writable({
            write (chunk, _enc, cb) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
              cb()
            }
          })
        )
        const buf = Buffer.concat(chunks)
        return { output: buf, len: buf.length }
      }
    }
  ]
}

// ---- timing + memory harness --------------------------------------------

interface Result {
  name: string
  msPerOp: number
  mbPerSec: number
  bytes: number
  // memory metrics
  allocPerOpKB: number       // heap growth from one isolated iteration, GC'd before
  allocVsOutputRatio: number // allocPerOp / output bytes — 1.0 = ideal (only emit the result)
  peakHeapMB: number         // peak heapUsed delta during full run
  retainedKB: number         // heap retained per op after final GC (leak indicator)
}

const settleGc = () => { gc(); gc(); gc() }

// Measure per-op allocations by running fn() once between forced GCs.
// We discard the result reference so we don't measure the output retention.
// Repeat a few times and take the median to smooth out residual noise.
const measureAlloc = async (fn: () => Promise<{ output: string | Buffer; len: number }>): Promise<number> => {
  const samples: number[] = []
  for (let i = 0; i < 7; i++) {
    settleGc()
    const before = process.memoryUsage().heapUsed
    const r = await fn()
    const after = process.memoryUsage().heapUsed
    // r holds the output; subtract its rough JS-string footprint (UTF-16 ≈ 2 bytes/char,
    // Buffer ≈ 1 byte/byte) so we don't double-count it as transient pressure.
    const outputBytes = typeof r.output === 'string' ? r.output.length * 2 : (r.output as Buffer).length
    samples.push(Math.max(0, after - before - outputBytes))
  }
  samples.sort((a, b) => a - b)
  return samples[samples.length >> 1]
}

const measure = async (
  name: string,
  fn: () => Promise<{ output: string | Buffer; len: number }>,
  iterations: number
): Promise<Result> => {
  // warmup
  for (let i = 0; i < 3; i++) await fn()

  // baseline
  settleGc()
  const heapBaseline = process.memoryUsage().heapUsed
  let peakHeap = heapBaseline
  let bytes = 0

  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) {
    const r = await fn()
    bytes = r.len
    // sample heap roughly every 32 iters
    if ((i & 0x1f) === 0) {
      const cur = process.memoryUsage().heapUsed
      if (cur > peakHeap) peakHeap = cur
    }
  }
  const end = process.hrtime.bigint()
  const finalHeap = process.memoryUsage().heapUsed
  if (finalHeap > peakHeap) peakHeap = finalHeap

  // retained after GC: how much survives gc — should be ~0 (per op) for clean impls
  settleGc()
  const heapAfterGc = process.memoryUsage().heapUsed
  const retained = Math.max(0, heapAfterGc - heapBaseline)

  const totalMs = Number(end - start) / 1e6
  const msPerOp = totalMs / iterations
  const mbPerSec = (bytes * iterations) / (totalMs / 1000) / (1024 * 1024)

  // isolated per-op alloc measurement
  const allocPerOpBytes = await measureAlloc(fn)
  // ratio against output bytes (UTF-16-adjusted for strings)
  const outputApprox = bytes
  const allocVsOutputRatio = outputApprox > 0 ? allocPerOpBytes / outputApprox : 0

  return {
    name,
    msPerOp,
    mbPerSec,
    bytes,
    allocPerOpKB: allocPerOpBytes / 1024,
    allocVsOutputRatio,
    peakHeapMB: (peakHeap - heapBaseline) / (1024 * 1024),
    retainedKB: retained / 1024 / iterations
  }
}

const formatResults = (rows: Result[]) => {
  const base = rows.find(r => r.name.startsWith('csv-stringify/sync'))!.msPerOp
  const nameW = Math.max(...rows.map(r => r.name.length))
  const cols: [string, (r: Result) => string][] = [
    ['ms/op', r => r.msPerOp.toFixed(3)],
    ['MB/s', r => r.mbPerSec.toFixed(1)],
    ['vs sync', r => (base / r.msPerOp).toFixed(2) + 'x'],
    ['out KB', r => (r.bytes / 1024).toFixed(1)],
    ['alloc KB/op', r => r.allocPerOpKB.toFixed(1)],
    ['alloc/out', r => r.allocVsOutputRatio.toFixed(2) + 'x'],
    ['peak MB', r => r.peakHeapMB.toFixed(2)],
    ['retain KB/op', r => r.retainedKB.toFixed(3)]
  ]
  const colW = 14
  console.log()
  console.log('serializer'.padEnd(nameW) + cols.map(([h]) => h.padStart(colW)).join(''))
  console.log('-'.repeat(nameW + colW * cols.length))
  for (const r of rows) {
    console.log(r.name.padEnd(nameW) + cols.map(([, f]) => f(r).padStart(colW)).join(''))
  }
}

// ---- main ---------------------------------------------------------------

const main = async () => {
  // 200 mirrors sliceSize in results2csv. 2_000 / 20_000 are stream-sized.
  const rowCounts = [200, 2_000, 20_000]
  const iterationsByCount: Record<number, number> = {
    200: 500,
    2_000: 100,
    20_000: 20
  }

  // sanity: ensure all candidates produce roughly equivalent output for a tiny set
  const sanityRows = makeRows(5, 1)
  const sanityCandidates = candidates(schema)
  console.log('--- sanity check (5 rows) ---')
  for (const c of sanityCandidates) {
    const { output, len } = await c.run(sanityRows)
    const preview = typeof output === 'string'
      ? output.split('\n').slice(0, 2).join(' | ')
      : output.toString('utf8').split('\n').slice(0, 2).join(' | ')
    console.log(`[${len.toString().padStart(5)} bytes] ${c.name}`)
    console.log(`        ${preview.slice(0, 140)}${preview.length > 140 ? '…' : ''}`)
  }

  console.log('\nlegend:')
  console.log('  ms/op       — wall time per call (lower is better)')
  console.log('  MB/s        — output throughput')
  console.log('  vs sync     — speed ratio against csv-stringify/sync')
  console.log('  out KB      — serialized CSV size (≈ same for all impls)')
  console.log('  alloc KB/op — heap growth measured in isolation (GC before, run once, GC after)')
  console.log('                output bytes are subtracted; what remains is garbage generated by the serializer')
  console.log('  alloc/out   — ratio: how much garbage per byte of output (lower = less GC pressure)')
  console.log('  peak MB     — max heap rise during the full run (streaming impls stay low)')
  console.log('  retain KB/op— heap retained per op after a final forced GC (≈ 0 means no leak)')

  for (const n of rowCounts) {
    console.log(`\n=== ${n} rows · ${iterationsByCount[n]} iterations ===`)
    const rows = makeRows(n)
    const cands = candidates(schema)
    const results = []
    for (const c of cands) {
      const r = await measure(c.name, () => c.run(rows), iterationsByCount[n])
      results.push(r)
    }
    formatResults(results)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
