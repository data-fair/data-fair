// Log fields describing a resource and its owner, shared by the audit lines (see docs/architecture/code-conventions.md).
// The actor (accountKey, userId...) comes from the implicit log context opened by the session middleware;
// the resource owner is a different notion and uses the owner* names.
// Config-free on purpose: only type imports.
import type { ResourceType } from '#types'

export type OwnerLike = { type: string, id: string, name?: string, department?: string }

export type OwnerLogFields = { ownerKey: string, ownerDep: string | undefined, ownerName: string | undefined }

// the 3 keys are always present, possibly undefined: spread after other owner fields (or logged in a
// context holding them) they override the previous values, and pino drops undefined values from the line
export function ownerLogFields (owner: OwnerLike): OwnerLogFields {
  return { ownerKey: owner.type + '.' + owner.id, ownerDep: owner.department || undefined, ownerName: owner.name || undefined }
}

export function resourceLogFields (type: ResourceType, resource: { id: string, owner: OwnerLike }): { resourceType: ResourceType, resourceId: string } & OwnerLogFields {
  return { resourceType: type, resourceId: resource.id, ...ownerLogFields(resource.owner) }
}

// log lines must stay small: cut any field that can carry user content or tool output
export function truncateLogValue (value: string, max = 1000): string {
  return value.length > max ? value.slice(0, max) + '…' : value
}
