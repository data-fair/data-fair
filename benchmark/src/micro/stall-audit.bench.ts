// Micro-benchmark: candidates from the 2026-07 event-loop stall audit (sync tasks > ~10ms
// outside the optimized /lines hot path). Each bench measures the synchronous work that ONE
// request triggers, so the number printed is the per-request main-thread stall.
//
// Run from the repo root:
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     benchmark/src/micro/stall-audit.bench.ts

import { geojsonToWKT } from '@terraformer/wkt'
import v8 from 'node:v8'
import { createHash } from 'node:crypto'
import crc from 'crc'
import stableStringify from 'fast-json-stable-stringify'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import * as parse5 from 'parse5'

dayjs.extend(utc)
dayjs.extend(timezone)

function bench (label: string, fn: () => void, runs = 5) {
  fn() // warmup (JIT)
  const times = []
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }
  const best = Math.min(...times)
  const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)]
  console.log(`${label.padEnd(72)} median ${median.toFixed(1)}ms  best ${best.toFixed(1)}ms`)
  return median
}

// ---------- helpers: synthetic data shaped like production ----------

// a polygon ring with `vertices` points (closed)
function makePolygon (vertices: number, cx: number, cy: number) {
  const coords = []
  for (let i = 0; i < vertices; i++) {
    const a = (2 * Math.PI * i) / vertices
    coords.push([cx + Math.cos(a) * 0.01, cy + Math.sin(a) * 0.01])
  }
  coords.push(coords[0])
  return { type: 'Polygon', coordinates: [coords] }
}

function makeRows (count: number, fields: number) {
  const rows = []
  for (let i = 0; i < count; i++) {
    const row: Record<string, any> = {}
    for (let f = 0; f < fields; f++) row[`field${f}`] = f % 3 === 2 ? i * f : `value-${i}-${f}`
    rows.push(row)
  }
  return rows
}

// ---------- A. format=wkt : result2wkt over a full page (geo.ts:247) ----------
console.log('\n--- A. GET /lines?format=wkt — monolithic geojsonToWKT of the page ---')
{
  const hits10k = Array.from({ length: 10000 }, (_, i) => ({ _source: { _geoshape: makePolygon(100, i % 180, (i * 7) % 80) } }))
  const hits1k = Array.from({ length: 1000 }, (_, i) => ({ _source: { _geoshape: makePolygon(1000, i % 180, (i * 7) % 80) } }))
  const result2wkt = (esResponse: any) => geojsonToWKT({
    type: 'GeometryCollection',
    geometries: esResponse.hits.hits.map((hit: any) => hit._source._geoshape).filter((g: any) => !!g)
  })
  bench('10000 polygons x 100 vertices (size=10000, parcel-like)', () => { result2wkt({ hits: { hits: hits10k } }) })
  bench('1000 polygons x 1000 vertices (size=1000, commune-like)', () => { result2wkt({ hits: { hits: hits1k } }) })
}

// ---------- B. ?wkt=true : per-hit raw-geometry JSON.parse + geojsonToWKT (commons.ts:704) ----------
console.log('\n--- B. ?wkt=true — per-500-row batch cost (pipeline yields every 500) ---')
{
  const rawGeom5k = JSON.stringify(makePolygon(5000, 2, 45))
  const geoshape500 = makePolygon(500, 2, 45)
  bench('500 rows: JSON.parse(raw 5k-vertex geom) + 2x geojsonToWKT', () => {
    for (let i = 0; i < 500; i++) {
      const g = JSON.parse(rawGeom5k)
      geojsonToWKT(g)
      geojsonToWKT(geoshape500)
    }
  })
}

// ---------- C. xlsx/ods export : piscina structured clone of the rows array (outputs.ts:100) ----------
console.log('\n--- C. format=xlsx/ods — v8.serialize (~postMessage clone) of the collected rows ---')
{
  const payload10k50 = { results: makeRows(10000, 50), bookType: 'xlsx', query: {}, dataset: { schema: makeRows(50, 8) } }
  const payload10k300 = { results: makeRows(10000, 300), bookType: 'xlsx', query: {}, dataset: { schema: makeRows(300, 8) } }
  bench('10000 rows x 50 fields', () => { v8.serialize(payload10k50) })
  bench('10000 rows x 300 fields', () => { v8.serialize(payload10k300) })
}

// ---------- D. vector tile vtPrepared/max : clone of the FeatureCollection (tiles.ts:31) ----------
console.log('\n--- D. format=pbf (vtPrepared/max sampling) — v8.serialize of the geojson graph ---')
{
  const features = Array.from({ length: 10000 }, (_, i) => ({
    type: 'Feature', geometry: makePolygon(30, i % 180, (i * 7) % 80), properties: { id: i, name: `feat-${i}`, _vt: 'x'.repeat(200) }
  }))
  const fc = { type: 'FeatureCollection', features }
  console.log(`   (payload ~${(JSON.stringify(fc).length / 1e6).toFixed(1)} MB as JSON)`)
  bench('10000 features x 30-vertex polygons + _vt blobs', () => { v8.serialize(fc) })
}

// ---------- E. buffered res.json residue : big stringify + etag sha1 ----------
console.log('\n--- E. buffered res.send/res.json — JSON.stringify + weak-ETag sha1 ---')
{
  const odsResults = makeRows(20000, 10) // ODS grouped records, limit=20000
  const dcat = { '@context': {}, dataset: makeRows(10000, 12) } // /catalog/dcat at the 10k cap
  let body = ''
  bench('ODS grouped records: stringify 20000 results x 10 fields', () => { body = JSON.stringify({ total_count: 20000, results: odsResults }) })
  bench('DCAT catalog: stringify 10000 dataset entries', () => { JSON.stringify(dcat) })
  bench(`etag sha1 over the ${(body.length / 1e6).toFixed(1)}MB ODS body`, () => { createHash('sha1').update(body, 'utf8').digest('base64') })
}

// ---------- F. pre-auth body parse : express.json 1MB limit (app.js:87) ----------
console.log('\n--- F. express.json — JSON.parse of a 1MB body (runs before auth) ---')
{
  const arr: any[] = []
  while (JSON.stringify(arr).length < 1_000_000) arr.push({ key: 'k' + arr.length, value: arr.length, label: 'some label text' })
  const flat = JSON.stringify(arr)
  bench('1MB array-of-small-objects', () => { JSON.parse(flat) })
}

// ---------- G. _bulk_lines patch/delete : O(N^2) operations.find scans (rest.ts:504+) ----------
console.log('\n--- G. _bulk_lines patch bulk — O(N^2) find scans + per-line getLineHash, N=1000 ---')
{
  const N = 1000
  const makeOps = () => Array.from({ length: N }, (_, i) => ({ _id: `line-${i}`, body: { a: i }, fullBody: { a: i } as Record<string, any>, _status: 0 }))
  const previousBodies = makeRows(N, 100) // 100-field schema lines coming back from mongo
  const getLineHash = (line: any) => crc.crc32(stableStringify(line)).toString(16)
  bench('patch loop as written: N x operations.find(op => op._id === _id) + hash', () => {
    const operations = makeOps()
    for (let i = 0; i < N; i++) {
      const _id = `line-${N - 1 - i}` // mongo order != operations order (worst-ish case)
      const operation = operations.find(op => op._id === _id)
      if (operation) {
        operation.body = { ...previousBodies[i], ...operation.body }
        Object.assign(operation.fullBody, operation.body)
        operation.fullBody._hash = getLineHash(operation.body)
      }
    }
  })
  bench('same with a Map index (fix shape) ', () => {
    const operations = makeOps()
    const byId = new Map(operations.map(op => [op._id, op]))
    for (let i = 0; i < N; i++) {
      const operation = byId.get(`line-${N - 1 - i}`)
      if (operation) {
        operation.body = { ...previousBodies[i], ...operation.body }
        Object.assign(operation.fullBody, operation.body)
        operation.fullBody._hash = getLineHash(operation.body)
      }
    }
  })
  bench('getLineHash alone x 1000 lines x 100 fields', () => {
    for (let i = 0; i < N; i++) getLineHash(previousBodies[i])
  })
}

// ---------- H. ODS date_transform : per-row dayjs().tz().format() (ods/operations.ts:208) ----------
console.log('\n--- H. ODS date_format() transform — per-500-row batch (iterHits yields every 500) ---')
{
  const dates = Array.from({ length: 500 }, (_, i) => new Date(1600000000000 + i * 86400000).toISOString())
  bench('500 rows: format-regex + dayjs(d).tz(tz).format(fmt)', () => {
    for (const d of dates) {
      const dayjsFormat = 'dd/MM/yyyy'.replace(/yy/g, 'YY').replace(/d/g, 'D')
      dayjs(d).tz('Europe/Paris').format(dayjsFormat)
    }
  })
  const cached = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })
  bench('500 rows: cached Intl.DateTimeFormat (fix shape)', () => {
    for (const d of dates) cached.format(new Date(d))
  })
}

// ---------- I. values_agg : nested bucket walk + response stringify (values-agg.ts:237, read.ts:490) ----------
console.log('\n--- I. values_agg — 1000x100 nested buckets (size=0 evades the 100k cap) ---')
{
  // synthetic ES agg response: level1 1000 buckets x level2 100 buckets
  const makeAggResponse = () => ({
    values: {
      buckets: Array.from({ length: 1000 }, (_, i) => ({
        key: `val-${i}`,
        doc_count: 100,
        card: { value: 100 },
        values: { buckets: Array.from({ length: 100 }, (_, j) => ({ key: `sub-${j}`, doc_count: 1, card: { value: 1 } })) }
      }))
    }
  })
  const resp = makeAggResponse()
  const recurse = (agg: any): any => agg.values.buckets.map((b: any) => {
    const aggItem: any = { total: b.doc_count, value: b.key_as_string ?? b.key, results: [] }
    if (b.values) aggItem.aggs = recurse(b)
    for (const key of Object.keys(b)) { if (key.startsWith('extra_metric_')) aggItem[key.replace('extra_metric_', '')] = b[key].value }
    return aggItem
  })
  let tree: any
  bench('recurse walk over 100k leaf buckets', () => { tree = { aggs: recurse(resp) } })
  bench('res.send stringify of the resulting tree', () => { JSON.stringify(tree) })
  const rawResponse = JSON.stringify(resp)
  console.log(`   (ES response ~${(rawResponse.length / 1e6).toFixed(1)} MB)`)
  bench('ES client JSON.parse of the raw agg response', () => { JSON.parse(rawResponse) })
}

// ---------- J. app open : parse5 rewrite + config stringify (applications/proxy.ts:148) ----------
console.log('\n--- J. GET /app/:id — parse5 parse+serialize + JSON.stringify(application) per open ---')
{
  const html = '<!doctype html><html><head><title>app</title>' +
    Array.from({ length: 60 }, (_, i) => `<link rel="preload" href="/asset-${i}.js"><meta name="m${i}" content="v${i}">`).join('') +
    '</head><body><div id="app"></div>' + Array.from({ length: 40 }, (_, i) => `<script src="/chunk-${i}.js"></script>`).join('') + '</body></html>'
  const bigConfig = { configuration: makeRows(300, 15) } // ~large dashboard config
  console.log(`   (html ${(html.length / 1e3).toFixed(1)}KB, config ~${(JSON.stringify(bigConfig).length / 1e3).toFixed(0)}KB)`)
  bench('parse5.parse + serialize + stringify(bigConfig)', () => {
    const doc = parse5.parse(html)
    JSON.stringify(bigConfig)
    parse5.serialize(doc)
  })
}
