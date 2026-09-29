export type AuditVisitorKind = 'member' | 'role' | 'partner' | 'email' | 'connected' | 'anonymous'

export const auditVisitorKinds: AuditVisitorKind[] = ['member', 'role', 'partner', 'email', 'connected', 'anonymous']

/** The visitor chosen on the access audit page (names are only there for display). */
export type AuditVisitor = {
  kind: AuditVisitorKind
  member?: { id: string, name: string, email?: string, role?: string, department?: string }
  role?: string
  department?: string
  partner?: { id: string, name: string }
  email?: string
}

// colon-separated segments per kind, the same as the asVisitor API param (see api/src/misc/utils/as-visitor.ts)
const segments = (visitor: AuditVisitor): (string | undefined)[] => {
  switch (visitor.kind) {
    case 'email': return [visitor.email]
    case 'member': return visitor.member ? [visitor.member.id, visitor.member.email, visitor.member.role, visitor.member.department] : []
    case 'role': return [visitor.role, visitor.department]
    case 'partner': return [visitor.partner?.id]
    default: return []
  }
}

/** Serializes a visitor, possibly not fully described yet (the page persists it in its URL while it is being chosen). */
export const serializeVisitor = (visitor: AuditVisitor): string => {
  const parts = segments(visitor).map(part => part ?? '')
  while (parts.length && !parts[parts.length - 1]) parts.pop()
  return [visitor.kind, ...parts].join(':')
}

/** Parses a serialized visitor; display names fall back to ids until they are chosen again. */
export const parseVisitor = (raw: string): AuditVisitor | null => {
  const [kind, ...parts] = raw.split(':')
  const [a, b, c, d] = parts.map(part => part || undefined)
  switch (kind) {
    case 'email': return { kind, email: a }
    case 'member': return { kind, member: a ? { id: a, name: b ?? a, email: b, role: c, department: d } : undefined }
    case 'role': return { kind, role: a, department: b }
    case 'partner': return { kind, partner: a ? { id: a, name: a } : undefined }
    case 'connected':
    case 'anonymous': return { kind }
    default: return null
  }
}

/**
 * The asVisitor API param for a visitor, or undefined while the visitor is not fully described.
 * `account` is the audited organization; a department admin's department is forced on role visitors
 * (member visitors carry their own department, and member-select only offers the admin's department).
 */
export const asVisitorParam = (visitor: AuditVisitor | null, account: { department?: string }): string | undefined => {
  if (!visitor) return undefined
  if (visitor.kind === 'role' && account.department) visitor = { ...visitor, department: account.department }
  const required = { email: 1, member: 3, role: 1, partner: 1, connected: 0, anonymous: 0 }[visitor.kind]
  const parts = segments(visitor)
  for (let i = 0; i < required; i++) if (!parts[i]) return undefined
  return serializeVisitor(visitor)
}

/** Why a visitor reaches a resource, as returned on list results in asVisitor mode (see permissions.accessSources). */
export type AccessSources = {
  ownerRole?: string
  ownerClasses: string[]
  permissions: {
    type?: 'user' | 'organization' | null
    id?: string | null
    name?: string
    email?: string
    department?: string | null
    departmentName?: string
    roles?: string[]
    classes?: string[]
    operations?: string[]
  }[]
}
