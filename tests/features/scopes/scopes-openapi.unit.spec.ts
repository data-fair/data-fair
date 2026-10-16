import { test } from '@playwright/test'
import { strict as assert } from 'node:assert'
import path from 'node:path'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const methods = ['get', 'put', 'post', 'delete', 'patch']
const operations = (doc: any) => Object.values(doc.paths).flatMap((p: any) => methods.filter(m => p[m]).map(m => p[m]))
const oauth2Of = (doc: any, operationId: string): string[] | undefined => {
  const op = operations(doc).find((o: any) => o.operationId === operationId) as any
  assert.ok(op, operationId)
  return op.security?.find((s: any) => s.oauth2)?.oauth2
}

const dataset: any = { id: 'd1', owner: { type: 'organization', id: 'o1' }, isRest: true, schema: [] }
let docs: Record<string, any>
let scopeDescriptions: (locale: 'fr' | 'en') => Record<string, string>
let rootOperationClasses: Record<string, string>

test.beforeAll(async () => {
  const apiDocs = (await import('../../../api/contract/api-docs.ts')).default
  const privateDatasetAPIDocs = (await import('../../../api/contract/dataset-private-api-docs.ts')).default
  scopeDescriptions = (await import('../../../api/src/misc/utils/scopes.ts')).scopeDescriptions
  rootOperationClasses = (await import('../../../api/contract/scopes-security.ts')).rootOperationClasses
  docs = {
    root: apiDocs('http://localhost'),
    private: privateDatasetAPIDocs(dataset, 'http://localhost')
  }
})

test.describe('oauth2 security in the OpenAPI docs', () => {
  for (const name of ['root', 'private']) {
    test(`${name}: the scheme and every oauth2 scope used are declared`, () => {
      const doc = docs[name]
      const declared = scopeDescriptions('fr')
      assert.equal(doc.components.securitySchemes.oauth2.type, 'oauth2')
      assert.deepEqual(doc.components.securitySchemes.oauth2.flows.clientCredentials.scopes, declared)
      assert.match(doc.components.securitySchemes.oauth2.flows.clientCredentials.tokenUrl, /\/api\/auth\/nhi-token$/)
      let used = 0
      for (const op of operations(doc) as any[]) {
        for (const s of op.security ?? []) {
          if (!s.oauth2) continue
          used++
          assert.ok(s.oauth2.length > 0)
          for (const scope of s.oauth2) assert.ok(declared[scope], `${op.operationId}: ${scope}`)
          // the existing alternatives are kept
          assert.ok(op.security.some((x: any) => x.apiKey) && op.security.some((x: any) => x.sdCookie), op.operationId)
        }
      }
      assert.ok(used > 5)
    })
  }

  test('read, write and admin operations list the scopes of their tier', () => {
    const root = docs.root
    assert.deepEqual(oauth2Of(root, 'listDatasets'), ['datasets:read', 'datasets:write', 'datasets:admin', 'datasets'])
    assert.deepEqual(oauth2Of(root, 'readLines'), ['datasets:read', 'datasets:write', 'datasets:admin', 'datasets'])
    assert.deepEqual(oauth2Of(root, 'postDataset'), ['datasets:write', 'datasets:admin', 'datasets'])
    assert.deepEqual(oauth2Of(root, 'deleteApplication'), ['applications:admin', 'applications'])
    assert.deepEqual(oauth2Of(root, 'getApplication'), ['applications:read', 'applications:write', 'applications:admin', 'applications'])
    assert.deepEqual(oauth2Of(root, 'getPermissions'), ['datasets:admin', 'datasets'])
    assert.equal(oauth2Of(docs.private, 'readLines')?.[0], 'datasets:read')
    assert.deepEqual(oauth2Of(root, 'delete'), ['datasets:admin', 'datasets'])
  })

  test('operations without a tier carry no oauth2 entry', () => {
    for (const id of ['ping', 'getApiDoc', 'getVocabulary']) assert.equal(oauth2Of(docs.root, id), undefined)
    const superadmin = operations(docs.root).filter((o: any) => o['x-permissionClass'] === 'superadmin')
    for (const op of superadmin as any[]) assert.equal(op.security?.some((s: any) => s.oauth2), undefined, op.operationId)
  })
})

// the operations of the root doc defined inline carry no x-permissionClass: applyOauth2Security maps
// them by operationId through rootOperationClasses. A new inline operation of a family must be
// mapped there, or listed here when it deliberately has no tier.
const rootOperationsWithoutTier = new Set<string>([])

test.describe('inline root operations of the families', () => {
  test('are mapped to a permission class or explicitly exempted', () => {
    const inline: string[] = []
    for (const [path, pathItem] of Object.entries(docs.root.paths) as [string, any][]) {
      if (!['/datasets', '/catalog', '/applications'].some(prefix => path.startsWith(prefix))) continue
      for (const method of [...methods, 'head']) {
        const op = pathItem[method]
        if (!op || op['x-permissionClass']) continue
        inline.push(op.operationId)
        assert.ok(Object.hasOwn(rootOperationClasses, op.operationId) || rootOperationsWithoutTier.has(op.operationId),
          `${method} ${path} (${op.operationId}) has no x-permissionClass: map it in rootOperationClasses or exempt it`)
      }
    }
    // no stale entry: every mapped or exempted operation still exists inline
    for (const id of [...Object.keys(rootOperationClasses), ...rootOperationsWithoutTier]) assert.ok(inline.includes(id), `${id} is not an inline root operation anymore`)
  })
})
