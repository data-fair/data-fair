import type { SessionState } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

/**
 * A hypothetical visitor, described with the same vocabulary as a session:
 * - {} is an anonymous visitor
 * - { user: {} } is any authenticated user, { user: { email } } a user designated by email,
 *   { user: { id, email } } a precise user
 * - organization adds a membership (and makes it the active account): the audited organization
 *   itself (a member, or any member with a given role/department) or a partner organization
 */
export type AsVisitor = {
  user?: { id?: string, email?: string }
  organization?: { id: string, name?: string, role: string, department?: string }
}

export type AsVisitorContext = {
  sessionState: SessionState
  ownerFilter: Record<string, string>
}

// a user id no permission entry nor resource owner can carry, used when the visitor is not a
// precise user (filterCan and matchPermission compare the user id, an undefined one would
// serialize as null in Mongo filters and match email-only permission entries)
export const unknownUserId = '*unknown*'

const optionalString = (value: any, key: string) => {
  if (value !== undefined && (typeof value !== 'string' || !value)) {
    throw httpError(400, `paramètre asVisitor invalide, propriété "${key}" incorrecte`)
  }
  return value as string | undefined
}

/**
 * Parses the asVisitor list query param (a JSON visitor descriptor supplied by an org admin) into
 * a synthetic SessionState for that visitor and the Mongo owner clause that hard-scopes the query
 * to the caller's org (and department for dept admins).
 * The descriptor is client-supplied on purpose: the caller is already admin over everything in
 * the forced scope, so a wrong role/department cannot escalate access.
 */
export const getAsVisitorContext = (rawParam: string, sessionState: SessionState, adminRole: string): AsVisitorContext => {
  if (!sessionState.user) throw httpError(401)
  // API keys mint a session with accountRole = adminRole for every org key regardless of scope
  // (see readApiKey in api-key.ts), so the adminRole check below cannot distinguish a real org
  // admin from a read-scoped API key. Reject API-key sessions outright: the feature is reserved
  // to interactive org admins.
  if ((sessionState as SessionState & { isApiKey?: boolean }).isApiKey) {
    throw httpError(403, 'le paramètre asVisitor n\'est pas utilisable avec une clé d\'API')
  }
  const account = sessionState.account
  if (!account || account.type !== 'organization') {
    throw httpError(403, 'le paramètre asVisitor requiert un compte organisation actif')
  }
  if (!sessionState.user.adminMode && sessionState.accountRole !== adminRole) {
    throw httpError(403, 'le paramètre asVisitor est réservé aux administrateurs de l\'organisation')
  }

  let visitor: any
  try {
    visitor = JSON.parse(rawParam)
  } catch (err) {
    throw httpError(400, 'paramètre asVisitor invalide, objet JSON attendu')
  }
  if (!visitor || typeof visitor !== 'object' || Array.isArray(visitor)) {
    throw httpError(400, 'paramètre asVisitor invalide, objet JSON attendu')
  }
  if (visitor.user !== undefined && (!visitor.user || typeof visitor.user !== 'object')) {
    throw httpError(400, 'paramètre asVisitor invalide, propriété "user" incorrecte')
  }
  const userId = optionalString(visitor.user?.id, 'user.id')
  const userEmail = optionalString(visitor.user?.email, 'user.email')
  const org = visitor.organization
  if (org !== undefined) {
    if (!org || typeof org !== 'object') throw httpError(400, 'paramètre asVisitor invalide, propriété "organization" incorrecte')
    for (const key of ['id', 'role'] as const) {
      if (typeof org[key] !== 'string' || !org[key]) {
        throw httpError(400, `paramètre asVisitor invalide, propriété "organization.${key}" manquante`)
      }
    }
    optionalString(org.name, 'organization.name')
    optionalString(org.department, 'organization.department')
  }

  const ownerFilter: Record<string, string> = { 'owner.type': 'organization', 'owner.id': account.id }
  // a department admin only audits their department's resources
  if (account.department) ownerFilter['owner.department'] = account.department

  // anonymous visitor
  if (!visitor.user && !org) return { sessionState: { lang: sessionState.lang }, ownerFilter }

  const user: NonNullable<SessionState['user']> = {
    id: userId ?? unknownUserId,
    email: userEmail ?? '',
    name: userEmail ?? userId ?? '',
    organizations: []
  }
  if (!org) {
    // an authenticated user outside of any organization: their personal account is active
    return {
      sessionState: { lang: sessionState.lang, user, account: { type: 'user', id: user.id, name: user.name }, accountRole: adminRole },
      ownerFilter
    }
  }

  const orgName = org.id === account.id ? account.name : (org.name ?? org.id)
  const membership: NonNullable<SessionState['organization']> = { id: org.id, name: orgName, role: org.role }
  if (org.department) membership.department = org.department
  user.organizations.push(membership)
  const syntheticAccount: NonNullable<SessionState['account']> = { type: 'organization', id: org.id, name: orgName }
  if (org.department) syntheticAccount.department = org.department

  return {
    sessionState: { lang: sessionState.lang, user, organization: membership, account: syntheticAccount, accountRole: org.role },
    ownerFilter
  }
}
