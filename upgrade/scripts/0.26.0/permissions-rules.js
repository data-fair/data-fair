exports.description = 'There is now more rules on how to set permissions in the UI. This update bring permissions as if they were set with the new UI.'

exports.exec = async (db, debug) => {
  for (const resourceName of ['datasets', 'remote-services', 'applications', 'catalogs']) {
    const cursor = db.collection(resourceName).find({})
    debug('*****', resourceName, '*****')
    while (await cursor.hasNext()) {
      const resource = await cursor.next()
      if (resource.permissions && resource.permissions.length) {
        debug('Updating permissions for', resource.id)
        debug('old :', resource.permissions)
        resource.permissions.forEach(p => {
          if (p.classes) p.classes = p.classes.filter(c => c !== 'admin' && c !== 'write')
          if (p.operations) p.operations = p.operations.filter(c => c !== 'admin' && c !== 'write')
        })
        debug('new :', resource.permissions)
        await db.collection(resourceName).updateOne({ _id: resource._id }, { $set: { permissions: resource.permissions } })
      }
    }
  }
}
