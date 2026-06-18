import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { defineReqContext } from '../../../api/src/misc/utils/req-context.ts'

// symbol-keyed typed request context (lib-express session.ts pattern). The transitional `legacyProp`
// dual-write was removed once every property migrated — the context is now Symbol-only.
test.describe('defineReqContext', () => {
  test('set then get returns the value', () => {
    const ctx = defineReqContext<{ id: string }>('thing')
    const req: any = {}
    ctx.set(req, { id: 'a' })
    assert.deepEqual(ctx.get(req), { id: 'a' })
  })

  test('get throws when never set', () => {
    const ctx = defineReqContext<string>('thing')
    assert.throws(() => ctx.get({} as any), /was not set/)
  })

  test('getOptional returns undefined when never set', () => {
    const ctx = defineReqContext<string>('thing')
    assert.equal(ctx.getOptional({} as any), undefined)
  })

  test('the Symbol key is private — no plain property leaks onto the request', () => {
    const ctx = defineReqContext<string>('thing')
    const req: any = {}
    ctx.set(req, 'modern')
    assert.equal(req.thing, undefined) // not mutated as a plain property
    assert.deepEqual(Object.keys(req), []) // Symbol keys don't enumerate
  })

  test('two contexts with the same name do not collide', () => {
    const a = defineReqContext<string>('x')
    const b = defineReqContext<string>('x')
    const req: any = {}
    a.set(req, '1')
    assert.equal(b.getOptional(req), undefined)
  })

  test('a set value of false is honoured (not treated as unset)', () => {
    const ctx = defineReqContext<boolean>('flag')
    const req: any = {}
    ctx.set(req, false)
    assert.equal(ctx.get(req), false)
    assert.equal(ctx.getOptional(req), false)
  })
})
