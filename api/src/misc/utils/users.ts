import { type Request } from 'express'
import { type Account, reqSessionAuthenticated, type SessionStateAuthenticated } from '@data-fair/lib-express'

export const owner = (req: Request) => {
  // it is possible to specify owner of a new resource
  // permission canDoForOwner should be checked afterward
  const body = req.body as any
  if (body && body.owner) return body.owner as Account

  const sessionState = reqSessionAuthenticated(req)

  // for other people it is based on the active account
  const orga = sessionState.organization
  if (orga) {
    const owner: Account = { type: 'organization', id: orga.id, name: orga.name }
    if (orga.department) owner.department = orga.department
    if (orga.departmentName) owner.departmentName = orga.departmentName
    return owner
  }
  return { type: 'user', id: sessionState.user.id, name: sessionState.user.name }
}

export const getPseudoSessionState = (owner: Account, name: string, defaultId: string, defaultRole: string, department?: string): SessionStateAuthenticated & { isPseudoSession: true } => {
  if (owner.type === 'user') {
    return {
      isPseudoSession: true,
      lang: 'fr',
      user: {
        id: owner.id,
        name,
        email: '',
        organizations: []
      },
      account: { ...owner },
      accountRole: 'admin'
    }
  } else {
    const account = { ...owner }
    if (department) {
      if (department === '-') {
        delete account.department
      } else {
        account.department = department
      }
    }
    const userOrg = { ...account, type: undefined, role: defaultRole }
    const sessionState: SessionStateAuthenticated & { isPseudoSession: true } = {
      isPseudoSession: true,
      lang: 'fr',
      user: {
        id: defaultId,
        name,
        email: '',
        organizations: [userOrg]
      },
      account,
      accountRole: defaultRole,
      organization: userOrg
    }
    return sessionState
  }
}
