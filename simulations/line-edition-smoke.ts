/**
 * Model-free smoke of the line edition arms (simulations/line-edition.sim.spec.ts): the tools a model
 * would call, called by this script on the real mcp server, as test_user1 with a cookie session in
 * test_org1. It spends no quota, so it is where an arm that cannot work is found, before any paid run.
 *
 * The editor's master-data suggestions are the credential check: the communes referential is private
 * to test_org1, so `getFieldSuggestions` only answers when the editor's fetch carries the caller's
 * credentials to the same data-fair.
 *
 * Resets the dev environment's test state (clean()), seeds a register of its own, flips the arm
 * switch and sets it back to null at the end. Exits 1 when a check fails. MCP_URL points it at another
 * mcp server, a local one being debugged for instance (it must read the same platform document).
 *
 *   npm run simulate:line-edition-smoke
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { axiosAuth, clean, waitForWorkerIdle } from '../tests/support/axios.ts'
import { ROOT, OWNER, OWNER_USER } from './runner/settings.ts'
import { registerId, seedLineEditionDatasets } from './runner/line-edition-fixtures.ts'

type Arm = 'json' | 'editor'
type ToolResult = { text: string, isError: boolean }

const MCP_URL = process.env.MCP_URL ?? `${ROOT}/mcp-server/mcp`
const id = registerId('smoke')

const results: { check: string, pass: boolean | 'info', evidence: string }[] = []
function report (check: string, pass: boolean | 'info', evidence: string) {
  results.push({ check, pass, evidence })
  const label = pass === 'info' ? 'INFO' : pass ? 'PASS' : 'FAIL'
  console.log(`${label} ${check}\n  ${evidence.replace(/\n/g, '\n  ')}`)
}
const short = (text: string, max = 600) => text.length > max ? `${text.slice(0, max)}…` : text

const owner = await axiosAuth(`${OWNER_USER}@test.com`, OWNER.id)
const admin = await axiosAuth('test_superadmin@test.com', undefined, true)

async function connect (): Promise<Client> {
  // the session cookies of test_user1, relayed by the mcp server to data-fair on every call
  const cookie = owner.cookieJar.getCookieStringSync(`${ROOT}/mcp-server/mcp`)
  const client = new Client({ name: 'line-edition-smoke', version: '0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { cookie } } }))
  return client
}

/** Flip the arm and wait for the mcp server's refresh to serve its tools. */
async function useArm (arm: Arm): Promise<Client> {
  await admin.post('/api/v1/test-env/line-edition-arm', { arm })
  const expected = arm === 'json' ? 'datafair_write_line' : 'datafair_create_line_saveForm'
  const absent = arm === 'json' ? 'datafair_create_line_saveForm' : 'datafair_write_line'
  const deadline = Date.now() + 60_000
  for (;;) {
    const client = await connect()
    const names = (await client.listTools()).tools.map(t => t.name)
    if (names.includes(expected) && !names.includes(absent)) return client
    await client.close()
    if (Date.now() > deadline) throw new Error(`arm ${arm}: the mcp server still serves ${names.filter(n => n.includes('line')).join(', ')}`)
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

async function call (client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const res = await client.callTool({ name, arguments: args }) as { content?: { type: string, text?: string }[], isError?: boolean }
  const text = (res.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n')
  return { text, isError: !!res.isError }
}

/** The register's lines once every write is indexed and finalized, by name. */
async function lines (): Promise<Map<string, Record<string, any>>> {
  if (!await waitForWorkerIdle(60_000)) throw new Error(`${id} still processing after 60s`)
  const res = (await owner.get(`/api/v1/datasets/${id}/lines`, { params: { size: 1000, arrays: true } })).data
  return new Map(res.results.map((line: Record<string, any>) => [line.nom, line]))
}

/** Run one check; a throw is its failure, never the end of the smoke. */
async function check (name: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (err) {
    report(name, false, `threw: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const required = { association: 'Club Smoke', type_lieu: 'gymnase', date_ouverture: '2024-09-02' }

async function armJson () {
  const client = await useArm('json')
  try {
    await check('json write_line: a valid row is written', async () => {
      const res = await call(client, 'datafair_write_line', { id, body: { ...required, nom: 'Smoke JSON simple', commune: '44109' } })
      const line = (await lines()).get('Smoke JSON simple')
      report('json write_line: a valid row is written', !res.isError && !!line, `isError=${res.isError} line=${JSON.stringify(line?._id)} answer: ${short(res.text, 300)}`)
    })
    await check('json bulk_lines: per-line errors, the valid line written', async () => {
      const res = await call(client, 'datafair_bulk_lines', {
        id,
        body: [
          { ...required, nom: 'Smoke JSON bulk valide', commune: '44162' },
          { ...required, nom: 'Smoke JSON bulk invalide', commune: '44162', type_lieu: 'patinoire' }
        ]
      })
      const all = await lines()
      // the answer is rendered as markdown: "- **nbErrors**: 1", "- **line**: 1"
      const perLine = /\bline\**:\s*1\b/.test(res.text) && /type_lieu/.test(res.text) && /\bnbErrors\**:\s*1\b/.test(res.text)
      const pass = perLine && all.has('Smoke JSON bulk valide') && !all.has('Smoke JSON bulk invalide')
      report('json bulk_lines: per-line errors, the valid line written', pass, `isError=${res.isError} valid written=${all.has('Smoke JSON bulk valide')} invalid written=${all.has('Smoke JSON bulk invalide')} answer: ${short(res.text)}`)
    })
    await check('json patch_line: the phone changed, the rest kept', async () => {
      const res = await call(client, 'datafair_patch_line', { id, lineId: 'lieu-2', body: { telephone: '02 40 00 00 01' } })
      const line = (await lines()).get('Piscine Petite Amazonie')
      const pass = !res.isError && line?.telephone === '02 40 00 00 01' && line?.email === 'accueil@nantes-natation.fr'
      report('json patch_line: the phone changed, the rest kept', pass, `isError=${res.isError} telephone=${line?.telephone} email=${line?.email} answer: ${short(res.text, 300)}`)
    })
  } finally {
    await client.close()
  }
}

async function armEditor () {
  const client = await useArm('editor')
  const create = (tool: string, args: Record<string, unknown> = {}) => call(client, `datafair_create_line_${tool}`, { id, ...args })
  const edit = (tool: string, args: Record<string, unknown> = {}) => call(client, `datafair_edit_line_${tool}`, { id, lineId: 'lieu-2', ...args })
  try {
    // the mcp server keeps a caller's sessions across connections: drop what an earlier smoke left
    await create('reloadForm')
    await edit('reloadForm')
    await check('editor create describeState: commune offers suggestions', async () => {
      const res = await create('describeState')
      const communeLine = res.text.split('\n').filter(l => /commune/i.test(l)).join('\n')
      const pass = !res.isError && /commune/.test(res.text) && /suggestion/i.test(communeLine)
      report('editor create describeState: commune offers suggestions', pass, `isError=${res.isError} commune: ${short(communeLine || res.text)}`)
    })
    await check('editor create getFieldSuggestions: herblain from the private referential', async () => {
      const res = await create('getFieldSuggestions', { path: '/commune', query: 'herblain' })
      const pass = !res.isError && res.text.includes('44162') && res.text.includes('Saint-Herblain')
      report('editor create getFieldSuggestions: herblain from the private referential', pass,
        `isError=${res.isError} 44162=${res.text.includes('44162')} 44165=${res.text.includes('44165')} answer: ${short(res.text)}`)
    })
    await check('editor create saveForm: the line exists, departement 44 after finalize', async () => {
      const values: Record<string, unknown> = { ...required, nom: 'Smoke éditeur', commune: '44162' }
      const sets: string[] = []
      for (const [key, value] of Object.entries(values)) {
        const res = await create('setFieldValue', { path: `/${key}`, value })
        sets.push(`${key}: ${res.isError ? 'ERROR ' : ''}${short(res.text, 200)}`)
      }
      const res = await create('saveForm')
      const line = (await lines()).get('Smoke éditeur')
      const pass = !res.isError && line?.commune === '44162' && line?.['_code_insee.departement'] === '44'
      report('editor create saveForm: the line exists, departement 44 after finalize', pass,
        `save isError=${res.isError} answer: ${short(res.text, 400)}\n` +
        `line: ${JSON.stringify(line && { _id: line._id, commune: line.commune, departement: line['_code_insee.departement'] })}\n` +
        `setFieldValue: ${sets.join(' | ')}`)
    })
    await check('editor create, second open after saveForm', async () => {
      const res = await create('getData')
      const empty = !/Smoke éditeur/.test(res.text)
      report('editor create, second open after saveForm', 'info', `starts empty=${empty}; getData: ${short(res.text, 400)}`)
    })
    await check('editor create saveForm on an invalid form: refused', async () => {
      await create('reloadForm')
      let phone: ToolResult | undefined
      for (const [key, value] of Object.entries({ ...required, nom: 'Smoke éditeur invalide', commune: '44109', telephone: '0240' })) {
        const res = await create('setFieldValue', { path: `/${key}`, value })
        if (key === 'telephone') phone = res
      }
      const res = await create('saveForm')
      const written = (await lines()).has('Smoke éditeur invalide')
      const pass = res.isError && !written
      const named = /telephone|Téléphone/i.test(res.text)
      report('editor create saveForm on an invalid form: refused', pass,
        `isError=${res.isError} written=${written} field named in the refusal=${named} answer: ${short(res.text, 400)}\n` +
        `setFieldValue telephone: ${short(phone?.text ?? '', 300)}`)
      await create('reloadForm')
    })
    await check('editor edit saveForm: handisport appended, nothing wiped', async () => {
      const before = (await lines()).get('Piscine Petite Amazonie')
      const add = await edit('editArray', { path: '/activites', action: 'add', value: 'handisport' })
      // a multi-valued column with restricted values is a multiple select, which editArray refuses:
      // the whole list then goes through setFieldValue, as a model would do next
      const set = add.isError ? await edit('setFieldValue', { path: '/activites', value: ['natation', 'yoga', 'handisport'] }) : undefined
      const data = await edit('getData')
      const res = await edit('saveForm')
      const after = (await lines()).get('Piscine Petite Amazonie')
      const kept = ['nom', 'association', 'type_lieu', 'commune', 'adresse', 'telephone', 'email', 'siret', 'publics', 'capacite', 'accessible_pmr', 'date_ouverture', 'tarif_annuel', '_code_insee.departement', '_code_insee.population']
        .filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
      const pass = !res.isError && JSON.stringify(after?.activites) === JSON.stringify(['natation', 'yoga', 'handisport']) && kept.length === 0
      report('editor edit saveForm: handisport appended, nothing wiped', pass,
        `editArray isError=${add.isError}: ${short(add.text, 200)}\n` +
        (set ? `setFieldValue isError=${set.isError}: ${short(set.text, 200)}\n` : '') +
        `data sent: ${short(data.text, 700)}\n` +
        `save isError=${res.isError} answer: ${short(res.text, 400)}\n` +
        `activites ${JSON.stringify(before?.activites)} -> ${JSON.stringify(after?.activites)}; columns changed besides activites: ${kept.join(', ') || 'none'}` +
        (kept.length ? `\nbefore: ${JSON.stringify(before)}\nafter: ${JSON.stringify(after)}` : ''))
    })
  } finally {
    await client.close()
  }
}

try {
  await clean()
  await seedLineEditionDatasets(id)
  await armJson()
  await armEditor()
} finally {
  await admin.post('/api/v1/test-env/line-edition-arm', { arm: null })
}

const failed = results.filter(r => r.pass === false)
console.log(`\n${results.filter(r => r.pass === true).length} passed, ${failed.length} failed, ${results.filter(r => r.pass === 'info').length} recorded`)
if (failed.length) process.exit(1)
