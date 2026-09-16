// Run the judged query set against the live catalog APIs — the production baseline the local
// Mongo A/B must reproduce before its other variants mean anything.
//
//   node benchmark/catalog-search/live-queries.mjs [host ...]

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { score, renderReport } from './scoring.mjs'

const { catalogs } = JSON.parse(await readFile(path.join(import.meta.dirname, 'queries.json'), 'utf8'))
const hosts = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(catalogs)
const outDir = path.join(import.meta.dirname, 'results')
await mkdir(outDir, { recursive: true })

for (const host of hosts) {
  const runs = []
  for (const query of catalogs[host]) {
    const url = new URL(`https://${host}/data-fair/api/v1/catalog/datasets`)
    url.searchParams.set('q', query.q)
    url.searchParams.set('size', '10')
    url.searchParams.set('select', 'slug')
    const data = await (await fetch(url, { headers: { accept: 'application/json' } })).json()
    runs.push({ ...query, count: data.count, top: data.results.map(r => r.slug) })
  }
  const report = renderReport(`live ${host}`, { live: runs })
  console.log(report)
  await writeFile(path.join(outDir, `live-${host}.md`), report)
  console.log(JSON.stringify(score(runs)))
}
