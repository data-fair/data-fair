import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preflightMessage, assertComplete } from './command.ts'

test('unreachable stack points to npm run dev', () => {
  assert.match(preflightMessage('my-dataset', { reachable: false })!, /npm run dev/)
})

test('a missing dataset names it and points to --dataset', () => {
  assert.match(preflightMessage('my-dataset', { reachable: true, status: 404 })!, /my-dataset.*--dataset/)
})

test('dataset still indexing asks to retry later', () => {
  assert.match(preflightMessage('my-dataset', { reachable: true, status: 200, body: { status: 'indexed' } })!, /still indexing/)
})

test('finalized dataset can run', () => {
  assert.equal(preflightMessage('my-dataset', { reachable: true, status: 200, body: { status: 'finalized' } }), null)
})

test('a dataset the account cannot read points to the account options', () => {
  assert.match(preflightMessage('my-dataset', { reachable: true, status: 403 })!, /cannot read my-dataset.*--email/)
})

test('any other HTTP status is reported as is', () => {
  assert.match(preflightMessage('my-dataset', { reachable: true, status: 502 })!, /502/)
})

test('assertComplete names the scenario and variant missing samples', () => {
  assert.doesNotThrow(() => assertComplete({ load: { base: [1, 2], current: [1, 2] } }, 2))
  assert.throws(() => assertComplete({ load: { base: [1, 2], current: [1] } }, 2), /load.*current.*1\/2/)
})
