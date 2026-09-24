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
