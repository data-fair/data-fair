export type AuditVisitorKind = 'member' | 'role' | 'partner' | 'email' | 'connected' | 'anonymous'

export const auditVisitorKinds: AuditVisitorKind[] = ['member', 'role', 'partner', 'email', 'connected', 'anonymous']

/** The visitor chosen on the access audit page, as persisted in the URL (with display names). */
export type AuditVisitor = {
  kind: AuditVisitorKind
  member?: { id: string, name: string, email?: string, role?: string, department?: string }
  role?: string
  department?: string
  partner?: { id: string, name: string }
  email?: string
}

/**
 * The asVisitor API descriptor for a visitor, or undefined while the visitor is not fully described.
 * `account` is the audited organization; a department admin's department is forced on role visitors
 * (member visitors carry their own department, and member-select only offers the admin's department).
 */
export const asVisitorDescriptor = (visitor: AuditVisitor | null, account: { id: string, department?: string }): string | undefined => {
  if (!visitor) return undefined
  switch (visitor.kind) {
    case 'anonymous':
      return JSON.stringify({})
    case 'connected':
      return JSON.stringify({ user: {} })
    case 'email':
      if (!visitor.email) return undefined
      return JSON.stringify({ user: { email: visitor.email } })
    case 'member': {
      const m = visitor.member
      if (!m?.id || !m.email || !m.role) return undefined
      const organization: Record<string, string> = { id: account.id, role: m.role }
      if (m.department) organization.department = m.department
      return JSON.stringify({ user: { id: m.id, email: m.email }, organization })
    }
    case 'role': {
      if (!visitor.role) return undefined
      const organization: Record<string, string> = { id: account.id, role: visitor.role }
      const department = account.department ?? visitor.department
      if (department) organization.department = department
      return JSON.stringify({ organization })
    }
    case 'partner':
      if (!visitor.partner) return undefined
      // the permissions editor never restricts a partner permission by role, any role gives the same result
      return JSON.stringify({ organization: { id: visitor.partner.id, name: visitor.partner.name, role: 'user' } })
  }
}
