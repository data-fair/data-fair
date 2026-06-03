import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { computeExcludedOwners } from '../../../api/src/workers/concurrency.ts'

// computeExcludedOwners decides which owners are barred from grabbing a new slot on a
// worker, to enforce fair allocation between accounts. `concurrencyLimitPerAccount` is the
// fraction (0-1) of a worker's slots a single owner may use; at 1 the rules are disabled.

const owner = (id: string) => ({ type: 'organization' as const, id })
const pendingFor = (...ids: string[]) => ids.map(id => ({ owner: owner(id) }))

test.describe('computeExcludedOwners', () => {
  test('ratio 1 (default): a single owner holding every slot is never excluded', () => {
    // full-concurrency default — fair-allocation rules off, all slots usable by one owner
    const pending = pendingFor('a', 'a', 'a', 'a')
    assert.deepEqual(computeExcludedOwners(4, pending, 1), [])
  })

  test('ratio 1: no exclusions even when the worker is completely full', () => {
    const pending = pendingFor('a', 'a', 'b', 'b')
    assert.deepEqual(computeExcludedOwners(4, pending, 1), [])
  })

  test('ratio 0.5: owner reaching half the slots is excluded (rule 1)', () => {
    // max 8 slots, half = 4. Owner "a" holds 4 -> excluded. Owner "b" holds 1 -> not.
    const pending = pendingFor('a', 'a', 'a', 'a', 'b')
    assert.deepEqual(computeExcludedOwners(8, pending, 0.5), [owner('a')])
  })

  test('ratio 0.5: owner just below half is not excluded', () => {
    // max 8 slots, half = 4. Owner "a" holds 3 -> not excluded yet.
    const pending = pendingFor('a', 'a', 'a', 'b')
    assert.deepEqual(computeExcludedOwners(8, pending, 0.5), [])
  })

  test('ratio 0.5: an owner is only listed once even with several tasks over the limit', () => {
    const pending = pendingFor('a', 'a', 'a', 'a', 'a')
    assert.deepEqual(computeExcludedOwners(8, pending, 0.5), [owner('a')])
  })

  test('rule 2: with only the last slot free, owners already running are excluded', () => {
    // max 4 slots, 3 used by distinct owners under the half-limit (floor(4*0.5)=2, none reach it),
    // but only one slot remains -> reserve it for a different owner, so all running owners are excluded.
    const pending = pendingFor('a', 'b', 'c')
    assert.deepEqual(computeExcludedOwners(4, pending, 0.5), [owner('a'), owner('b'), owner('c')])
  })

  test('a very small ratio excludes any owner already running a task', () => {
    // floor(5 * 0.1) = 0, so any owner holding >= 1 task is over its share. Documents that a ratio
    // below 1/maxConcurrency limits every owner to a single concurrent task on that worker.
    const pending = pendingFor('a', 'b')
    assert.deepEqual(computeExcludedOwners(5, pending, 0.1), [owner('a'), owner('b')])
  })

  test('rules are disabled when a worker has fewer than 2 slots', () => {
    const pending = pendingFor('a')
    assert.deepEqual(computeExcludedOwners(1, pending, 0.5), [])
  })

  test('users and organizations with the same id are distinct owners', () => {
    const pending = [
      { owner: { type: 'user' as const, id: 'x' } },
      { owner: { type: 'organization' as const, id: 'x' } }
    ]
    // max 4, half = 2, each "owner" holds only 1 -> neither excluded by rule 1; only 2 used so rule 2 off
    assert.deepEqual(computeExcludedOwners(4, pending, 0.5), [])
  })
})
