exports.description = 'contribs do not have an implicit write permission anymore'

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({
    'owner.type': 'organization',
    permissions: { $not: { $elemMatch: { roles: 'contrib' } } }
  })) {
    debug(`${dataset.id}`)
    const contribPermission = {
      type: dataset.owner.type,
      id: dataset.owner.id,
      name: dataset.owner.name,
      department: dataset.owner.department || '-',
      roles: ['contrib'],
      classes: ['write']
    }
    if (dataset.owner.departmentName) {
      contribPermission.departmentName = dataset.owner.departmentName
    }
    dataset.permissions = dataset.permissions || []
    dataset.permissions.push(contribPermission)
    await db.collection('datasets').updateOne(
      { id: dataset.id },
      { $set: { permissions: dataset.permissions } }
    )
  }
}
