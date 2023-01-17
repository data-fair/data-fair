exports.description = 'contribs do not have an implicit write permission anymore'

exports.exec = async (db, debug) => {
  const initPermissions = (resource) => {
    const contribPermission = {
      type: resource.owner.type,
      id: resource.owner.id,
      name: resource.owner.name,
      department: resource.owner.department || '-',
      roles: ['contrib'],
      classes: ['list', 'read', 'readAdvanced', 'write']
    }
    if (resource.owner.departmentName) {
      contribPermission.departmentName = resource.owner.departmentName
    }
    const permissions = (resource.permissions || []).filter(p => {
      return !(p.roles && p.roles.length === 1 && p.roles[0] === 'contrib' && p.classes && p.classes.length === 1 && p.classes[0] === 'write')
    })
    permissions.push(contribPermission)
    return permissions
  }
  for (const resourceType of ['datasets', 'applications']) {
    for await (const resource of db.collection(resourceType).find({
      'owner.type': 'organization',
      permissions: { $not: { $elemMatch: { roles: 'contrib', classes: 'list' } } }
    })) {
      debug(`resource ${resourceType} / ${resource.id}`)
      const permissions = initPermissions(resource)
      await db.collection('datasets').updateOne(
        { id: resource.id },
        { $set: { permissions } }
      )
    }
  }
}
