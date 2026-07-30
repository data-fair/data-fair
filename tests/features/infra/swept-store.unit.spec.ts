import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { SweptStore } from '../../../api/src/misc/utils/swept-store.ts'

// One keyed store of per-client limiter state with a single idle-sweep rule, replacing the three
// ad-hoc registries in rate-limiting.ts whose scattered lastUsed handling caused two sweep bugs
// (entries created without lastUsed were never swept).

test.describe('SweptStore', () => {
  test('creates once per key and returns the same entry after', () => {
    const store = new SweptStore<{ lastUsed: number, n: number }>()
    let built = 0
    const factory = () => ({ lastUsed: 0, n: built++ })
    assert.equal(store.getOrCreate('a', factory).n, 0)
    assert.equal(store.getOrCreate('a', factory).n, 0)
    assert.equal(built, 1)
  })

  test('touches lastUsed on every access so active entries survive the sweep', () => {
    const store = new SweptStore<{ lastUsed: number }>()
    const entry = store.getOrCreate('a', () => ({ lastUsed: 0 }))
    assert.ok(entry.lastUsed > 0, 'creation must stamp lastUsed (the historical sweep bug)')
    store.sweep(20 * 60 * 1000, entry.lastUsed + 1000) // recently used → kept
    assert.equal(store.getOrCreate('a', () => ({ lastUsed: 0 })), entry)
  })

  test('sweeps entries idle beyond maxIdleMs', () => {
    const store = new SweptStore<{ lastUsed: number }>()
    const entry = store.getOrCreate('a', () => ({ lastUsed: 0 }))
    store.sweep(20 * 60 * 1000, entry.lastUsed + 21 * 60 * 1000)
    assert.notEqual(store.getOrCreate('a', () => ({ lastUsed: 0 })), entry)
  })

  test('recreates an entry the validity predicate rejects (config changed at runtime)', () => {
    const store = new SweptStore<{ lastUsed: number, budget: number }>()
    store.getOrCreate('a', () => ({ lastUsed: 0, budget: 10 }))
    const recreated = store.getOrCreate('a', () => ({ lastUsed: 0, budget: 20 }), e => e.budget === 20)
    assert.equal(recreated.budget, 20)
  })

  test('clear empties the store', () => {
    const store = new SweptStore<{ lastUsed: number }>()
    const entry = store.getOrCreate('a', () => ({ lastUsed: 0 }))
    store.clear()
    assert.notEqual(store.getOrCreate('a', () => ({ lastUsed: 0 })), entry)
  })
})
