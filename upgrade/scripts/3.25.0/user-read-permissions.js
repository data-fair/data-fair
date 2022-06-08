exports.description = 'Create default permissions to compensate for more restrictire "user" role.'

async function setPermission (debug, collection, resource) {
  const permissions = resource.permissions || []
  if (!permissions.find(p => p.type === 'organization' && p.id === resource.owner.id)) {
    debug('add missing permission')
    permissions.push({ type: 'organization', id: resource.owner.id, name: resource.owner.name, operations: [], classes: ['read', 'list'] })
    await collection.updateOne({ id: resource.id }, { $set: { permissions } })
  }
}

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ 'owner.type': 'organization' })) {
    debug('update permissions of dataset', dataset.id)
    await setPermission(debug, db.collection('datasets'), dataset)
  }
  for await (const application of db.collection('applications').find({ 'owner.type': 'organization' })) {
    debug('update permissions of application', application.id)
    await setPermission(debug, db.collection('applications'), application)
  }
}
