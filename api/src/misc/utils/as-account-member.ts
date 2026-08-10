import type { SessionState } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

export type AsAccountMember = {
  id: string
  email: string
  role: string
  department?: string
}

export type AsAccountMemberContext = {
  sessionState: SessionState
  ownerFilter: Record<string, string>
}

/**
 * Parses the asAccountMember list query param (a JSON member descriptor supplied by an org admin)
 * into a synthetic SessionState for that member (with the org as active account) and the Mongo
 * owner clause that hard-scopes the query to the caller's org (and department for dept admins).
 * The descriptor is client-supplied on purpose: the caller is already admin over everything in
 * the forced scope, so a wrong role/department cannot escalate access.
 */
export const getAsAccountMemberContext = (rawParam: string, sessionState: SessionState, adminRole: string): AsAccountMemberContext => {
  if (!sessionState.user) throw httpError(401)
  const account = sessionState.account
  if (!account || account.type !== 'organization') {
    throw httpError(403, 'le paramètre asAccountMember requiert un compte organisation actif')
  }
  if (!sessionState.user.adminMode && sessionState.accountRole !== adminRole) {
    throw httpError(403, 'le paramètre asAccountMember est réservé aux administrateurs de l\'organisation')
  }

  let member: any
  try {
    member = JSON.parse(rawParam)
  } catch (err) {
    throw httpError(400, 'paramètre asAccountMember invalide, objet JSON attendu')
  }
  for (const key of ['id', 'email', 'role'] as const) {
    if (typeof member?.[key] !== 'string' || !member[key]) {
      throw httpError(400, `paramètre asAccountMember invalide, propriété "${key}" manquante`)
    }
  }
  if (member.department !== undefined && (typeof member.department !== 'string' || !member.department)) {
    throw httpError(400, 'paramètre asAccountMember invalide, propriété "department" incorrecte')
  }

  const membership: NonNullable<SessionState['organization']> = {
    id: account.id,
    name: account.name,
    role: member.role
  }
  if (member.department) membership.department = member.department
  const syntheticAccount: NonNullable<SessionState['account']> = {
    type: 'organization',
    id: account.id,
    name: account.name
  }
  if (member.department) syntheticAccount.department = member.department

  const syntheticSessionState: SessionState = {
    lang: sessionState.lang,
    user: { id: member.id, email: member.email, name: member.email, organizations: [membership] },
    organization: membership,
    account: syntheticAccount,
    accountRole: member.role
  }

  const ownerFilter: Record<string, string> = { 'owner.type': 'organization', 'owner.id': account.id }
  // a department admin only audits their department's resources
  if (account.department) ownerFilter['owner.department'] = account.department

  return { sessionState: syntheticSessionState, ownerFilter }
}
