/**
 * The "scope" of a permissions recap query: a hypothetical visitor, described the same
 * way a Permission entry describes its beneficiary.
 *
 * This module is config-free and side-effect-free so it can be imported by the API, by
 * the UI bundle, and later by another service embedding the recap in an iframe. It is
 * the single definition of the URL contract — see
 * docs/superpowers/specs/2026-08-17-permissions-recap-design.md §4.
 */

export type PermissionScopeType = 'public' | 'user' | 'organization'

export interface PermissionScope {
  type: PermissionScopeType
  /** account id, or '*' for "all authenticated users" (user scope only) */
  id?: string
  /** user scope designated by email */
  email?: string
  /** a department id; absent means "any department" */
  department?: string
  /** absent or empty means "any role" */
  roles?: string[]
}

const scopeTypes: PermissionScopeType[] = ['public', 'user', 'organization']

/** Reads a scope from flat query parameters. Returns null when no scope is requested. */
export const parseScopeParams = (params: Record<string, string | undefined>): PermissionScope | null => {
  const type = params.scopeType
  if (!type || !scopeTypes.includes(type as PermissionScopeType)) return null
  const scope: PermissionScope = { type: type as PermissionScopeType }
  if (params.scopeId) scope.id = params.scopeId
  if (params.scopeEmail) scope.email = params.scopeEmail
  if (params.scopeDepartment) scope.department = params.scopeDepartment
  const roles = params.scopeRoles?.split(',').filter(Boolean)
  if (roles?.length) scope.roles = roles
  return scope
}

/** Serializes a scope back to flat query parameters, omitting empty values. */
export const scopeToParams = (scope: PermissionScope | null): Record<string, string> => {
  if (!scope) return {}
  const params: Record<string, string> = { scopeType: scope.type }
  if (scope.id) params.scopeId = scope.id
  if (scope.email) params.scopeEmail = scope.email
  if (scope.department) params.scopeDepartment = scope.department
  if (scope.roles?.length) params.scopeRoles = scope.roles.join(',')
  return params
}

/**
 * The six situations an administrator has in mind, in the order of the selector.
 * A scenario is UI intent: it is derived from the scope, never stored in the URL.
 */
export type PermissionScenario = 'group' | 'member' | 'partner' | 'email' | 'connected' | 'anonymous'

/**
 * Returns null when the scope carries no scenario yet — an empty user scope is both
 * 'member' and 'email' waiting for input, an organization scope with no id is a partner
 * not chosen yet. Callers keep their current scenario in that case.
 */
export const scenarioFromScope = (scope: PermissionScope | null, ownerId: string): PermissionScenario | null => {
  if (!scope) return null
  if (scope.type === 'public') return 'anonymous'
  if (scope.type === 'user') {
    if (scope.id === '*') return 'connected'
    if (scope.id) return 'member'
    if (scope.email) return 'email'
    return null
  }
  if (!scope.id) return null
  return scope.id === ownerId ? 'group' : 'partner'
}

/** The scope a scenario starts from, before its contextual control is filled in. */
export const scopeFromScenario = (scenario: PermissionScenario, ownerId: string): PermissionScope => {
  if (scenario === 'anonymous') return { type: 'public' }
  if (scenario === 'connected') return { type: 'user', id: '*' }
  if (scenario === 'member' || scenario === 'email') return { type: 'user' }
  if (scenario === 'group') return { type: 'organization', id: ownerId }
  return { type: 'organization' }
}
