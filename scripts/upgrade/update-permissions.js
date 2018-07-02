const dbUtils = require('../../server/utils/db')

// One shot script to update permissions by adding classes from operationIds
async function main() {
  const {db} = await dbUtils.init()
  const datasets = await db.collection('datasets').find({}).project({permissions: 1, id: 1}).toArray()
  for (let dataset of datasets) {
    dataset.permissions.forEach(p => {
      if (!p.operations || !p.operations.length) p.classes = ['list', 'read', 'write', 'admin']
      else {
        p.classes = ['read']
        if (p.operations.includes('writeDescription')) {
          p.classes.push('write')
        }
      }
      p.operations = []
    })
    await db.collection('datasets').updateOne({id: dataset.id}, {$set: {permissions: dataset.permissions}, $unset: { public: '', userPermissions: '' }})
  }
  const remoteServices = await db.collection('remote-services').find({}).project({permissions: 1, id: 1}).toArray()
  for (let remoteService of remoteServices) {
    remoteService.permissions.forEach(p => {
      if (!p.operations || !p.operations.length) p.classes = ['list', 'read', 'write', 'admin', 'use']
      else {
        p.classes = ['read', 'use']
        if (p.operations.includes('writeDescription')) {
          p.classes.push('write')
        }
      }
      p.operations = []
    })
    await db.collection('remote-services').updateOne({id: remoteService.id}, {$set: {permissions: remoteService.permissions}})
  }
  const applications = await db.collection('applications').find({}).project({permissions: 1, id: 1}).toArray()
  for (let application of applications) {
    application.permissions = application.permissions || []
    application.permissions.forEach(p => {
      if (!p.operations || !p.operations.length) p.classes = ['list', 'read', 'write', 'admin']
      else {
        p.classes = ['read']
        if (p.operations.includes('readDescription')) {
          p.classes.push('list')
        }
        if (p.operations.includes('writeDescription')) {
          p.classes.push('write')
        }
      }
      p.operations = []
    })
    await db.collection('applications').updateOne({id: application.id}, {$set: {permissions: application.permissions}})
  }
}

main().then(() => process.exit())
