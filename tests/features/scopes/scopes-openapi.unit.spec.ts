import { test } from '@playwright/test'
import { strict as assert } from 'node:assert'
import path from 'node:path'
import { isDeepStrictEqual as deepEqual } from 'node:util'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const methods = ['get', 'put', 'post', 'delete', 'patch']
const operations = (doc: any) => Object.values(doc.paths).flatMap((p: any) => methods.filter(m => p[m]).map(m => p[m]))
const oauth2Of = (doc: any, operationId: string): string[][] | undefined => {
  const op = operations(doc).find((o: any) => o.operationId === operationId) as any
  assert.ok(op, operationId)
  const found = (op.security ?? []).filter((s: any) => s.oauth2).map((s: any) => s.oauth2)
  return found.length ? found : undefined
}
const alt = (...scopes: string[]) => scopes.map(s => [s])

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
          assert.equal(s.oauth2.length, 1)
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
    assert.deepEqual(oauth2Of(root, 'listDatasets'), alt('datasets:read', 'datasets:write', 'datasets:admin', 'datasets'))
    assert.deepEqual(oauth2Of(root, 'readLines'), alt('datasets:read', 'datasets:write', 'datasets:admin', 'datasets'))
    assert.deepEqual(oauth2Of(root, 'postDataset'), alt('datasets:write', 'datasets:admin', 'datasets'))
    assert.deepEqual(oauth2Of(root, 'deleteApplication'), alt('applications:admin', 'applications'))
    assert.deepEqual(oauth2Of(root, 'getApplication'), alt('applications:read', 'applications:write', 'applications:admin', 'applications'))
    assert.deepEqual(oauth2Of(root, 'getPermissions'), alt('datasets:admin', 'datasets'))
    assert.deepEqual(oauth2Of(docs.private, 'readLines')?.[0], ['datasets:read'])
    assert.deepEqual(oauth2Of(root, 'delete'), alt('datasets:admin', 'datasets'))
  })

  test('each accepted scope is its own alternative', () => {
    assert.deepEqual(oauth2Of(docs.root, 'listDatasets'), [['datasets:read'], ['datasets:write'], ['datasets:admin'], ['datasets']])
    for (const name of ['root', 'private']) {
      for (const op of operations(docs[name]) as any[]) {
        for (const s of op.security ?? []) if (s.oauth2) assert.equal(s.oauth2.length, 1, op.operationId)
      }
    }
  })

  test('agentSecurity equals the security of a real operation of the same family and tier', async () => {
    const { agentSecurity } = await import('../../../api/contract/scopes-security.ts')
    const cases: [any, string, 'datasets' | 'applications', 'read' | 'write' | 'admin'][] = [
      [docs.root, 'listDatasets', 'datasets', 'read'],
      [docs.root, 'postDataset', 'datasets', 'write'],
      [docs.root, 'getPermissions', 'datasets', 'admin'],
      [docs.root, 'getApplication', 'applications', 'read'],
      [docs.root, 'patchApplication', 'applications', 'write'],
      [docs.root, 'deleteApplication', 'applications', 'admin']
    ]
    for (const [doc, id, family, tier] of cases) {
      const op = (operations(doc) as any[]).find(o => o.operationId === id)
      const expected = agentSecurity(family, tier)
      for (const a of expected) assert.ok(op.security.some((s: any) => deepEqual(s, a)), `${id}: ${JSON.stringify(a)} missing from the operation`)
      for (const s of op.security) assert.ok(expected.some(a => deepEqual(s, a)), `${id}: ${JSON.stringify(s)} missing from agentSecurity`)
    }
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
