const createError = require('http-errors')

exports.owner = (req) => {
  // Either explicitly pass the chose owner for this resource (the user or one of his organizations)
  // or deduce it from the currently active organization
  const organizationId = req.get('x-organizationId') || (req.user.organization && req.user.organization.id)
  if (!organizationId || organizationId === 'user') {
    return { type: 'user', id: req.user.id, name: req.user.name }
  } else {
    const orga = req.user.organizations.find(o => o.id === organizationId)
    if (!orga) {
      throw createError(403, 'You cannot set an organization you do not belong to as owner')
    }
    const role = req.get('x-organizationRole')
    return { type: 'organization', id: orga.id, name: orga.name, role }
  }
}
