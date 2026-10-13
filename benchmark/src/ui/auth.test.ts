import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSetCookie } from './auth.ts'

const origin = 'http://dev.localhost:9709'

test('parseSetCookie keeps name, value and flags, bound to the origin', () => {
  assert.deepEqual(parseSetCookie('id_token=abc.def=; Path=/; HttpOnly; SameSite=Lax', origin), {
    name: 'id_token', value: 'abc.def=', url: origin + '/', httpOnly: true, sameSite: 'Lax'
  })
})

test('parseSetCookie uses the cookie path and defaults to not httpOnly', () => {
  assert.deepEqual(parseSetCookie('id_token_org=dev_fixtures; Path=/simple-directory', origin), {
    name: 'id_token_org', value: 'dev_fixtures', url: origin + '/simple-directory', httpOnly: false
  })
})
