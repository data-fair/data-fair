exports.owner = (req) => {
  // super admin can explicitly set owner, for others it is deduced
  if (req.body && req.body.owner && req.user.adminMode) return req.body.owner

  // for other people it is based on the active account
  const orga = req.user.organization
  if (orga) {
    if (orga.department) return { type: 'organization', id: orga.id, name: orga.name, department: orga.department }
    else return { type: 'organization', id: orga.id, name: orga.name }
  }
  return { type: 'user', id: req.user.id, name: req.user.name }
}
