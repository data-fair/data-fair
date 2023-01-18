exports.description = 'contribs do not have an implicit write permission anymore'

exports.exec = async (db, debug) => {
  const initPermissions = (resource, classes, operations = []) => {
    const contribPermission = {
      type: resource.owner.type,
      id: resource.owner.id,
      name: resource.owner.name,
      department: resource.owner.department || '-',
      roles: ['contrib'],
      classes,
      operations
    }
    if (resource.owner.departmentName) {
      contribPermission.departmentName = resource.owner.departmentName
    }
    const permissions = (resource.permissions || [])
    permissions.push(contribPermission)
    return permissions
  }
  for (const resourceType of ['datasets', 'applications']) {
    for await (const resource of db.collection(resourceType).find({
      'owner.type': 'organization',
      permissions: { $not: { $elemMatch: { roles: 'contrib', classes: 'write' } } }
    })) {
      debug(`resource ${resourceType} / ${resource.id}`)
      const permissions = initPermissions(resource, ['write'], ['delete'])
      await db.collection(resourceType).updateOne(
        { id: resource.id },
        { $set: { permissions } }
      )
    }
    for await (const resource of db.collection(resourceType).find({
      'owner.type': 'organization',
      permissions: { $not: { $elemMatch: { roles: 'contrib', classes: 'read' } } }
    })) {
      debug(`resource ${resourceType} / ${resource.id}`)
      const permissions = initPermissions(resource, ['list', 'read', 'readAdvanced'])
      await db.collection(resourceType).updateOne(
        { id: resource.id },
        { $set: { permissions } }
      )
    }
  }
}
