import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateRows } from '../../seed.ts'

const HEAP = process.env.HEAP || '128'
const ROWS = process.env.ROWS || '200000'

// Build ONLY the string-heavy buffer in this uncapped parent process.
// Avoids makeBuffers() which also builds a 300-column "wide" buffer that overflows JSON.stringify.
// fs.readFileSync in the child returns a Buffer backed by external (non-heap) memory,
// so the raw byte payload does NOT count against --max-old-space-size in the child.
const rows = generateRows(Number(ROWS))
const hits = rows.map((r: Record<string, any>, i: number) => ({ _id: r._id ?? `id-${i}`, _score: null, sort: [i], _source: r }))
const jsonBuf = Buffer.from(JSON.stringify({ hits: { total: { value: rows.length, relation: 'eq' }, hits } }))
const tmpFile = path.join(os.tmpdir(), `survival-buf-${process.pid}.json`)
fs.writeFileSync(tmpFile, jsonBuf)

const script = new URL('./survival.ts', import.meta.url).pathname
console.log(`capped-heap survival: --max-old-space-size=${HEAP}MB, ${ROWS} rows (string-heavy, buf=${(jsonBuf.length / 1024 / 1024).toFixed(1)}MB)`)
try {
  for (const variant of ['buffered-v8', 'whole', '1000', '100', '1']) {
    const r = spawnSync(process.execPath, ['--max-old-space-size=' + HEAP, '--experimental-strip-types', '--disable-warning=ExperimentalWarning', script, variant, tmpFile], { encoding: 'utf8' })
    const ok = r.status === 0 && /OK/.test(r.stdout || '')
    const oom = /heap out of memory|Allocation failed/i.test((r.stderr || '') + (r.stdout || ''))
    console.log(`  ${variant.padEnd(12)} ${ok ? 'SURVIVED' : oom ? 'OOM' : 'FAILED(' + r.status + ')'}`)
  }
} finally {
  fs.unlinkSync(tmpFile)
}
