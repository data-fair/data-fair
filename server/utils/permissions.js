// TODO : replace api with a name that match external-api and dataset
module.exports = function(api, operationId, user) {
  if (!user) {
    const operationPermissions = api.permissions.filter(p => p.operationId === operationId)
    // check if the operation is public
    if (operationPermissions.find(p => !p.type && !p.id)) return true
    return false
  } else {
    // Check if the user is the owner of the API or in an organization that have the API
    if ((api.owner.type === 'user' && api.owner.id === user.id) || (api.owner.type === 'organization' && user.organizations.find(o => o.id === api.owner.id))) {
      return true
    } else {
      const operationPermissions = api.permissions.filter(p => p.operationId === operationId)
      if (operationPermissions.find(p => (p.type === 'user' && p.id === user.id) || (p.type === 'organization' && user.organizations.find(o => o.id === p.id)))) return true
      return false
    }
  }
}
