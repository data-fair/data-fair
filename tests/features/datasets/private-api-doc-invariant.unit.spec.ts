import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { operationsClasses, adminOperationsClasses, contribOperationsClasses, operationsByResource, datasetOperationGrantedBy } from '../../../shared/permissions/operations.ts'

// Every dataset operation id that can be granted through a permission (class-based, owner-admin, contrib).
const grantable = new Set<string>()
for (const ops of Object.values(operationsClasses.datasets)) for (const op of ops) grantable.add(op)
for (const op of adminOperationsClasses.datasets) grantable.add(op)
for (const op of contribOperationsClasses.datasets) grantable.add(op)

const datasetById = new Map(operationsByResource.datasets.map((o) => [o.id, o]))

// The files that declare the operations assembled into the dataset private doc. We parse the static
// operationId literals rather than execute the generator (which pulls in the whole api config), and
// check them against the permission class and alt relationships in shared/permissions/operations.ts.
const contractFiles = [
  '../../../api/contract/dataset-api-docs.ts',
  '../../../api/contract/dataset-private-api-docs.ts',
  '../../../api/src/misc/utils/permissions.ts'
].map((p) => new URL(p, import.meta.url))

const parseOperationIds = (src: string): string[] => [...src.matchAll(/operationId: '([^']+)'/g)].map((m) => m[1])

test.describe('private-api-docs contextual filter invariant', () => {
  // The contextual filter (dataset-private-api-docs.ts) keeps a route only if the caller holds an
  // operation that grants it (datasetOperationGrantedBy). A documented route that maps to no grantable
  // permission and is not superadmin-only would be hidden from EVERY non-superadmin user — silently.
  // This pins both that this never happens AND that every documented operation is known to the source
  // of truth (so the contract can't drift away from shared/permissions/operations.ts).
  test('every documented operation is known to the source of truth and reachable', () => {
    const ids = contractFiles.flatMap((f) => parseOperationIds(readFileSync(f, 'utf8')))
    // Guard against the regex silently parsing nothing (which would make the assertions vacuous).
    assert.ok(ids.length > 30, `expected to parse many operationIds from the contracts, got ${ids.length}`)

    const unknown: string[] = []
    const unreachable: string[] = []
    for (const id of ids) {
      const desc = datasetById.get(id)
      if (!desc) { unknown.push(id); continue }
      if (desc.grouping === 'superadmin') continue // reachable in admin mode only, never granted — OK
      if (!datasetOperationGrantedBy(id).some((g) => grantable.has(g))) unreachable.push(id)
    }
    assert.deepEqual([...new Set(unknown)], [],
      'these documented operationIds are unknown to shared/permissions/operations.ts — the contract drifted from the source of truth; add a descriptor for them.')
    assert.deepEqual([...new Set(unreachable)], [],
      'these operationIds map to no grantable permission and would be hidden from every non-superadmin user.\n' +
      "Fix: add the id to a class in shared/permissions/operations.ts, point its grantedByAlts at a grantable operation, or mark it grouping: 'superadmin'.")
  })
})
