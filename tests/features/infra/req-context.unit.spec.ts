import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { defineReqContext } from '../../../api/src/misc/utils/req-context.ts'

// symbol-keyed typed request context (lib-express session.ts pattern),
// with transitional fallback to the legacy req-mutation property
test.describe('defineReqContext', () => {
  test('set then get returns the value', () => {
    const ctx = defineReqContext<{ id: string }>('thing')
    const req: any = {}
    ctx.set(req, { id: 'a' })
    assert.deepEqual(ctx.get(req), { id: 'a' })
  })

  test('get throws when never set and no legacy prop', () => {
    const ctx = defineReqContext<string>('thing')
    assert.throws(() => ctx.get({} as any), /was not set/)
  })

  test('getOptional returns undefined when never set', () => {
    const ctx = defineReqContext<string>('thing')
    assert.equal(ctx.getOptional({} as any), undefined)
  })

  test('falls back to the legacy mutated property during transition', () => {
    const ctx = defineReqContext<string>('thing', 'thing')
    const req: any = { thing: 'legacy' }
    assert.equal(ctx.get(req), 'legacy')
    ctx.set(req, 'modern')
    assert.equal(ctx.get(req), 'modern') // symbol wins over legacy
  })

  test('two contexts with the same name do not collide', () => {
    const a = defineReqContext<string>('x')
    const b = defineReqContext<string>('x')
    const req: any = {}
    a.set(req, '1')
    assert.equal(b.getOptional(req), undefined)
  })

  test('a set value of false does not throw and does not fall back to legacy', () => {
    const ctx = defineReqContext<boolean>('flag', 'flag')
    const req: any = { flag: true }
    ctx.set(req, false)
    assert.equal(ctx.get(req), false)
    assert.equal(ctx.getOptional(req), false)
    assert.equal(req.flag, false) // dual-write keeps the legacy prop in sync
  })
})
