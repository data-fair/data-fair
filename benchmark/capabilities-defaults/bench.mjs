#!/usr/bin/env node --experimental-strip-types --disable-warning=ExperimentalWarning
// A/B bench: store size + bulk-indexing wall time, current production mapping shape ("A")
// vs this branch's new shape ("B", adds noNumericText), plus a "B2" variant on the
// code-heavy dataset that also applies the Task 5 sniffer's capability injection
// (`{ text: false, insensitive: false }`) to code-like string columns.
//
// Runs entirely against the dev Elasticsearch instance (no data-fair API upload, no dev
// process restarts): mappings are produced by the REAL branch code
// (api/src/datasets/es/operations.ts: buildIndexMappings / textAnalyzers / NEW_INDEX_SHAPE),
// the index *settings* (analyzers/normalizers) are a verbatim copy of `indexBase` from
// api/src/datasets/es/manage-indices.ts (see INDEX_BASE_SETTINGS below), and the data is
// downloaded from the public data.ademe.fr catalog via its /lines JSON API (already typed:
// numbers as JS numbers, booleans as booleans, dates as ISO strings — mirrors what the real
// indexer stores).
//
// Usage: node --experimental-strip-types --disable-warning=ExperimentalWarning bench.mjs
// Requires: dev ES reachable (see ES_ORIGIN below), network access to data.ademe.fr.
// Writes: ./data/<datasetKey>.json (cached row dump, gitignored) and ./results.json.
// Cleans up all `bench-capdefaults-*` indices it creates, even on error.

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildIndexMappings,
  textAnalyzers,
  NEW_INDEX_SHAPE
} from '../../api/src/datasets/es/operations.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const ES_ORIGIN = process.env.ES_ORIGIN ?? 'http://localhost:27528'
const ADEME_ORIGIN = 'https://data.ademe.fr/data-fair/api/v1'
const INDEX_PREFIX = 'bench-capdefaults'
const ROW_CAP = Number(process.env.BENCH_ROW_CAP) || 200_000
const BULK_BATCH = 2000

// ---- "before" shape: current production behavior (singleTextField + wordAggField already
// shipped; this branch's only mapping-emission change is noNumericText on top of that) ----
const SHAPE_A = Object.freeze({ singleTextField: true, wordAggField: true })
// "after" shape: this branch
const SHAPE_B = NEW_INDEX_SHAPE

// ---- verbatim copy of indexBase()'s settings.analysis block from
// api/src/datasets/es/manage-indices.ts (kept in sync by hand; only the analyzer/normalizer
// definitions are needed standalone here, index.number_of_shards/replicas are set separately
// per bench run) ----
const INDEX_BASE_SETTINGS = {
  analysis: {
    normalizer: {
      insensitive_normalizer: {
        type: 'custom',
        filter: ['lowercase', 'asciifolding']
      }
    },
    filter: {
      french_elision: {
        type: 'elision',
        articles_case: true,
        articles: [
          'l', 'm', 't', 'qu', 'n', 's',
          'j', 'd', 'c', 'jusqu', 'quoiqu',
          'lorsqu', 'puisqu'
        ]
      },
      french_stop: {
        type: 'stop',
        stopwords: '_french_'
      },
      french_stemmer: {
        type: 'stemmer',
        language: 'light_french'
      }
    },
    analyzer: {
      custom_french: {
        tokenizer: 'standard',
        filter: [
          'french_elision',
          'lowercase',
          'french_stop',
          'french_stemmer',
          'asciifolding'
        ]
      },
      custom_french_repeat: {
        tokenizer: 'standard',
        filter: [
          'french_elision', 'lowercase', 'keyword_repeat',
          'french_stop', 'french_stemmer', 'remove_duplicates', 'asciifolding'
        ]
      },
      custom_french_exact: {
        tokenizer: 'standard',
        filter: ['french_elision', 'lowercase', 'asciifolding']
      }
    }
  }
}

const ANALYZERS = textAnalyzers('custom_french')

// ---- same code-like heuristic as api/src/datasets/utils/operations.ts `sniff()` (copied,
// not imported, to avoid pulling in ajv/moment/slugify for a one-line check) — a string
// column is "code-like" when EVERY non-empty value matches ascii letters/digits + ._/- and
// contains at least one digit. This is exactly what api/src/datasets/utils/data-schema.ts
// `mergeFileSchema()` turns into `x-capabilities: { text: false, insensitive: false }`. ----
const CODE_REGEXP = /^[A-Za-z0-9_./-]+$/
const isCodeValue = (value) => typeof value === 'string' && CODE_REGEXP.test(value) && /\d/.test(value)
const isCodeLikeColumn = (rows, key) => {
  let sawValue = false
  for (const row of rows) {
    const v = row[key]
    if (v === null || v === undefined || v === '') continue
    sawValue = true
    if (!isCodeValue(v)) return false
  }
  return sawValue
}

// ---- datasets: 3 representative samples from data.ademe.fr's public API, picked via
// GET /datasets?select=id,slug,count,schema (see task-6-report.md for the full search log) ----
const DATASETS = [
  {
    key: 'pac-numeric',
    label: 'numeric-heavy',
    ademeId: '-p3qp8b8xestyz3f35ns-j1h',
    title: 'PAC - Campagne de mesures 100 PACs',
    slug: 'pac-campagne-de-mesures-100-pacs',
    variants: ['A', 'B']
  },
  {
    key: 'competences-acteurs-code',
    label: 'code-heavy',
    ademeId: 'pljxb0la63vv9iyp5848xioa',
    title: 'Compétences des acteurs par année',
    slug: 'competences-des-acteurs-par-annee',
    variants: ['A', 'B', 'B2']
  },
  {
    key: 'refashion-string',
    label: 'string/prose control',
    ademeId: 'zkt20z09p8jl6oix18a5kcte',
    title: 'Données EO-REFASHION',
    slug: 'donnees-eo-refashion',
    variants: ['A', 'B']
  }
]

async function esFetch (esPath, opts = {}) {
  const res = await fetch(ES_ORIGIN + esPath, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) }
  })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = text }
  if (!res.ok) throw new Error(`ES ${opts.method ?? 'GET'} ${esPath} -> ${res.status}: ${JSON.stringify(body).slice(0, 2000)}`)
  return body
}

async function fetchAdemeSchema (ademeId) {
  const res = await fetch(`${ADEME_ORIGIN}/datasets/${ademeId}`)
  if (!res.ok) throw new Error(`ademe dataset fetch failed ${res.status} for ${ademeId}`)
  const body = await res.json()
  const schema = (body.schema ?? []).filter(f => !f['x-calculated'] && !f['x-extension'])
  return { count: body.count, schema, title: body.title }
}

async function fetchAdemeRows (ademeId, cap) {
  const cacheFile = path.join(DATA_DIR, `${ademeId}.json`)
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    if (cached.length >= cap) {
      console.log(`  [cache] ${ademeId}: ${cached.length} rows from ${cacheFile}`)
      return cached.slice(0, cap)
    }
  }
  const rows = []
  let url = `${ADEME_ORIGIN}/datasets/${ademeId}/lines?size=10000`
  while (url && rows.length < cap) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`ademe lines fetch failed ${res.status} for ${ademeId}`)
    const body = await res.json()
    rows.push(...body.results)
    url = body.next && rows.length < cap ? body.next : null
    process.stdout.write(`\r  [download] ${ademeId}: ${rows.length} rows`)
  }
  process.stdout.write('\n')
  const capped = rows.slice(0, cap)
  fs.writeFileSync(cacheFile, JSON.stringify(capped))
  return capped
}

// keep only the schema's own keys (drops _id/_i/_rand/_score/_geopoint/_updatedAt etc.)
function projectRow (row, schema) {
  const doc = {}
  for (const f of schema) {
    const v = row[f.key]
    if (v !== null && v !== undefined) doc[f.key] = v
  }
  return doc
}

async function createIndex (indexName, properties, nbShards = 1) {
  await esFetch(`/${indexName}`, {
    method: 'PUT',
    body: JSON.stringify({
      settings: {
        index: {
          'mapping.total_fields.limit': 3000,
          number_of_shards: nbShards,
          number_of_replicas: 0,
          refresh_interval: -1
        },
        analysis: INDEX_BASE_SETTINGS.analysis
      },
      mappings: { dynamic: 'strict', properties }
    })
  })
}

async function bulkIndex (indexName, docs, batchSize) {
  const start = Date.now()
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    const lines = []
    for (const doc of batch) {
      lines.push(JSON.stringify({ index: { _index: indexName } }))
      lines.push(JSON.stringify(doc))
    }
    const res = await esFetch('/_bulk', { method: 'POST', body: lines.join('\n') + '\n' })
    if (res.errors) {
      const firstErr = res.items.find(it => it.index?.error)
      throw new Error(`bulk index error on ${indexName}: ${JSON.stringify(firstErr).slice(0, 1000)}`)
    }
  }
  return Date.now() - start
}

async function measureIndex (indexName) {
  await esFetch(`/${indexName}/_refresh`, { method: 'POST' })
  await esFetch(`/${indexName}/_forcemerge?max_num_segments=1`, { method: 'POST' })
  await esFetch(`/${indexName}/_refresh`, { method: 'POST' })
  const stats = await esFetch(`/_cat/indices/${indexName}?bytes=b&format=json`)
  const row = stats[0]
  return { docsCount: Number(row['docs.count']), storeBytes: Number(row['store.size']) }
}

async function deleteBenchIndices () {
  try {
    const indices = await esFetch(`/_cat/indices/${INDEX_PREFIX}-*?format=json`)
    for (const idx of indices) {
      if (!idx.index.startsWith(INDEX_PREFIX + '-')) continue // paranoia: never touch anything else
      await esFetch(`/${idx.index}`, { method: 'DELETE' })
      console.log(`  [cleanup] deleted ${idx.index}`)
    }
  } catch (err) {
    console.error('cleanup failed (non-fatal):', err.message)
  }
}

async function runDataset (ds) {
  console.log(`\n=== ${ds.title} (${ds.key}) ===`)
  const meta = await fetchAdemeSchema(ds.ademeId)
  console.log(`  ademe count: ${meta.count}, schema cols (non-calculated): ${meta.schema.length}`)
  const cap = Math.min(ROW_CAP, meta.count)
  const rows = await fetchAdemeRows(ds.ademeId, cap)
  console.log(`  using ${rows.length} rows (cap ${cap})`)

  const docs = rows.map(r => projectRow(r, meta.schema))

  // B2 schema: clone + inject the sniffer's capability shape on code-like string columns
  let schemaB2 = null
  const codeLikeCols = []
  if (ds.variants.includes('B2')) {
    schemaB2 = meta.schema.map(f => ({ ...f }))
    for (const f of schemaB2) {
      if (f.type !== 'string' || f.format === 'date' || f.format === 'date-time') continue
      if (isCodeLikeColumn(rows, f.key)) {
        f['x-capabilities'] = { ...(f['x-capabilities'] ?? {}), text: false, insensitive: false }
        codeLikeCols.push(f.key)
      }
    }
    console.log(`  B2 code-like columns (text:false, insensitive:false): ${codeLikeCols.join(', ') || '(none)'}`)
  }

  const results = { key: ds.key, label: ds.label, title: ds.title, ademeId: ds.ademeId, slug: ds.slug, rows: rows.length, ademeTotalCount: meta.count, codeLikeCols, variants: {} }

  const variantSchema = { A: meta.schema, B: meta.schema, B2: schemaB2 }
  const variantShape = { A: SHAPE_A, B: SHAPE_B, B2: SHAPE_B }

  for (const variant of ds.variants) {
    const indexName = `${INDEX_PREFIX}-${ds.key}-${variant.toLowerCase()}`
    const schema = variantSchema[variant]
    const shape = variantShape[variant]
    const { properties } = buildIndexMappings({ extensions: [] }, schema, ANALYZERS, shape)
    console.log(`  [${variant}] creating ${indexName} (shape=${JSON.stringify(shape)})`)
    await createIndex(indexName, properties)
    const wallMs = await bulkIndex(indexName, docs, BULK_BATCH)
    const { docsCount, storeBytes } = await measureIndex(indexName)
    console.log(`  [${variant}] docs=${docsCount} storeBytes=${storeBytes} wallMs=${wallMs}`)
    results.variants[variant] = { indexName, docsCount, storeBytes, wallMs }
  }

  return results
}

async function main () {
  // reachability check — never attempt to start/stop ES ourselves
  try {
    const info = await esFetch('/')
    console.log(`ES reachable at ${ES_ORIGIN}: ${info.version?.number}`)
  } catch (err) {
    console.error(`BLOCKED: dev ES not reachable at ${ES_ORIGIN}: ${err.message}`)
    process.exit(1)
  }

  const allResults = []
  try {
    for (const ds of DATASETS) {
      const r = await runDataset(ds)
      allResults.push(r)
    }
  } finally {
    await deleteBenchIndices()
  }

  const outFile = path.join(__dirname, 'results.json')
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), rowCap: ROW_CAP, bulkBatch: BULK_BATCH, results: allResults }, null, 2))
  console.log(`\nResults written to ${outFile}`)
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(1)
})
