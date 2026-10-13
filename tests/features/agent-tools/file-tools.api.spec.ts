/**
 * The file tools driven the way the MCP server drives them: openapi-mcp loads the served root
 * document with a file store configured — a local HTTP server standing in for the agents'
 * presigned URLs — and every call carries the user's session cookie, as data-fair/mcp forwards it.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import { load, type Tool } from '@data-fair/openapi-mcp'
import { axiosAuth, baseURL, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, waitForFinalize, doAndWaitForFinalize, getRawDataset } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const ctx = { headers: { cookie: testUser1.cookieJar.getCookieStringSync(baseURL) } }

const dataset1 = readFileSync('./tests/resources/datasets/dataset1.csv')
// dataset1's columns, one more row: a compatible replacement
const dataset1More = Buffer.from(dataset1.toString().trimEnd() + '\nmachin,ailleurs,2018-01-01,"46.3,3.1",true,3\n')
const dataset2 = readFileSync('./tests/resources/datasets/dataset2.csv')

/** The file store: serves what a test puts under /agent-files/, records what reaches it. */
const stored: Record<string, Buffer> = {}
const storeRequests: IncomingHttpHeaders[] = []
const store = createServer((req, res) => {
  storeRequests.push(req.headers)
  const body = stored[req.url!.split('?')[0]]
  if (!body) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': 'text/csv', 'content-length': body.length })
  res.end(body)
})
let storeUrl = ''
let tools: Tool[] = []
/** A presigned-looking URL: the name is the last path segment, the query a signature. */
const fileUrl = (name: string, body: Buffer) => {
  stored[`/agent-files/${name}`] = body
  return `${storeUrl}/agent-files/${name}?X-Amz-Signature=test`
}
const tool = (name: string) => {
  const found = tools.find(t => t.name === name)
  assert.ok(found, `${name} is generated`)
  return found
}

test.describe('file tools against the API', () => {
  test.beforeAll(async () => {
    await new Promise<void>(resolve => store.listen(0, '127.0.0.1', resolve))
    storeUrl = `http://127.0.0.1:${(store.address() as any).port}`
    const toolSet = await load(`${baseURL}/api/v1/api-docs.json`, { profiles: ['write_datasets'], structuredContent: true, files: { urlPrefixes: [`${storeUrl}/agent-files/`] } })
    tools = toolSet.tools
  })
  test.afterAll(() => { store.close() })
  test.beforeEach(async () => {
    await clean()
    storeRequests.length = 0
  })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('creates a dataset from a file URL, then replaces its file', async () => {
    test.setTimeout(60_000)
    const created = await tool('datafair_create_dataset_from_file').execute({ file: fileUrl('dataset1.csv', dataset1), title: 'Agent upload' }, ctx)
    assert.ok(!created.isError, created.text)
    const id = (created.structuredContent as any).id
    let dataset = await waitForFinalize(testUser1, id)
    assert.equal(dataset.title, 'Agent upload')
    assert.equal(dataset.file.name, 'dataset1.csv', 'named after the URL path, signature dropped')
    assert.equal(dataset.count, 2)

    dataset = await doAndWaitForFinalize(testUser1, id, async () => {
      const replaced = await tool('datafair_replace_dataset_file').execute({ datasetId: id, file: fileUrl('dataset1-more.csv', dataset1More) }, ctx)
      assert.ok(!replaced.isError, replaced.text)
    })
    assert.equal(dataset.file.name, 'dataset1-more.csv')
    assert.equal(dataset.count, 3)
    assert.ok(!dataset.draft, 'a compatible file is validated without a person')

    assert.equal(storeRequests.length, 2)
    for (const headers of storeRequests) assert.equal(headers.cookie, undefined, 'the caller session never reaches the file store')
  })

  test('a replacement that breaks the columns stays a draft for a person to validate', async () => {
    test.setTimeout(60_000)
    const { id } = await sendDataset('datasets/dataset1.csv', testUser1)
    await doAndWaitForFinalize(testUser1, id, async () => {
      const replaced = await tool('datafair_replace_dataset_file').execute({ datasetId: id, file: fileUrl('dataset2.csv', dataset2) }, ctx)
      assert.ok(!replaced.isError, replaced.text)
    })
    const raw = await getRawDataset(id)
    assert.equal(raw.file.name, 'dataset1.csv', 'the current data stays online')
    assert.equal(raw.count, 2)
    assert.equal(raw.draft.file.name, 'dataset2.csv', 'the new file waits as a draft')
  })

  test('download and export links serve the data to the caller session, and only to it', async () => {
    const { id } = await sendDataset('datasets/dataset1.csv', testUser1)

    const original = await tool('datafair_download_dataset_file').execute({ datasetId: id }, ctx)
    assert.equal(original.resourceLink!.uri, `${baseURL}/api/v1/datasets/${id}/raw`)
    let res = await fetch(original.resourceLink!.uri, { headers: ctx.headers })
    assert.equal(res.status, 200)
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), dataset1.toString())
    res = await fetch(original.resourceLink!.uri)
    assert.ok([401, 403].includes(res.status), `anonymously: ${res.status}`)

    const converted = await tool('datafair_download_dataset_converted_file').execute({ datasetId: id }, ctx)
    res = await fetch(converted.resourceLink!.uri, { headers: ctx.headers })
    assert.equal(res.status, 200)
    assert.match(await res.text(), /koumoul/)

    const exported = await tool('datafair_export_data').execute({ datasetId: id, select: ['id', 'nb'] }, ctx)
    assert.equal(exported.resourceLink!.mimeType, 'text/csv')
    assert.equal(exported.resourceLink!.name, `${id}-lines.csv`)
    res = await fetch(exported.resourceLink!.uri, { headers: ctx.headers })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/csv/)
    const csv = await res.text()
    assert.match(csv.split('\n')[0], /id/)
    assert.match(csv.split('\n')[0], /nb/)
    assert.match(csv, /koumoul/)
    assert.match(csv, /bidule/)
  })
})
