/**
 * Three contract-only fixes from openapi-mcp's readiness notes (A1, A2, A4): the runtime was
 * already right, the document was wrong or silent. A generated tool can only offer what the
 * document declares, so each is pinned on the generated root document.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const load = async () => (await import('../../../api/contract/api-docs.ts')).default

const operation = (doc: any, operationId: string): any => {
  for (const item of Object.values<any>(doc.paths)) {
    for (const op of Object.values<any>(item)) if (op?.operationId === operationId) return op
  }
  throw new Error(`no operation ${operationId}`)
}
const param = (doc: any, operationId: string, name: string): any => {
  const op = operation(doc, operationId)
  const pathItem = Object.values<any>(doc.paths).find(item => Object.values<any>(item).includes(op))
  return [...(pathItem.parameters ?? []), ...(op.parameters ?? [])].find((p: any) => p.name === name)
}

test.describe('contract fixes pinned on the generated root document', () => {
  test('A1: date_match is declared on the three query routes', async () => {
    const doc = (await load())('https://example.test')
    for (const id of ['readLines', 'getValuesAgg', 'getMetricAgg']) {
      const p = param(doc, id, 'date_match')
      assert.ok(p, `${id} declares date_match`)
      assert.equal(p.in, 'query')
      assert.equal(p.schema.type, 'string')
      assert.match(p.description, /YYYY-MM-DD/)
    }
  })
  test('A2: the values_agg sort parameter has no enum on the merged document', async () => {
    const doc = (await load())('https://example.test')
    const sort = param(doc, 'getValuesAgg', 'sort')
    assert.equal(sort.schema.items.enum, undefined)
    assert.match(sort.description, /-count,key,ma_colonne/)
  })
  test('A4: after says where its value comes from and next says what it is', async () => {
    const doc = (await load())('https://example.test')
    assert.match(param(doc, 'readLines', 'after').description, /paramètre `after` de l'URL \*\*next\*\*/)
    const next = operation(doc, 'readLines').responses[200].content['application/json'].schema.properties.next
    assert.match(next.description, /URL complète/)
    assert.match(next.description, /même requête/)
  })
})

/** The multipart schema of an operation, its $ref followed. */
const multipartSchema = (doc: any, operationId: string): any => {
  const schema = operation(doc, operationId).requestBody.content['multipart/form-data'].schema
  return schema.$ref ? doc.components.schemas[schema.$ref.split('/').pop()] : schema
}

test.describe('file operations: the document declares what the upload and export routes handle', () => {
  test('POST /datasets and PUT /datasets/{id} declare the data file, the attachments and the body part', async () => {
    const doc = (await load())('https://example.test')
    for (const id of ['postDataset', 'putDataset']) {
      const schema = multipartSchema(doc, id)
      assert.equal(schema.properties.file.format, 'binary', id)
      assert.equal(schema.properties.attachments.format, 'binary', id)
      assert.equal(schema.properties.body.type, 'string', id)
      assert.equal(schema.properties.body.contentMediaType, undefined, `${id}: JSON text, not a file part`)
      assert.equal(schema.properties.title.type, 'string', `${id}: metadata parts stay declared one by one`)
      assert.equal(schema.required, undefined, `${id}: a dataset is also created without a file (initFrom, editable, virtual)`)
      assert.equal(schema.additionalProperties, undefined, `${id}: <field>_encoding parts are accepted too`)
    }
  })
  test('readLines declares the file formats its format parameter serves, JSON unchanged', async () => {
    const doc = (await load())('https://example.test')
    const content = operation(doc, 'readLines').responses[200].content
    for (const type of [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/geo+json',
      'application/zip',
      'application/x-protobuf',
      'text/plain'
    ]) assert.ok(content[type], type)
    assert.equal(content['application/json'].schema.properties.results.type, 'array')
  })
})
