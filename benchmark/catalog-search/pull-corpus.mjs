// Pull the full public catalog of a few live Data Fair portals into corpus/<host>.json.
// Read-only, one request per catalog (page size is uncapped and the catalogs are small).
//
//   node benchmark/catalog-search/pull-corpus.mjs
//
// Each entry keeps the whole dataset document as the catalog API returns it (schema included),
// which is what the other scripts in this directory analyse.

import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const CATALOGS = {
  'opendata.koumoul.com': 'https://opendata.koumoul.com/data-fair/api/v1/catalog/datasets',
  'data.ademe.fr': 'https://data.ademe.fr/data-fair/api/v1/catalog/datasets',
  'opendata.enedis.fr': 'https://opendata.enedis.fr/data-fair/api/v1/catalog/datasets'
}

const dir = path.join(import.meta.dirname, 'corpus')
await mkdir(dir, { recursive: true })

for (const [host, url] of Object.entries(CATALOGS)) {
  const t0 = Date.now()
  const res = await fetch(`${url}?size=10000`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`)
  const data = await res.json()
  if (data.results.length !== data.count) throw new Error(`${host}: got ${data.results.length} of ${data.count}`)
  await writeFile(path.join(dir, `${host}.json`), JSON.stringify(data.results, null, 1))
  console.log(`${host}: ${data.count} datasets in ${Date.now() - t0}ms`)
}
