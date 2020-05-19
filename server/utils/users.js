const createError = require('http-errors')

exports.owner = (req) => {
  // super admin can explicitly set owner, for others it is deduced
  if (req.body && req.body.owner && req.user.adminMode) return req.body.owner

  // Either explicitly pass the chosen owner for this resource (the user or one of his organizations)
  // or deduce it from the currently active organization
  const organizationId = req.get('x-organizationId') || (req.user.organization && req.user.organization.id)
  let orga = req.user.organization
  if (organizationId && organizationId !== 'user') {
    orga = req.user.organizations.find(o => o.id === organizationId)
    if (!orga) {
      throw createError(403, 'You cannot set an organization you do not belong to as owner')
    }
  }
  if (orga) {
    const role = req.get('x-organizationRole')
    return { type: 'organization', id: orga.id, name: orga.name, role }
  }
  return { type: 'user', id: req.user.id, name: req.user.name }
}
