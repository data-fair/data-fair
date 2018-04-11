const createError = require('http-errors')

function userName(user) {
  if (user.name) return user.name
  if (user.firstName || user.lastName) return ((user.firstName || '') + ' ' + (user.lastName || '')).trim()
  if (user.email) return user.email.split('@').shift().split('.').map(str => str[0].toUpperCase() + str.slice(1)).join(' ')
}

exports.owner = (req) => {
  const organizationId = req.get('x-organizationId')
  if (!organizationId) {
    return { type: 'user', id: req.user.id, name: userName(req.user) }
  } else {
    const orga = req.user.organizations.find(o => o.id === organizationId)
    if (!orga) {
      throw createError(403, 'You cannot set an organization you do not belong too as owner')
    }
    return { type: 'organization', id: orga.id, name: orga.name }
  }
}
