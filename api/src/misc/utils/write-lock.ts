import type { Resource, ResourceType } from '#types'
import type { SessionState } from '@data-fair/lib-express'

// apiKey-only write lock (design doc §5.2, T8) — the pure predicate surface, split out of
// permissions.ts so it stays config-free (no #config / #mongo imports) and can be unit-tested
// directly, including a drift-ratchet test that walks the operations registry
// (shared/permissions/operations.ts, itself config-free) — see
// tests/features/integrity/writelock.unit.spec.ts.

// datasets 'admin'-class operationIds that mutate covered content or ACLs — the lock gates these
// in addition to the whole `write` class. The read-only admin operations
// (readIntegrity/readIntegrityRevisions/getPermissions) and the `_integrity` management routes
// themselves (never routed through a permission class — they call `reqAdminMode` directly, see
// datasets/routes/integrity.ts) are deliberately excluded: the lock is a posture on user-facing
// covered mutations, not on the management surface that sets it.
const WRITE_LOCK_ADMIN_OPERATIONS = new Set([
  'delete', 'setPermissions', 'changeOwner', 'writePublications', 'writePublicationSites', 'writeExports', 'setReadApiKey'
])

// `manageOwnLines`-class mutations (own-lines routes, api/src/datasets/routes/own-lines.ts) — the
// write-blast-radius equivalent of createLine/updateLine/patchLine/bulkLines/deleteLine for
// lines-owner-attributed REST datasets. Belt-and-braces: as of this writing this branch is
// unreachable in practice, because `enableIntegrity` (integrity/service.ts) refuses to enroll a
// dataset with `rest.lineOwnership` (the per-line `_owner`/`_ownerName` attribution is outside the
// integrity snapshot and would be lost on restore — see docs/architecture/integrity.md §5 "Lines-owner
// attribution"), and the write lock itself requires `integrity.active`. So a locked
// lineOwnership dataset cannot exist today. Covered anyway so this gate does not silently fail
// open if that mutual exclusion is ever loosened. Read-only ops of the class
// (readOwnLines/readOwnLine/readOwnLineRevisions/readOwnRevisions) are excluded, same rationale as
// the admin read-only ops above.
const WRITE_LOCK_OWN_LINES_OPERATIONS = new Set([
  'createOwnLine', 'updateOwnLine', 'patchOwnLine', 'bulkOwnLines', 'deleteOwnLine'
])

// Named, explicit list of the read-only operationIds within the `admin` and `manageOwnLines`
// classes that the write lock does NOT cover, by design. Exported so a unit test can walk
// shared/permissions/operations.ts (the single source of truth for classes) and assert every
// operation in the write-lock-relevant classes (write/admin/manageOwnLines) is either covered by
// `isCoveredMutation` or explicitly named here — a new operation added to one of those classes
// without being added to one side or the other fails that test instead of silently bypassing the
// lock (the exact drift that let `manageOwnLines` slip through originally).
export const WRITE_LOCK_READONLY_EXCEPTIONS = new Set([
  'getPermissions', 'readIntegrity', 'readIntegrityRevisions',
  'readOwnLines', 'readOwnLine', 'readOwnLineRevisions', 'readOwnRevisions'
])

// True when `operationId`/`operationClass` is a mutation covered by the apiKey-only write lock:
// the whole `write` class, plus the hand-picked `admin`/`manageOwnLines` mutations above. Exported
// as a pure predicate (no resource/session involved) so it can be unit-tested directly against the
// operations registry.
export const isCoveredMutation = (operationClass: string, operationId: string): boolean => {
  if (operationClass === 'write') return true
  if (operationClass === 'admin') return WRITE_LOCK_ADMIN_OPERATIONS.has(operationId)
  if (operationClass === 'manageOwnLines') return WRITE_LOCK_OWN_LINES_OPERATIONS.has(operationId)
  return false
}

// True when a locked dataset (`integrity.writeLock === 'apiKey'`) refuses this operation for the
// current session — a covered mutation (write class, or one of the admin/manageOwnLines mutations
// above) not authenticated by an API key. Superadmin sessions and application-key pseudo-sessions
// are refused too (design §5.2: discipline applies to everyone, application keys are not API keys).
export const isWriteLockRefused = (resourceType: ResourceType, resource: Resource, operationClass: string, operationId: string, sessionState: SessionState): boolean => {
  if (resourceType !== 'datasets') return false
  const writeLock = (resource as Resource & { integrity?: { writeLock?: string } }).integrity?.writeLock
  if (writeLock !== 'apiKey') return false
  if (!isCoveredMutation(operationClass, operationId)) return false
  return !(sessionState as SessionState & { isApiKey?: boolean }).isApiKey
}
