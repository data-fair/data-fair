import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import type { SessionState } from '@data-fair/lib-express'

// The fine scope check of the permission core: every decision of list() / can() / canDoForOwner()
// intersects with the token scopes; sessions without scopes keep exactly their previous rights.

// permissions.ts imports `#config` at module load: point node-config at the real api/config dir and
// load via dynamic import, same pattern as lines-pipeline.unit.spec.ts
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')
const load = () => import('../../../api/src/misc/utils/permissions.ts')

const owner = { type: 'organization', id: 'scopeorg', name: 'Scope org' } as const
const orgAdmin = (scopes?: string[]) => {
  const state: any = {
    lang: 'fr',
    user: { id: 'u1', name: 'User 1', email: 'u1@example.com', organizations: [{ id: owner.id, name: owner.name, role: 'admin' }] },
    organization: { id: owner.id, name: owner.name, role: 'admin' },
    account: { type: 'organization', id: owner.id, name: owner.name },
    accountRole: 'admin'
  }
  if (scopes) state.scopes = scopes
  return state as SessionState
}
const orgContrib = (scopes?: string[]) => {
  const state: any = orgAdmin(scopes)
  state.user.organizations[0].role = 'contrib'
  state.organization.role = 'contrib'
  state.accountRole = 'contrib'
  return state as SessionState
}
const dataset = (permissions: any[] = []) => ({ id: 'ds1', title: 'ds1', owner: { ...owner }, permissions }) as any

const readOps = ['readDescription', 'readLines', 'readJournal']
const writeOps = ['writeDescription', 'writeData']
const adminOps = ['delete', 'setPermissions', 'changeOwner']

test.describe('permission decisions intersect with token scopes', () => {
  test('datasets:read gets only the read tier', async () => {
    const { list, can } = await load()
    const ops = list('datasets', dataset(), orgAdmin(['datasets:read']))
    for (const op of readOps) assert.ok(ops.includes(op), op)
    for (const op of [...writeOps, ...adminOps]) assert.ok(!ops.includes(op), op)
    assert.equal(can('datasets', dataset(), 'writeDescription', orgAdmin(['datasets:read'])), false)
    assert.equal(can('datasets', dataset(), 'readDescription', orgAdmin(['datasets:read'])), true)
  })

  test('datasets:write adds the write tier but no admin operation', async () => {
    const { list } = await load()
    const ops = list('datasets', dataset(), orgAdmin(['datasets:write']))
    for (const op of [...readOps, ...writeOps]) assert.ok(ops.includes(op), op)
    for (const op of adminOps) assert.ok(!ops.includes(op), op)
  })

  test('datasets:admin and the bare umbrella get everything the role gives', async () => {
    const { list } = await load()
    const unrestricted = list('datasets', dataset(), orgAdmin()).sort()
    for (const op of [...readOps, ...writeOps, ...adminOps]) assert.ok(unrestricted.includes(op), op)
    assert.deepEqual(list('datasets', dataset(), orgAdmin(['datasets:admin'])).sort(), unrestricted)
    assert.deepEqual(list('datasets', dataset(), orgAdmin(['datasets'])).sort(), unrestricted)
  })

  test('another family grants nothing', async () => {
    const { list } = await load()
    assert.deepEqual(list('datasets', dataset(), orgAdmin(['applications:admin'])), [])
    assert.deepEqual(list('datasets', dataset(), orgAdmin([])), [])
    assert.deepEqual(list('remote-services', dataset(), orgAdmin(['datasets:admin', 'applications:admin'])), [])
  })

  test('unrestricted sessions are unchanged', async () => {
    const { list } = await load()
    // explicit permissions, including an operation id unknown to the classes, are kept as before
    const ds = dataset([{ type: 'user', id: 'u2', classes: ['read'], operations: ['delete', 'someUnknownOp'] }])
    const other: any = { lang: 'fr', user: { id: 'u2', name: 'U2', organizations: [] }, account: { type: 'user', id: 'u2', name: 'U2' }, accountRole: 'admin' }
    const ops = list('datasets', ds, other)
    assert.ok(ops.includes('delete') && ops.includes('someUnknownOp') && ops.includes('readLines'))
    // scoped, the same permission entry is cut to the read tier and the unknown operation is dropped
    const scopedOps = list('datasets', ds, { ...other, scopes: ['datasets:read'] })
    assert.ok(scopedOps.includes('readLines'))
    assert.ok(!scopedOps.includes('delete') && !scopedOps.includes('someUnknownOp'))
    assert.deepEqual(list('datasets', ds, { ...other, scopes: ['datasets:admin'] }).sort(), ops.filter(op => op !== 'someUnknownOp').sort())
  })

  test('bypass permissions are filtered for scoped sessions', async () => {
    const { list } = await load()
    const bypass = { classes: ['read', 'write'], operations: ['delete'] }
    const unrestricted = list('datasets', dataset(), orgAdmin(), bypass)
    assert.ok(unrestricted.includes('delete') && unrestricted.includes('writeData') && unrestricted.includes('readLines'))
    const scoped = list('datasets', dataset(), orgAdmin(['datasets:read']), bypass)
    assert.ok(scoped.includes('readLines'))
    assert.ok(!scoped.includes('delete') && !scoped.includes('writeData'))
  })

  test('canDoForOwner requires the scope of the class', async () => {
    const { canDoForOwner } = await load()
    assert.ok(canDoForOwner(owner, 'datasets', 'post', orgAdmin()))
    assert.ok(!canDoForOwner(owner, 'datasets', 'post', orgAdmin(['datasets:read'])))
    assert.ok(canDoForOwner(owner, 'datasets', 'post', orgAdmin(['datasets:write'])))
    assert.ok(canDoForOwner(owner, 'datasets', 'post', orgContrib(['datasets:write'])))
    assert.ok(!canDoForOwner(owner, 'datasets', 'post', orgAdmin(['applications:write'])))
    assert.ok(canDoForOwner(owner, 'datasets', 'manageMasterData', orgAdmin()))
    assert.ok(!canDoForOwner(owner, 'datasets', 'manageMasterData', orgAdmin(['datasets:write'])))
    assert.ok(canDoForOwner(owner, 'datasets', 'manageMasterData', orgAdmin(['datasets:admin'])))
    assert.ok(canDoForOwner(owner, 'datasets', 'admin', orgAdmin(['datasets'])))
  })
})
