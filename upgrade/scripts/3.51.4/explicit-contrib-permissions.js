exports.description = 'contribs do not have an implicit write permission anymore'

exports.exec = async (db, debug) => {
  const initPermissions = (resource) => {
    const contribPermission = {
      type: resource.owner.type,
      id: resource.owner.id,
      name: resource.owner.name,
      department: resource.owner.department || '-',
      roles: ['contrib'],
      classes: ['write']
    }
    if (resource.owner.departmentName) {
      contribPermission.departmentName = resource.owner.departmentName
    }
    const permissions = resource.permissions || []
    permissions.push(contribPermission)
    return permissions
  }

  for await (const dataset of db.collection('datasets').find({
    'owner.type': 'organization',
    permissions: { $not: { $elemMatch: { roles: 'contrib' } } }
  })) {
    debug(`dataset ${dataset.id}`)
    const permissions = initPermissions(dataset)
    await db.collection('datasets').updateOne(
      { id: dataset.id },
      { $set: { permissions } }
    )
  }

  for await (const application of db.collection('applications').find({
    'owner.type': 'organization',
    permissions: { $not: { $elemMatch: { roles: 'contrib' } } }
  })) {
    debug(`application ${application.id}`)
    const permissions = initPermissions(application)
    await db.collection('applications').updateOne(
      { id: application.id },
      { $set: { permissions } }
    )
  }
}
