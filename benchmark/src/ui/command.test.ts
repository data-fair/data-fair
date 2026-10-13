import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preflightMessage, assertComplete } from './command.ts'

test('unreachable stack points to dev/status.sh', () => {
  assert.match(preflightMessage({ reachable: false })!, /dev\/status\.sh/)
})

test('missing fixture points to dev-fixtures', () => {
  assert.match(preflightMessage({ reachable: true, status: 404 })!, /npm run dev-fixtures/)
})

test('fixture still indexing asks to retry later', () => {
  assert.match(preflightMessage({ reachable: true, status: 200, body: { status: 'indexed' } })!, /still indexing/)
})

test('finalized fixture can run', () => {
  assert.equal(preflightMessage({ reachable: true, status: 200, body: { status: 'finalized' } }), null)
})

test('any other HTTP status is reported as is', () => {
  assert.match(preflightMessage({ reachable: true, status: 502 })!, /502/)
})

test('assertComplete names the scenario and variant missing samples', () => {
  assert.doesNotThrow(() => assertComplete({ load: { base: [1, 2], current: [1, 2] } }, 2))
  assert.throws(() => assertComplete({ load: { base: [1, 2], current: [1] } }, 2), /load.*current.*1\/2/)
})
