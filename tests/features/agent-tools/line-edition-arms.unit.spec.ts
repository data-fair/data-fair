/**
 * The dev-only line edition arms of the experiment comparing two ways an autonomous agent writes
 * dataset lines (docs/superpowers/specs/2026-10-28-line-edition-arms-design.md): plain JSON tools
 * (arm json) or json-layout editor groups (arm editor). Switched off, the platform document is the
 * one served today, without a single line tool.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { load } from '@data-fair/openapi-mcp'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const PUBLIC_URL = 'https://example.test/data-fair'

const lineOperations = ['readLine', 'postLine', 'patchLine', 'updateLine', 'deleteLine', 'bulkLines']

const arms = async () => await import('../../../api/contract/x-agent-line-edition.ts')

/** data-fair's fragment alone in the platform document, as the route serves it on the site of PUBLIC_URL */
const platformDoc = async () => {
  const apiDocs = (await import('../../../api/contract/api-docs.ts')).default
  const { prepareFragment, mergePlatformDoc } = await import('../../../api/contract/platform-api-docs.ts')
  const { platformServices, siteOrigin } = await import('../../../api/src/platform-api-docs/service.ts')
  const { service } = platformServices({ publicUrl: PUBLIC_URL, directoryUrl: 'https://example.test/simple-directory' })[0]
  const prepared = prepareFragment(service, apiDocs(PUBLIC_URL))
  if ('refused' in prepared) throw new Error(prepared.refused)
  return mergePlatformDoc(siteOrigin(PUBLIC_URL), [{ service, fragment: prepared.fragment, status: 'ok' }], { version: 'test', oauth2Description: '' })
}

const operations = (doc: any): any[] => Object.values(doc.paths).flatMap((item: any) => Object.values(item)).filter((op: any) => op?.operationId)

/** the x-agent entries of data-fair's line operations, keyed by tool name without the namespace prefix */
const lineTools = (doc: any): Record<string, any> => Object.fromEntries(operations(doc)
  .filter(op => lineOperations.includes(op.operationId.replace(/^datafair_/, '')) && op['x-agent'])
  .flatMap(op => [op['x-agent']].flat().map((entry: any) => [entry.name.replace(/^datafair_/, ''), { ...entry, operationId: op.operationId }])))

test.describe('line edition arms', () => {
  test.afterEach(async () => {
    (await arms()).setLineEditionArm(undefined)
  })

  test('no arm: line operations carry no x-agent', async () => {
    const { setLineEditionArm, getLineEditionArm } = await arms()
    assert.equal(getLineEditionArm(), undefined)
    const before = await platformDoc()
    for (const op of operations(before)) {
      if (lineOperations.includes(op.operationId.replace(/^datafair_/, ''))) assert.equal(op['x-agent'], undefined, op.operationId)
    }
    setLineEditionArm('editor')
    await platformDoc()
    setLineEditionArm(undefined)
    assert.deepEqual(await platformDoc(), before)
  })

  test('arm json: plain line tools', async () => {
    (await arms()).setLineEditionArm('json')
    const tools = lineTools(await platformDoc())
    assert.deepEqual(Object.keys(tools).sort(), ['bulk_lines', 'delete_line', 'patch_line', 'read_line', 'write_line'])
    for (const [name, entry] of Object.entries(tools)) assert.equal(entry.editor, undefined, name)
    assert.equal(tools.write_line.operationId, 'datafair_postLine')
    assert.equal(tools.patch_line.operationId, 'datafair_patchLine')
    assert.equal(tools.bulk_lines.operationId, 'datafair_bulkLines')
  })

  test('arm json: the tools load, take any column, and name only tools that exist', async () => {
    (await arms()).setLineEditionArm('json')
    const toolSet = await load(await platformDoc(), { lint: 'error', fetch: (async () => new Response('not found', { status: 404 })) as typeof fetch })
    const names = new Set(toolSet.tools.map(t => t.name))
    const tool = (name: string) => toolSet.tools.find(t => t.name === `datafair_${name}`)!
    for (const name of ['read_line', 'delete_line', 'write_line', 'patch_line', 'bulk_lines']) assert.ok(names.has(`datafair_${name}`), name)
    // the merged document's line schema is a sample dataset's: its columns must not reach the tools
    for (const name of ['write_line', 'patch_line', 'bulk_lines']) {
      const schema = JSON.stringify(tool(name).inputSchema)
      for (const sampleColumn of ['siret', 'category']) assert.ok(!schema.includes(`"${sampleColumn}"`), `${name} offers the sample column ${sampleColumn}`)
    }
    const write = tool('write_line')
    assert.ok(write.inputSchema.required?.includes('body'))
    // bulk_lines answers synchronously, and never replaces every line
    assert.deepEqual(Object.keys(tool('bulk_lines').inputSchema.properties).sort(), ['body', 'id'])
    for (const name of ['read_line', 'delete_line', 'write_line', 'patch_line', 'bulk_lines']) {
      for (const mentioned of tool(name).description.match(/datafair_[a-z_]+/g) ?? []) assert.ok(names.has(mentioned), `${name} names ${mentioned}`)
    }
  })

  test('arm editor: editor groups only', async () => {
    (await arms()).setLineEditionArm('editor')
    const tools = lineTools(await platformDoc())
    assert.deepEqual(Object.keys(tools).sort(), ['create_line', 'delete_line', 'edit_line', 'read_line'])
    assert.equal(tools.read_line.editor, undefined)
    assert.equal(tools.delete_line.editor, undefined)
    assert.equal(tools.create_line.operationId, 'datafair_postLine')
    assert.equal(tools.edit_line.operationId, 'datafair_updateLine')
    assert.equal(tools.create_line.editor.schemaOperation, 'datafair_readSchema')
    assert.deepEqual(tools.create_line.editor.schemaParams, { mimeType: 'application/schema+json', arrays: true, extension: true })
    assert.equal(tools.create_line.editor.readOperation, undefined)
    assert.equal(tools.edit_line.editor.schemaOperation, 'datafair_readSchema')
    assert.equal(tools.edit_line.editor.readOperation, 'datafair_readLine')
  })

  test('arm editor: openapi-mcp composes the groups', async () => {
    (await arms()).setLineEditionArm('editor')
    const toolSet = await load(await platformDoc(), { lint: 'error', fetch: (async () => new Response('not found', { status: 404 })) as typeof fetch })
    const names = toolSet.tools.map(t => t.name)
    const create = names.filter(n => n.startsWith('datafair_create_line_'))
    const edit = names.filter(n => n.startsWith('datafair_edit_line_'))
    for (const group of [create, edit]) {
      assert.ok(group.some(n => n.endsWith('_getFieldSuggestions')), group.join(', '))
      assert.ok(group.some(n => n.endsWith('_saveForm')), group.join(', '))
    }
    for (const name of ['read_line', 'delete_line']) assert.ok(names.includes(`datafair_${name}`), name)
    for (const name of ['write_line', 'patch_line', 'bulk_lines']) assert.ok(!names.includes(`datafair_${name}`), name)
    // the dataset is named by the API's path parameter: the editor bridge does not rename it
    const saveForm = toolSet.tools.find(t => t.name.startsWith('datafair_edit_line_') && t.name.endsWith('_saveForm'))!
    assert.deepEqual(saveForm.inputSchema.required?.slice(0, 2), ['id', 'lineId'])
  })
})
