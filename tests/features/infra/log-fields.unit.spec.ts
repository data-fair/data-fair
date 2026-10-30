import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { getLogContext } from '@data-fair/lib-node/log.js'
import { resourceTask, threadInit } from '../../../api/src/workers/log-context.ts'
import { ownerLogFields, resourceLogFields, truncateLogValue } from '../../../api/src/misc/utils/log-fields.ts'

test('ownerLogFields describes an organization department', () => {
  assert.deepEqual(ownerLogFields({ type: 'organization', id: 'o1', name: 'Org 1', department: 'dep1' }), { ownerKey: 'organization.o1', ownerDep: 'dep1', ownerName: 'Org 1' })
})
test('ownerLogFields always emits the 3 keys, missing values are undefined and dropped from the JSON line', () => {
  const fields = ownerLogFields({ type: 'user', id: 'u1' })
  assert.deepEqual(Object.keys(fields).sort(), ['ownerDep', 'ownerKey', 'ownerName'])
  assert.deepEqual(JSON.parse(JSON.stringify(fields)), { ownerKey: 'user.u1' })
})
test('resourceLogFields adds the resource to the owner fields', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(resourceLogFields('datasets', { id: 'd1', owner: { type: 'user', id: 'u1', name: 'U' } }))), { resourceType: 'datasets', resourceId: 'd1', ownerKey: 'user.u1', ownerName: 'U' })
})
test('ownerLogFields of a root owner overrides the department of a previous owner', () => {
  const dataset = { id: 'd1', owner: { type: 'organization', id: 'o1', name: 'Org 1', department: 'dep1' } }
  const merged = { ...resourceLogFields('datasets', dataset), ...ownerLogFields({ type: 'organization', id: 'o2' }) }
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), { resourceType: 'datasets', resourceId: 'd1', ownerKey: 'organization.o2' })
})
test('truncateLogValue keeps short values and cuts long ones', () => {
  assert.equal(truncateLogValue('short'), 'short')
  const cut = truncateLogValue('x'.repeat(5000))
  assert.equal(cut.length, 1001)
  assert.ok(cut.endsWith('…'))
  assert.equal(truncateLogValue('abcdef', 3), 'abc…')
})

test('resourceTask restores the log context of the payload', async () => {
  const task = resourceTask(async (resource: { id: string }) => ({ id: resource.id, ctx: getLogContext() }))
  const result = await task({ resource: { id: 'd1' }, logContext: { resourceId: 'd1', task: 'finalize' } })
  assert.deepEqual(result, { id: 'd1', ctx: { resourceId: 'd1', task: 'finalize' } })
})

test('resourceTask runs the thread init outside the log context of the task', async () => {
  let nbInits = 0
  let resolveTimer: (ctx: any) => void
  const timerCtx = new Promise<any>(resolve => { resolveTimer = resolve })
  // the init starts a long-lived timer, like the events queue loop
  const init = threadInit(async () => {
    nbInits++
    setTimeout(() => resolveTimer(getLogContext()), 10)
  })
  const task = resourceTask(async (resource: { id: string }) => getLogContext(), init)
  const ctxs = await Promise.all([
    task({ resource: { id: 'd1' }, logContext: { resourceId: 'd1', task: 'finalize' } }),
    task({ resource: { id: 'd2' }, logContext: { resourceId: 'd2', task: 'finalize' } })
  ])
  assert.deepEqual(ctxs, [{ resourceId: 'd1', task: 'finalize' }, { resourceId: 'd2', task: 'finalize' }])
  assert.deepEqual(await timerCtx, {})
  assert.equal(nbInits, 1)
})

test('threadInit is retried after a failure', async () => {
  let nbInits = 0
  const init = threadInit(async () => { nbInits++; if (nbInits === 1) throw new Error('fail') })
  const task = resourceTask(async () => 'ok', init)
  await assert.rejects(Promise.resolve(task({ resource: {}, logContext: {} })), /fail/)
  assert.equal(await task({ resource: {}, logContext: {} }), 'ok')
  assert.equal(nbInits, 2)
})
