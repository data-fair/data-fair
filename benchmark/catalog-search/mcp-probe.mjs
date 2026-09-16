// What an agent gets from a live Data Fair MCP server today: the tool surface, then a few hard
// catalog searches through search/list_datasets.
//
//   node benchmark/catalog-search/mcp-probe.mjs [https://opendata.koumoul.com/mcp-server/datasets/mcp]

const url = process.argv[2] ?? 'https://opendata.koumoul.com/mcp-server/datasets/mcp'
let id = 0
let session

const call = async (method, params = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(session ? { 'mcp-session-id': session } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
  })
  session ??= res.headers.get('mcp-session-id') ?? undefined
  const text = await res.text()
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 200)}`)
  // streamable HTTP may answer as SSE; take the last data: line
  const json = res.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).pop()
    : text
  const parsed = JSON.parse(json)
  if (parsed.error) throw new Error(`${method}: ${JSON.stringify(parsed.error)}`)
  return parsed.result
}

const init = await call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'probe', version: '0' } })
console.log(`server: ${init.serverInfo.name} ${init.serverInfo.version}`)
await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': session }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })

const { tools } = await call('tools/list')
console.log('\n## tools')
for (const t of tools) console.log(`- ${t.name}(${Object.keys(t.inputSchema?.properties ?? {}).join(', ')})`)

const listTool = tools.find(t => t.name === 'list_datasets' || t.name === 'search_datasets')?.name
const queries = process.argv.slice(3).length ? process.argv.slice(3) : ['logements sociaux', 'HLM', 'DPE', 'communes', 'les entreprises de la région']
console.log(`\n## ${listTool} on hard queries`)
for (const q of queries) {
  const r = await call('tools/call', { name: listTool, arguments: { q, size: 5 } })
  const sc = r.structuredContent ?? {}
  console.log(`\n### q="${q}" → count ${sc.count ?? '?'}`)
  for (const d of (sc.results ?? []).slice(0, 5)) console.log(`  - ${d.title}`)
}
