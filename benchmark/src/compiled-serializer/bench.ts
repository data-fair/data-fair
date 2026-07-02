// Compiled fused (hit) -> jsonString serializer vs the production flatten + prepareResultItem +
// JSON.stringify per-row path for /lines json output.
//
// GOAL: measure whether baking a `new Function('hit', ...)` that emits the JSON string directly
// (for the PLAIN query fast-path: no html/thumbnail/highlight/truncate/wkt/geo_distance) beats the
// generic transform-then-stringify path, and by how much — with a strict byte-equality gate first.
//
// Measurement integrity rules (learned from prior benches here):
//   * Node RELEASE, strip-types (no native build). Self-re-exec with a LARGE young gen
//     (--max-semi-space-size=256) UNIFORMLY so young-gen GC does not distort ms.
//   * prepareResultItem MUTATES hit._source in place. Every timed run gets FRESH structuredClone
//     copies (cloning happens OUTSIDE the timed region), identically for every substrate.
//   * EQUIVALENCE GATE: compiled string === baseline string for all 10000 + adversarial hits, over
//     the plain query. DISQUALIFY (throw) on any mismatch, BEFORE timing.
//   * Median of >=7 timed runs, 3 warmups, report min/max spread.
//
// Run: node --expose-gc --experimental-strip-types --disable-warning=ExperimentalWarning \
//        benchmark/src/compiled-serializer/bench.ts

import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import path from 'node:path'

// --- self-re-exec with a large young gen (uniform for every cell) ---
if (!process.env.__CS_REEXEC) {
  const r = spawnSync(process.execPath, [
    '--expose-gc', '--experimental-strip-types', '--disable-warning=ExperimentalWarning',
    '--max-semi-space-size=256',
    import.meta.filename
  ], { stdio: 'inherit', env: { ...process.env, __CS_REEXEC: '1' } })
  process.exit(r.status ?? 1)
}

// commons.ts + flatten.ts import #config (+ marked, sanitize-html). Point node-config at the real
// api/config dir BEFORE dynamically importing them (same trick as lines-stream-parity.unit.spec.ts).
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')
const { prepareResultItem, prepareResultContext } = await import('../../../api/src/datasets/es/commons.ts') as any
const { getFlattenNoCache } = await import('../../../api/src/datasets/utils/flatten.ts') as any

// ------------------------------------------------------------------ deterministic PRNG (no Math.random/Date.now)
function mulberry32 (seed: number) {
  return function () {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------------ realistic ~18-column schema
// _id (virtual, from hit._id) + string mix + integer/number + boolean + date string + ONE nested key
// (a.b) + ONE separator (multivalued) field (tags). markdown `body` + description `note` exist so the
// RICH query (html+truncate) has real work to do.
const dataset: any = {
  id: 'cs-ds',
  slug: 'cs-ds',
  finalizedAt: '2024-01-01T00:00:00.000Z',
  schema: [
    { key: '_id', type: 'string' },
    { key: 's1', type: 'string' },
    { key: 's2', type: 'string' },
    { key: 'name', type: 'string' },
    { key: 'category', type: 'string' },
    { key: 'code', type: 'string' },
    { key: 'body', type: 'string', 'x-display': 'markdown' },
    { key: 'note', type: 'string', 'x-refersTo': 'http://schema.org/description' },
    { key: 'img', type: 'string', 'x-refersTo': 'http://schema.org/image' },
    { key: 'num_int', type: 'integer' },
    { key: 'num_float', type: 'number' },
    { key: 'ratio', type: 'number' },
    { key: 'flag', type: 'boolean' },
    { key: 'active', type: 'boolean' },
    { key: 'date', type: 'string', format: 'date' },
    { key: 'ts', type: 'string', format: 'date-time' },
    { key: 'tags', type: 'string', separator: ',' },
    { key: 'a.b', type: 'string' }
  ]
}
const publicBaseUrl = 'http://cs.example'

const WORDS = ['données', 'analyse', 'résultat', 'commune', 'région', 'emploi', 'santé', 'culture', 'budget', 'école']
const CATS = ['cat-alpha', 'cat-beta', 'cat-gamma', 'cat-delta', 'cat-epsilon']

// One ES hit: `_source` inserted in a FIXED key order (so flatten yields a fixed final key order),
// `_id`, `_score` (sometimes null). Occasionally drop optional fields (undefined -> omitted by
// JSON.stringify, which the compiled path must also omit).
const genHit = (r: () => number, i: number) => {
  const src: any = {}
  src.s1 = r() < 0.3 ? `s\n★ "${i}" \\ }{ end` : `plain sentence ${i} ${WORDS[i % WORDS.length]}`
  src.s2 = WORDS[Math.floor(r() * WORDS.length)] + ' ' + WORDS[Math.floor(r() * WORDS.length)]
  src.name = `Name ${i} ${CATS[i % CATS.length]}`
  src.category = CATS[Math.floor(r() * CATS.length)]
  src.code = `C-${(i * 2654435761) % 100000}`
  src.body = `# Title ${i}\n\n**bold** and _em_ with a [link](http://x/${i}) and text ${WORDS[i % WORDS.length]}`
  src.note = `note ${i} with, a comma and "a quote" and unicode ☂`
  src.img = `${publicBaseUrl}/api/v1/datasets/cs-ds/attachments/pic-${i}.png`
  src.num_int = Math.floor(r() * 1000000)
  src.num_float = Math.round(r() * 1000000) / 100
  src.ratio = r() * 2 - 1
  src.flag = r() < 0.5
  src.active = r() < 0.5
  src.date = `${2020 + Math.floor(r() * 5)}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`
  src.ts = `${src.date}T${String(Math.floor(r() * 24)).padStart(2, '0')}:00:00.000Z`
  // separator field: array most of the time, sometimes scalar string, sometimes absent
  const tp = r()
  if (tp < 0.7) src.tags = [`t${i % 4}`, 'b]c', 'q\\z']
  else if (tp < 0.9) src.tags = 'single-tag'
  // else absent
  // nested field present most of the time
  if (r() < 0.85) src.a = { b: `nested ${i} "${WORDS[i % WORDS.length]}"` }
  // occasionally drop optionals
  if (r() < 0.15) delete src.img
  if (r() < 0.15) delete src.note
  const hit: any = { _id: `id-${i}`, _score: r() < 0.5 ? null : Number((r() * 5).toFixed(3)), sort: [i], _source: src }
  return hit
}

// ------------------------------------------------------------------ adversarial hits (edge cases)
const adversarial = (): any[] => [
  // quotes / backslashes / newlines / unicode everywhere
  { _id: 'adv-0', _score: null, _source: { s1: '"\\\n\t\r☂ é 𝕏 </b>', s2: '', name: 'x', category: 'c', code: '', body: 'b', note: 'n', img: 'i', num_int: 0, num_float: 0, ratio: -0, flag: false, active: true, date: 'd', ts: 't', tags: ['a"', 'b\\', 'c\n'], a: { b: 'nest"\\\n' } } },
  // nested absent
  { _id: 'adv-1', _score: 3.14, _source: { s1: 'a', s2: 'b', name: 'n', category: 'c', code: 'z', body: 'b', note: 'x', img: 'i', num_int: 42, num_float: 1.5, ratio: 0.5, flag: true, active: false, date: 'd', ts: 't', tags: ['x'] } },
  // separator scalar (not array)
  { _id: 'adv-2', _score: null, _source: { s1: 'a', s2: 'b', name: 'n', category: 'c', code: 'z', body: 'b', note: 'x', img: 'i', num_int: 1, num_float: 2, ratio: 3, flag: false, active: false, date: 'd', ts: 't', tags: 'scalar-tag', a: { b: 'y' } } },
  // null-valued fields (must emit null, not omit)
  { _id: 'adv-3', _score: null, _source: { s1: null, s2: 'b', name: null, category: 'c', code: 'z', body: 'b', note: null, img: 'i', num_int: 7, num_float: 8, ratio: 9, flag: null, active: true, date: 'd', ts: 't', tags: null, a: { b: null } } },
  // many undefined fields (omitted) + nested parent present but a.b undefined (a = {})
  { _id: 'adv-4', _score: 0, _source: { s1: 'only', num_int: 5, tags: [], a: {} } },
  // tags empty array -> join('') = '' ; ratio -0 ; big + small numbers
  { _id: 'adv-5', _score: 1e-7, _source: { s1: 'n', s2: 'n', name: 'n', category: 'n', code: 'n', body: 'n', note: 'n', img: 'n', num_int: 123456789, num_float: 0.1 + 0.2, ratio: -0, flag: true, active: false, date: 'd', ts: 't', tags: [], a: { b: 'z' } } },
  // number edge: very large integer, negative float
  { _id: 'adv-6', _score: null, _source: { s1: 'n', num_int: 9007199254740991, num_float: -123.456, ratio: 1e21, flag: false, active: true, tags: 'x', a: { b: '𝕏 unicode astral' } } },
  // _score undefined (must be omitted, matching prepareResultItem res._score = undefined)
  { _id: 'adv-7', _source: { s1: 'noscore', num_int: 1, tags: ['a'], a: { b: 'b' } } }
]

// ================================================================== the COMPILED serializer (prototype)
// A memoizable compiler: for the PLAIN query (query has none of html/thumbnail/highlight/truncate/wkt/
// geo_distance), emit `new Function('hit', code)` returning the JSON string directly. Column key order is
// derived ONCE at compile time by running the REAL flatten on a fully-populated probe (guarantees the same
// insertion order flatten+JSON.stringify produces), then _score and (if selectIncludesId) _id appended.
//
// encMode 'json'  -> JSON.stringify(value) per value.
// encMode 'typed' -> inline typed ternary (String() for numbers, literal for bool, JSON.stringify only
//                    for strings/objects). Faster where numbers/bools dominate; strings still escaped by
//                    JSON.stringify so escaping stays byte-identical.
const PLAIN_BLOCKERS = ['html', 'thumbnail', 'highlight', 'truncate', 'wkt', 'geo_distance', '_c_geo_distance', 'draft']
const isPlainQuery = (query: Record<string, any>) => !PLAIN_BLOCKERS.some(k => query[k] != null && query[k] !== '')

const encExpr = (v: string, mode: 'json' | 'typed') => {
  if (mode === 'json') return `JSON.stringify(${v})`
  // typed: number (guard NaN/Infinity -> 'null', -0 -> '0' via ''+v which yields '0') / string / boolean / null / fallback
  return `(typeof ${v}==='number'?(${v}===${v}&&${v}!==Infinity&&${v}!==-Infinity?''+${v}:'null'):typeof ${v}==='string'?JSON.stringify(${v}):typeof ${v}==='boolean'?(${v}?'true':'false'):${v}===null?'null':JSON.stringify(${v}))`
}

const compileSerializer = (dataset: any, query: Record<string, any>, mode: 'json' | 'typed') => {
  const ctx = prepareResultContext(dataset, query)
  const flatten = getFlattenNoCache(dataset, query.arrays === 'true')

  // derive the exact post-flatten key order from a fully-populated probe
  const probeSrc: any = {}
  for (const f of dataset.schema) {
    if (f.key === '_id') continue
    if (f.key.includes('.')) { const [p, c] = f.key.split('.'); probeSrc[p] = { ...(probeSrc[p] || {}), [c]: 'x' } } else if (f.separator) probeSrc[f.key] = ['x', 'y']
    else probeSrc[f.key] = 'x'
  }
  const flatProbe = flatten(structuredClone(probeSrc))
  const order: string[] = Object.keys(flatProbe) // source-derived keys, in flatten's final order

  const sepByKey = new Map<string, string>()
  for (const f of dataset.schema) if (f.separator) sepByKey.set(f.key, f.separator)

  let code = 'const src=hit._source;let s="{";let sep="";\n'
  for (const key of order) {
    const kp = JSON.stringify(JSON.stringify(key) + ':') // safely-embedded `"key":`
    if (sepByKey.has(key)) {
      const sep = sepByKey.get(key)!
      code += `{let v=src[${JSON.stringify(key)}];if(Array.isArray(v))v=v.join(${JSON.stringify(sep)});if(v!==undefined){s+=sep+${kp}+${encExpr('v', mode)};sep=",";}}\n`
    } else if (key.includes('.')) {
      const [p, c] = key.split('.')
      code += `{let v=src[${JSON.stringify(key)}];if(v===undefined){const pp=src[${JSON.stringify(p)}];v=pp==null?undefined:pp[${JSON.stringify(c)}];}if(v!==undefined){s+=sep+${kp}+${encExpr('v', mode)};sep=",";}}\n`
    } else {
      code += `{const v=src[${JSON.stringify(key)}];if(v!==undefined){s+=sep+${kp}+${encExpr('v', mode)};sep=",";}}\n`
    }
  }
  // _score (prepareResultItem sets res._score = hit._score unconditionally; undefined -> omitted by stringify)
  code += `{const v=hit._score;if(v!==undefined){s+=sep+"\\"_score\\":"+${encExpr('v', mode)};sep=",";}}\n`
  // _id (only when selectIncludesId)
  if (ctx.selectIncludesId) code += '{const v=hit._id;if(v!==undefined){s+=sep+"\\"_id\\":"+JSON.stringify(v);sep=",";}}\n'
  code += 'return s+"}";'

  // eslint-disable-next-line no-new-func
  const fn = new Function('hit', code) as (hit: any) => string
  return { fn, code }
}

// ================================================================== equivalence gate
const query: Record<string, any> = {} // plain
const richQuery: Record<string, any> = { html: 'true', truncate: '20' }

const baselineStr = (hit: any) => {
  const ctx = prepareResultContext(dataset, query)
  const flatten = getFlattenNoCache(dataset, query.arrays === 'true')
  return JSON.stringify(prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, ctx))
}

console.log(`\n# Node ${process.version}  (--max-semi-space-size=256, --expose-gc)`)
assert.ok(isPlainQuery(query), 'plain query must be plain')
assert.ok(!isPlainQuery(richQuery), 'rich query must NOT be plain')

const { fn: compiledJson, code: sampleCode } = compileSerializer(dataset, query, 'json')
const { fn: compiledTyped } = compileSerializer(dataset, query, 'typed')

const N = 10000
const r = mulberry32(12345)
const pristine: any[] = Array.from({ length: N }, (_, i) => genHit(r, i)).concat(adversarial())

let gateChecked = 0
for (const h of pristine) {
  const want = baselineStr(structuredClone(h)) // fresh clone (baseline mutates)
  const gotJson = compiledJson(structuredClone(h))
  const gotTyped = compiledTyped(structuredClone(h))
  if (gotJson !== want) { console.error('CODE:\n' + sampleCode); throw new Error(`GATE FAIL (json) id=${h._id}\n want: ${want}\n got:  ${gotJson}`) }
  if (gotTyped !== want) throw new Error(`GATE FAIL (typed) id=${h._id}\n want: ${want}\n got:  ${gotTyped}`)
  gateChecked++
}
console.log(`# equivalence gate PASSED: ${gateChecked} hits (10000 + ${adversarial().length} adversarial), compiled(json) === compiled(typed) === baseline`)

// ================================================================== measurement
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const RUNS = 9
const WARMUP = 3

// Each timed run gets a FRESH deep clone of the input set (cloning is OUTSIDE the timed region), so the
// mutating baseline never sees an already-flattened object twice. Identical treatment for every substrate.
function timeSubstrate (label: string, work: (hits: any[]) => number) {
  const mss: number[] = []
  for (let run = 0; run < WARMUP + RUNS; run++) {
    const hits = pristine.map(h => structuredClone(h)) // not timed
    global.gc?.()
    const t0 = performance.now()
    const acc = work(hits)
    const ms = performance.now() - t0
    if (acc < 0) throw new Error('unreachable') // keep acc alive
    if (run >= WARMUP) mss.push(ms)
  }
  return { label, ms: median(mss), min: Math.min(...mss), max: Math.max(...mss) }
}

// substrates ------------------------------------------------------
const runBaselineFull = (hits: any[]) => {
  const ctx = prepareResultContext(dataset, query)
  const flatten = getFlattenNoCache(dataset, query.arrays === 'true')
  let acc = 0
  for (const h of hits) acc += JSON.stringify(prepareResultItem(h, dataset, query, flatten, publicBaseUrl, ctx)).length
  return acc
}
const runBaselineTransform = (hits: any[]) => { // flatten + prepareResultItem, no stringify
  const ctx = prepareResultContext(dataset, query)
  const flatten = getFlattenNoCache(dataset, query.arrays === 'true')
  let acc = 0
  for (const h of hits) { const o = prepareResultItem(h, dataset, query, flatten, publicBaseUrl, ctx); acc += o._score === null ? 0 : 1 }
  return acc
}
const runFlattenOnly = (hits: any[]) => {
  const flatten = getFlattenNoCache(dataset, query.arrays === 'true')
  let acc = 0
  for (const h of hits) { const o = flatten(h._source); acc += o.s1 ? 1 : 0 }
  return acc
}
const runCompiled = (fn: (h: any) => string) => (hits: any[]) => {
  let acc = 0
  for (const h of hits) acc += fn(h).length
  return acc
}
const runBaselineRich = (hits: any[]) => {
  const ctx = prepareResultContext(dataset, richQuery)
  const flatten = getFlattenNoCache(dataset, richQuery.arrays === 'true')
  let acc = 0
  for (const h of hits) acc += JSON.stringify(prepareResultItem(h, dataset, richQuery, flatten, publicBaseUrl, ctx)).length
  return acc
}

const results: any[] = []
const push = (rr: any) => { results.push(rr); return rr }

console.log('\n## Per-substrate median ms per 10000-row serialize (9 timed runs, 3 warmup)')
const rows = [
  timeSubstrate('flatten-only', runFlattenOnly),
  timeSubstrate('flatten+prepareResultItem (transform, no stringify)', runBaselineTransform),
  timeSubstrate('BASELINE-plain (transform + JSON.stringify)', runBaselineFull),
  timeSubstrate('COMPILED-plain (json-encode: JSON.stringify per value)', runCompiled(compiledJson)),
  timeSubstrate('COMPILED-plain (typed-encode: inline ternary)', runCompiled(compiledTyped)),
  timeSubstrate('BASELINE-rich (html=true + truncate=20)', runBaselineRich)
]
rows.forEach(push)
const w = Math.max(...rows.map(x => x.label.length))
for (const x of rows) console.log(`  ${x.label.padEnd(w)}  ${x.ms.toFixed(3).padStart(9)} ms   [${x.min.toFixed(2)}-${x.max.toFixed(2)}]`)

const base = rows[2].ms
const cj = rows[3].ms
const ct = rows[4].ms
const rich = rows[5].ms
console.log('\n## Win factors (baseline-plain / compiled-plain)')
console.log(`  vs COMPILED json-encode : ${(base / cj).toFixed(2)}x`)
console.log(`  vs COMPILED typed-encode: ${(base / ct).toFixed(2)}x`)
console.log('\n## Breakdown of baseline-plain')
console.log(`  flatten-only                    : ${rows[0].ms.toFixed(3)} ms`)
console.log(`  flatten+prepareResultItem       : ${rows[1].ms.toFixed(3)} ms`)
console.log(`  full (+JSON.stringify)          : ${base.toFixed(3)} ms`)
console.log(`  -> generic JSON.stringify share : ${(base - rows[1].ms).toFixed(3)} ms (${(100 * (base - rows[1].ms) / base).toFixed(0)}%)`)
console.log(`  -> transform share              : ${(rows[1].ms).toFixed(3)} ms (${(100 * rows[1].ms / base).toFixed(0)}%)`)
console.log(`\n## Rich per-row cost: baseline-rich ${rich.toFixed(3)} ms vs baseline-plain ${base.toFixed(3)} ms  (${(rich / base).toFixed(1)}x)`)

console.log('\n## Summary (JSON)')
console.log(JSON.stringify({
  node: process.version,
  rows: N,
  flattenOnlyMs: +rows[0].ms.toFixed(3),
  transformMs: +rows[1].ms.toFixed(3),
  baselinePlainMs: +base.toFixed(3),
  compiledJsonMs: +cj.toFixed(3),
  compiledTypedMs: +ct.toFixed(3),
  baselineRichMs: +rich.toFixed(3),
  winJson: +(base / cj).toFixed(3),
  winTyped: +(base / ct).toFixed(3),
  stringifyShareMs: +(base - rows[1].ms).toFixed(3),
  richVsPlain: +(rich / base).toFixed(2)
}, null, 2))
