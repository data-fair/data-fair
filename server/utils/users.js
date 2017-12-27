const createError = require('http-errors')

exports.owner = (req) => {
  const organizationId = req.get('x-organizationId')
  if (!organizationId) {
    return { type: 'user', id: req.user.id }
  } else {
    if (req.user.organizations.map(o => o.id).indexOf(organizationId) === -1) {
      throw createError(403, 'You cannot set an organization you do not belong too as owner')
    }
    return { type: 'organization', id: organizationId }
  }
}
