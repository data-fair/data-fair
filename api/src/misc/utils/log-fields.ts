// Log fields describing a resource and its owner, shared by the audit lines (see docs/architecture/code-conventions.md).
// The actor (accountKey, userId...) comes from the implicit log context opened by the session middleware;
// the resource owner is a different notion and uses the owner* names.
// Config-free on purpose: only type imports.
import type { ResourceType } from '#types'

export type OwnerLike = { type: string, id: string, name?: string, department?: string }

export type OwnerLogFields = { ownerKey: string, ownerDep?: string, ownerName?: string }

export function ownerLogFields (owner: OwnerLike): OwnerLogFields {
  const fields: OwnerLogFields = { ownerKey: owner.type + '.' + owner.id }
  if (owner.department) fields.ownerDep = owner.department
  if (owner.name) fields.ownerName = owner.name
  return fields
}

export function resourceLogFields (type: ResourceType, resource: { id: string, owner: OwnerLike }): { resourceType: ResourceType, resourceId: string } & OwnerLogFields {
  return { resourceType: type, resourceId: resource.id, ...ownerLogFields(resource.owner) }
}
