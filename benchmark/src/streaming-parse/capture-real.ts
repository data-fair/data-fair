import fs from 'node:fs'
import path from 'node:path'
const ES = `http://localhost:${process.env.ES_PORT || '27664'}`
const index = process.env.CAPTURE_INDEX // e.g. 'dataset-development-<id>'
if (!index) { console.error('set CAPTURE_INDEX to a fixtures dataset ES index (see: curl $ES/_cat/indices)'); process.exit(1) }
const res = await fetch(`${ES}/${index}/_search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: 10000, query: { match_all: {} } }) })
const buf = Buffer.from(await res.arrayBuffer())
const dir = path.resolve(import.meta.dirname, 'fixtures'); fs.mkdirSync(dir, { recursive: true })
const out = path.join(dir, 'real-capture.json'); fs.writeFileSync(out, buf)
console.log(`saved ${buf.length} bytes to ${out} (${JSON.parse(buf.toString()).hits.hits.length} hits)`)
