exports.isOwner = (resource, user) => {
  if (!resource || !resource.owner || !user) return false
  if (resource.owner.type === 'user' && resource.owner.id === user.id) return true
  if (resource.owner.type === 'organization') {
    const userOrga = user.organizations.find(o => o.id === resource.owner.id)
    return userOrga && userOrga.role === window.CONFIG.adminRole
  }
}
