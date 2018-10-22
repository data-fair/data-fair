const express = require('express')

const asyncWrap = require('../utils/async-wrap')

const config = require('config')

const router = express.Router()

// Used by the users' directory to notify name updates
router.post('/update-name', asyncWrap(async (req, res) => {
  const key = req.query.key
  if (!config.secretKeys.ownerNames || config.secretKeys.ownerNames !== key) {
    return res.status(403).send('Bad secret in "key" parameter')
  }
  const collectionNames = ['remote-services', 'applications', 'datasets']
  for (let c of collectionNames) {
    const collection = req.app.get('db').collection(c)
    await collection.updateMany({ 'owner.type': req.body.type, 'owner.id': req.body.id }, { $set: { 'owner.name': req.body.name } })

    // permissions
    const cursor = collection.find({ permissions: { $elemMatch: { type: req.body.type, id: req.body.id } } })
    while (await cursor.hasNext()) {
      const doc = await cursor.next()
      doc.permissions
        .filter(permission => permission.type === req.body.type && permission.id === req.body.id)
        .forEach(permission => {
          permission.name = req.body.name
        })
      await collection.updateOne({ id: doc.id }, { $set: { permissions: doc.permissions } })
    }

    // created/updated events
    if (req.body.type === 'user') {
      await collection.updateMany({ 'createdBy.id': req.body.id }, { $set: { 'createdBy': { id: req.body.id, name: req.body.name } } })
      await collection.updateMany({ 'updatedBy.id': req.body.id }, { $set: { 'updatedBy': { id: req.body.id, name: req.body.name } } })
    }
  }

  // personal settings
  await req.app.get('db').collection('settings').updateOne({ type: req.body.type, id: req.body.id }, { $set: { name: req.body.name } })

  res.send()
}))

// Remove resources owned, permissions and anonymize created and updated
router.post('/delete', asyncWrap(async (req, res) => {
  const key = req.query.key
  if (!config.secretKeys.ownerNames || config.secretKeys.ownerNames !== key) {
    return res.status(403).send('Bad secret in "key" parameter')
  }
  const collectionNames = ['remote-services', 'applications', 'datasets']
  for (let c of collectionNames) {
    const collection = req.app.get('db').collection(c)
    await collection.deleteMany({ 'owner.type': req.body.type, 'owner.id': req.body.id })

    // permissions
    const cursor = collection.find({ permissions: { $elemMatch: { type: req.body.type, id: req.body.id } } })
    while (await cursor.hasNext()) {
      const doc = await cursor.next()
      const permissions = doc.permissions.filter(permission => permission.type !== req.body.type || permission.id !== req.body.id)
      await collection.updateOne({ id: doc.id }, { $set: { permissions } })
    }

    // created/updated events
    if (req.body.type === 'user') {
      await collection.updateMany({ 'createdBy.id': req.body.id }, { $set: { 'createdBy': { id: req.body.id, name: null } } })
      await collection.updateMany({ 'updatedBy.id': req.body.id }, { $set: { 'updatedBy': { id: req.body.id, name: null } } })
    }
  }
  res.send()
}))

router.get('/appear-in', asyncWrap(async (req, res) => {
  // TODO : check user auth here
  // TODO : use path parameters instead
  if (!req.query.type || !req.query.id) {
    return res.status(400).send('"type" and "id" parameters are mandatory')
  }
  const collections = [{ id: 'remote-services', title: 'Configurations de services' }, { id: 'applications', title: 'Configurations d\'applications' }, { id: 'datasets', title: 'Jeux de données' }]
  const report = {
    owns: [],
    hasPermissions: []
  }
  for (let c of collections) {
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

module.exports = router
