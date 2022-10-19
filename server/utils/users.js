exports.owner = (req) => {
  // super admin can explicitly set owner, for others it is deduced
  if (req.body && req.body.owner && req.user.adminMode) return req.body.owner

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
