import type { SessionState } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

/**
 * A hypothetical visitor, serialized as colon-separated segments (like the owner filters):
 * - `anonymous`
 * - `connected`: any authenticated user
 * - `email:<email>`: a user designated by email, not a member of the audited organization
 * - `member:<id>:<email>:<role>[:<department>]`: a precise member of the audited organization
 * - `role:<role>[:<department>]`: any member of the audited organization with this role
 * - `partner:<orgId>`: a member of a partner organization (partner permissions carry no role)
 */
type AsVisitor = {
  user?: { id?: string, email?: string }
  organization?: { id: string, role: string, department?: string }
}

export type AsVisitorContext = {
  sessionState: SessionState
  ownerFilter: Record<string, string>
}

// a user id no permission entry nor resource owner can carry, used when the visitor is not a
// precise user (filterCan and matchPermission compare the user id, an undefined one would
// serialize as null in Mongo filters and match email-only permission entries)
export const unknownUserId = '*unknown*'

const invalid = (raw: string) => httpError(400, `paramètre asVisitor invalide "${raw}"`)

/** Parses the asVisitor param, the audited account giving the organization of member and role visitors. */
export const parseAsVisitor = (raw: string, accountId: string): AsVisitor => {
  // the simple query parser turns a repeated param into an array
  if (typeof raw !== 'string') throw invalid(String(raw))
  const [kind, ...parts] = raw.split(':')
  if (parts.some(part => !part)) throw invalid(raw)
  const arity = (min: number, max = min) => { if (parts.length < min || parts.length > max) throw invalid(raw) }
  switch (kind) {
    case 'anonymous':
      arity(0)
      return {}
    case 'connected':
      arity(0)
      return { user: {} }
    case 'email':
      arity(1)
      return { user: { email: parts[0] } }
    case 'member': {
      arity(3, 4)
      const [id, email, role, department] = parts
      return { user: { id, email }, organization: { id: accountId, role, department } }
    }
    case 'role': {
      arity(1, 2)
      const [role, department] = parts
      return { organization: { id: accountId, role, department } }
    }
    case 'partner':
      arity(1)
      // the permissions editor never restricts a partner permission by role, any role gives the same result
      return { organization: { id: parts[0], role: 'user' } }
    default:
      throw invalid(raw)
  }
}

/**
 * Parses the asVisitor list query param (a visitor descriptor supplied by an org admin) into
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

  const visitor = parseAsVisitor(rawParam, account.id)
  const org = visitor.organization

  const ownerFilter: Record<string, string> = { 'owner.type': 'organization', 'owner.id': account.id }
  // a department admin only audits their department's resources
  if (account.department) ownerFilter['owner.department'] = account.department

  // anonymous visitor
  if (!visitor.user && !org) return { sessionState: { lang: sessionState.lang }, ownerFilter }

  const user: NonNullable<SessionState['user']> = {
    id: visitor.user?.id ?? unknownUserId,
    email: visitor.user?.email ?? '',
    name: visitor.user?.email ?? visitor.user?.id ?? '',
    organizations: []
  }
  if (!org) {
    // an authenticated user outside of any organization: their personal account is active
    return {
      sessionState: { lang: sessionState.lang, user, account: { type: 'user', id: user.id, name: user.name }, accountRole: adminRole },
      ownerFilter
    }
  }

  const orgName = org.id === account.id ? account.name : org.id
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
