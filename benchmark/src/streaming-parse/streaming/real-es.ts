import { createHitSplitter } from './splitter.ts'
const ES = `http://localhost:${process.env.ES_PORT || '27664'}`
const index = process.env.CAPTURE_INDEX
if (!index) { console.error('set CAPTURE_INDEX (see: curl $ES/_cat/indices)'); process.exit(1) }
const res = await fetch(`${ES}/${index}/_search`, { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'identity' }, body: JSON.stringify({ size: 10000, query: { match_all: {} } }) })
let count = 0
const sp = createHitSplitter(b => { JSON.parse(b.toString()); count++ })
// @ts-ignore web stream async iteration
for await (const chunk of res.body as any) sp.write(Buffer.from(chunk))
sp.end()
console.log(`real-es: emitted ${count} hits, splitter.total=${sp.total}`)
if (sp.total != null && count !== Math.min(sp.total, 10000)) { console.error('MISMATCH'); process.exit(1) }
console.log('real-es OK')
