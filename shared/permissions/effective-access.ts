import type { PermissionScope } from './scope.ts'

/**
 * Why a scope reaches a resource. The mirror of matchPermission (api/src/misc/utils/
 * permissions.ts) applied to a hypothetical visitor instead of a session, returning the
 * entries that matched instead of a boolean.
 *
 * Config-free and side-effect-free, so the UI, the API and the tests share one evaluator.
 * It must stay in step with scopeFilter: the list says which resources, this says why, and
 * the two disagreeing would be worse than either being absent.
 */

export type AccessSourceKind =
  | 'public' | 'connected' | 'user' | 'email' | 'organization' | 'ownerAdmin' | 'personalAccount'

export interface AccessSource {
  kind: AccessSourceKind
  classes: string[]
  operations: string[]
  roles?: string[]
  department?: string
  organizationId?: string
  organizationName?: string
}

export interface PermissionEntry {
  type?: 'user' | 'organization' | null
  id?: string | null
  name?: string
  email?: string
  department?: string | null
  departmentName?: string
  roles?: string[]
  operations?: string[]
  classes?: string[]
}

export interface AccessResource {
  owner: { type: string, id: string, department?: string }
  permissions?: PermissionEntry[]
}

/** '*' and '-' are the editor's "any department" and "no department"; neither is a real one. */
const realDepartment = (department?: string | null) =>
  department && department !== '*' && department !== '-' ? department : null

/**
 * The organization the scope acts in, if any. Mirrors the two branches of scopeFilter:
 * an organization scope names it, a user scope carrying a membership acts in the audited
 * account.
 */
const organizationContext = (scope: PermissionScope, account: { type: string, id: string }) => {
  if (scope.type === 'organization' && scope.id) {
    return { id: scope.id, roles: scope.roles, department: scope.department }
  }
  if (scope.type === 'user' && scope.id !== '*' && account.type === 'organization' &&
      (scope.roles?.length || scope.department)) {
    return { id: account.id, roles: scope.roles, department: scope.department }
  }
  return null
}

export const effectiveAccess = (
  scope: PermissionScope,
  resource: AccessResource,
  account: { type: string, id: string },
  adminRole = 'admin'
): AccessSource[] => {
  const sources: AccessSource[] = []
  const grant = (kind: AccessSourceKind, permission: PermissionEntry, extra: Partial<AccessSource> = {}) => {
    sources.push({ kind, classes: permission.classes ?? [], operations: permission.operations ?? [], ...extra })
  }

  const org = organizationContext(scope, account)
  // no role selected means the group contains its admins too, which is how scopeFilter reads it
  const anyRole = !!org && (!org.roles?.length || org.roles.includes(adminRole))
  const orgDepartment = realDepartment(org?.department)

  for (const permission of resource.permissions ?? []) {
    if (!permission.type && !permission.id) {
      grant('public', permission)
      continue
    }
    if (permission.type === 'user') {
      if (permission.id === '*') {
        if (scope.type !== 'public') grant('connected', permission)
        continue
      }
      if (scope.type !== 'user') continue
      if (permission.id && permission.id === scope.id) grant('user', permission)
      else if (permission.email && permission.email === scope.email) grant('email', permission)
      continue
    }
    if (permission.type === 'organization' && org && permission.id === org.id) {
      const permissionDepartment = realDepartment(permission.department)
      if (orgDepartment && permissionDepartment && permissionDepartment !== orgDepartment) continue
      if (!anyRole && permission.roles?.length && !permission.roles.some(role => org.roles!.includes(role))) continue
      grant('organization', permission, {
        roles: permission.roles?.length ? permission.roles : undefined,
        department: permission.department ?? undefined,
        organizationId: org.id,
        organizationName: permission.name
      })
    }
  }

  // implicit rights, which are not permission entries
  if (org && anyRole && resource.owner.type === 'organization' && resource.owner.id === org.id &&
      (!orgDepartment || orgDepartment === resource.owner.department)) {
    sources.push({ kind: 'ownerAdmin', classes: [], operations: [] })
  }
  if (scope.type === 'user' && scope.id && scope.id !== '*' &&
      resource.owner.type === 'user' && resource.owner.id === scope.id) {
    sources.push({ kind: 'personalAccount', classes: [], operations: [] })
  }

  return sources
}

/** The union of the permission classes held, or '*' when a source grants everything. */
export const accessClasses = (sources: AccessSource[]): string[] | '*' => {
  if (sources.some(source => source.kind === 'ownerAdmin' || source.kind === 'personalAccount')) return '*'
  const classes = new Set<string>()
  for (const source of sources) for (const cl of source.classes) classes.add(cl)
  return [...classes]
}
