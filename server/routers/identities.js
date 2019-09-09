// Define a few routes to be used to synchronize data with the users/organizations directory
// Useful both for functionalities and help respect GDPR rules
const express = require('express')
const config = require('config')
const asyncWrap = require('../utils/async-wrap')

const router = module.exports = express.Router()

router.use((req, res, next) => {
  if (!config.secretKeys.identities || config.secretKeys.identities !== req.query.key) {
    return res.status(403).send('Bad secret in "key" parameter')
  }
  next()
})

const collectionNames = ['remote-services', 'applications', 'datasets', 'catalogs']

// notify a name change
router.post('/:type/:id', asyncWrap(async (req, res) => {
  const identity = { ...req.params, name: req.body.name }

  for (const c of collectionNames) {
    const collection = req.app.get('db').collection(c)
    await collection.updateMany({ 'owner.type': identity.type, 'owner.id': identity.id }, { $set: { 'owner.name': identity.name } })

    // permissions
    const cursor = collection.find({ permissions: { $elemMatch: { type: identity.type, id: identity.id } } })
    while (await cursor.hasNext()) {
      const doc = await cursor.next()
      doc.permissions
        .filter(permission => permission.type === identity.type && permission.id === identity.id)
        .forEach(permission => {
          permission.name = identity.name
        })
      await collection.updateOne({ id: doc.id }, { $set: { permissions: doc.permissions } })
    }

    // created/updated events
    if (identity.type === 'user') {
      await collection.updateMany({ 'createdBy.id': identity.id }, { $set: { createdBy: { id: identity.id, name: identity.name } } })
      await collection.updateMany({ 'updatedBy.id': identity.id }, { $set: { updatedBy: { id: identity.id, name: identity.name } } })
    }
  }

  // settings and quotas
  await req.app.get('db').collection('settings').updateOne({ type: identity.type, id: identity.id }, { $set: { name: identity.name } }, { upsert: true })
  await req.app.get('db').collection('quotas').updateOne({ type: identity.type, id: identity.id }, { $set: { name: identity.name } }, { upsert: true })

  res.send()
}))

// Remove resources owned, permissions and anonymize created and updated
router.delete('/:type/:id', asyncWrap(async (req, res) => {
  const identity = req.params

  for (const c of collectionNames) {
    const collection = req.app.get('db').collection(c)
    await collection.deleteMany({ 'owner.type': identity.type, 'owner.id': identity.id })

    // permissions
    const cursor = collection.find({ permissions: { $elemMatch: { type: identity.type, id: identity.id } } })
    while (await cursor.hasNext()) {
      const doc = await cursor.next()
      const permissions = doc.permissions.filter(permission => permission.type !== identity.type || permission.id !== identity.id)
      await collection.updateOne({ id: doc.id }, { $set: { permissions } })
    }

    // created/updated events
    if (identity.type === 'user') {
      await collection.updateMany({ 'createdBy.id': identity.id }, { $set: { createdBy: { id: identity.id, name: null } } })
      await collection.updateMany({ 'updatedBy.id': identity.id }, { $set: { updatedBy: { id: identity.id, name: null } } })
    }
  }

  // settings and quotas
  await req.app.get('db').collection('settings').deleteOne({ type: identity.type, id: identity.id })
  await req.app.get('db').collection('quotas').deleteOne({ type: identity.type, id: identity.id })

  res.send()
}))

// Ask for a report of every piece of data in the service related to an identity
router.get('/:type/:id/report', asyncWrap(async (req, res) => {
  const collections = [{ id: 'remote-services', title: 'Configurations de services' }, { id: 'applications', title: 'Configurations d\'applications' }, { id: 'datasets', title: 'Jeux de données' }]
  const report = {
    owns: [],
    hasPermissions: []
  }
  for (const c of collections) {
    const collection = req.app.get('db').collection(c.id)
    const results = (await collection.find({ 'owner.type': req.query.type, 'owner.id': req.query.id }).toArray())
    report.owns.push({ collection: c.title, items: results.map(item => ({ title: item.title || item.id, href: config.publicUrl + '/' + c.id.substring(0, c.id.length - 1) + '/' + item.id + '/description' })) })
    // permissions
    const cursor = collection.find({ permissions: { $elemMatch: { type: req.query.type, id: req.query.id } } })
    const permissions = []
    while (await cursor.hasNext()) {
      const doc = await cursor.next()
      if (doc.permissions.filter(permission => permission.type === req.query.type && permission.id === req.query.id).length) {
        permissions.push({ title: doc.title || doc.id, href: config.publicUrl + '/' + c.id.substring(0, c.id.length - 1) + '/' + doc.id + '/description' })
      }
    }
    report.hasPermissions.push({ collection: c.title, items: permissions })

    // created/updated events
    if (req.query.type === 'user') {
      report.hasCreated = report.hasCreated || []
      report.hasUpdated = report.hasUpdated || []
      const hasCreatedResults = (await collection.find({ 'createdBy.id': req.query.id }).toArray())
      report.hasCreated.push({ collection: c.title, items: hasCreatedResults.map(item => ({ title: item.title || item.id, href: config.publicUrl + '/' + c.id.substring(0, c.id.length - 1) + '/' + item.id + '/description' })) })
      const hasUpdatedResults = (await collection.find({ 'updatedBy.id': req.query.id }).toArray())
      report.hasUpdated.push({ collection: c.title, items: hasUpdatedResults.map(item => ({ title: item.title || item.id, href: config.publicUrl + '/' + c.id.substring(0, c.id.length - 1) + '/' + item.id + '/description' })) })
    }
  }
  res.send(report)
}))
