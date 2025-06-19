export const owner = (req) => {
  // it is possible to specify owner of a new resource
  // permission canDoForOwner should be checked afterward
  if (req.body && req.body.owner) return req.body.owner

  // for other people it is based on the active account
  const orga = req.user.organization
  if (orga) {
    const owner = { type: 'organization', id: orga.id, name: orga.name }
    if (orga.department) owner.department = orga.department
    if (orga.departmentName) owner.departmentName = orga.departmentName
    return owner
  }
  return { type: 'user', id: req.user.id, name: req.user.name }
}

export const getPseudoUser = (owner, name, defaultId, defaultRole, department) => {
  const pseudoUser = { name: 'extension' }
  if (owner.type === 'user') {
    pseudoUser.id = owner.id
    pseudoUser.organizations = []
    pseudosessionState.account = { ...owner, role: 'admin' }
  } else {
    pseudoUser.id = defaultId
    pseudosessionState.account = { ...owner, role: defaultRole }
    if (department) {
      if (department === '-') {
        delete pseudosessionState.account.department
      } else {
        pseudosessionState.account.department = department
      }
    }
    pseudoUser.organizations = [pseudosessionState.account]
  }
  return pseudoUser
}
