// tests/features/integrity/writelock.unit.spec.ts
// Unit-level coverage for the apiKey-only write lock predicate (api/src/misc/utils/write-lock.ts),
// split out of writelock.api.spec.ts (server-backed integration tests). Two review findings:
//
// - Finding 1: `isCoveredMutation` must cover the mutating `manageOwnLines` operations
//   (createOwnLine/updateOwnLine/patchOwnLine/bulkOwnLines/deleteOwnLine), not just `write` and the
//   hand-picked `admin` subset. This is unreachable through the API today (a locked dataset requires
//   `integrity.active`, and `enableIntegrity` refuses `rest.lineOwnership` datasets — see
//   api/src/integrity/service.ts and docs/architecture/integrity.md §5 "Lines-owner attribution"),
//   so it cannot be exercised end to end; asserted directly on the pure predicate instead.
// - Finding 2: the covered-set is a hand-maintained mirror of shared/permissions/operations.ts (the
//   single source of truth for operation classes) — exactly how the manageOwnLines gap happened. A
//   drift-ratchet test walks every operation in the write-lock-relevant classes (write/admin/
//   manageOwnLines) and requires each one to be either covered by `isCoveredMutation` or listed in
//   the named `WRITE_LOCK_READONLY_EXCEPTIONS` exclusion — a newly added operation in one of those
//   classes fails this test (fail closed) instead of silently bypassing the lock (fail open).
import { test, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { isCoveredMutation, WRITE_LOCK_READONLY_EXCEPTIONS } from '../../../api/src/misc/utils/write-lock.ts'
import { operationsClasses } from '../../../shared/permissions/operations.ts'

test.describe('isCoveredMutation', () => {
  test('covers the whole write class', () => {
    for (const op of operationsClasses.datasets.write) {
      expect(isCoveredMutation('write', op)).toBe(true)
    }
  })

  test('covers the mutating manageOwnLines operations (Finding 1)', () => {
    for (const op of ['createOwnLine', 'updateOwnLine', 'patchOwnLine', 'bulkOwnLines', 'deleteOwnLine']) {
      expect(isCoveredMutation('manageOwnLines', op)).toBe(true)
    }
  })

  test('does not cover the read-only manageOwnLines operations', () => {
    for (const op of ['readOwnLines', 'readOwnLine', 'readOwnLineRevisions', 'readOwnRevisions']) {
      expect(isCoveredMutation('manageOwnLines', op)).toBe(false)
    }
  })

  test('covers the hand-picked admin mutations, not the read-only admin operations', () => {
    for (const op of ['delete', 'setPermissions', 'changeOwner', 'writePublications', 'writePublicationSites', 'writeExports', 'setReadApiKey']) {
      expect(isCoveredMutation('admin', op)).toBe(true)
    }
    for (const op of ['getPermissions', 'readIntegrity', 'readIntegrityRevisions']) {
      expect(isCoveredMutation('admin', op)).toBe(false)
    }
  })

  test('is false for read/list/readAdvanced classes and unknown classes', () => {
    expect(isCoveredMutation('read', 'readDescription')).toBe(false)
    expect(isCoveredMutation('list', 'list')).toBe(false)
    expect(isCoveredMutation('readAdvanced', 'readJournal')).toBe(false)
    expect(isCoveredMutation('unknown', 'whatever')).toBe(false)
  })
})

test.describe('write-lock coverage drift ratchet (Finding 2)', () => {
  // Every operationId in the write-lock-relevant classes must be either covered by the predicate or
  // explicitly named as a read-only exception. A new operation added to one of these classes in
  // shared/permissions/operations.ts without a corresponding decision here fails loudly instead of
  // silently bypassing the lock.
  test('every write/admin/manageOwnLines operation is covered or explicitly excluded', () => {
    const relevantClasses = ['write', 'admin', 'manageOwnLines']
    const uncategorized: string[] = []
    const contradictory: string[] = []

    for (const cl of relevantClasses) {
      const ids = operationsClasses.datasets[cl] || []
      assert.ok(ids.length > 0, `expected class "${cl}" to have operations in shared/permissions/operations.ts`)
      for (const id of ids) {
        const covered = isCoveredMutation(cl, id)
        const excepted = WRITE_LOCK_READONLY_EXCEPTIONS.has(id)
        if (!covered && !excepted) uncategorized.push(`${cl}/${id}`)
        if (covered && excepted) contradictory.push(`${cl}/${id}`)
      }
    }

    assert.deepEqual(uncategorized, [],
      'these operations are neither covered by isCoveredMutation nor listed in WRITE_LOCK_READONLY_EXCEPTIONS ' +
      '(api/src/misc/utils/write-lock.ts) — a new mutating operation must be added to the covered set, ' +
      'a new read-only operation must be added to the exceptions list.')
    assert.deepEqual(contradictory, [],
      'these operations are both covered and in the read-only exceptions list — remove them from one side.')
  })

  // Guards the exceptions list itself against drift: every id in it must still exist in one of the
  // relevant classes (so it stays a meaningful, load-bearing exclusion rather than dead config).
  test('every WRITE_LOCK_READONLY_EXCEPTIONS entry is a real admin/manageOwnLines operation', () => {
    const known = new Set([...(operationsClasses.datasets.admin || []), ...(operationsClasses.datasets.manageOwnLines || [])])
    const stale = [...WRITE_LOCK_READONLY_EXCEPTIONS].filter((id) => !known.has(id))
    assert.deepEqual(stale, [], 'these WRITE_LOCK_READONLY_EXCEPTIONS entries no longer exist in the admin/manageOwnLines classes — remove them.')
  })
})
