const createError = require('http-errors')

exports.owner = (req) => {
  const organizationId = req.get('x-organizationId')
  if (!organizationId) {
    return { type: 'user', id: req.user.id, name: req.user.name }
  } else {
    const orga = req.user.organizations.find(o => o.id === organizationId)
    if (!orga) {
      throw createError(403, 'You cannot set an organization you do not belong to as owner')
    }
    return { type: 'organization', id: orga.id, name: orga.name }
  }
}
