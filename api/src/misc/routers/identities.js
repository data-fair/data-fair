// Define a few routes to be used to synchronize data with the users/organizations directory
// Useful both for functionalities and help respect GDPR rules

import express from 'express'
import config from '#config'
import * as datasetsService from '../../datasets/service.js'
import { ownerDir } from '../../datasets/utils/files.ts'
import mongo from '#mongo'
import filesStorage from '#files-storage'

const router = express.Router()
export default router

router.use((req, res, next) => {
  if (!config.secretKeys.identities || config.secretKeys.identities !== req.query.key) {
    return res.status(403).type('text/plain').send('Bad secret in "key" parameter')
  }
  next()
})

const collectionNames = ['applications', 'datasets', 'catalogs', 'applications-keys', 'journals']

// notify a name change
router.post('/:type/:id', async (req, res) => {
  const identity = { ...req.params, name: req.body.name }

  for (const c of collectionNames) {
    const collection = mongo.db.collection(c)
    await collection.updateMany({ 'owner.type': identity.type, 'owner.id': identity.id }, { $set: { 'owner.name': identity.name } })
    if (req.body.departments) {
      for (const department of req.body.departments) {
        await collection.updateMany({ 'owner.type': identity.type, 'owner.id': identity.id, 'owner.department': department.id }, { $set: { 'owner.departmentName': department.name } })
      }
    }

    // permissions
    const cursor1 = collection.find({ permissions: { $elemMatch: { type: identity.type, id: identity.id } } })
    for await (const doc of cursor1) {
      for (const permission of doc.permissions) {
        if (permission.type === identity.type && permission.id === identity.id) {
          permission.name = identity.name
        }
      }
      await collection.updateOne({ id: doc.id }, { $set: { permissions: doc.permissions } })
    }

    // privateAccess
    const cursor2 = collection.find({ privateAccess: { $elemMatch: { type: identity.type, id: identity.id } } })
    for await (const doc of cursor2) {
      for (const privateAccess of doc.privateAccess) {
        if (privateAccess.type === identity.type && privateAccess.id === identity.id) {
          privateAccess.name = identity.name
        }
      }
      await collection.updateOne({ id: doc.id }, { $set: { privateAccess: doc.privateAccess } })
    }

    // created/updated events
    if (identity.type === 'user') {
      await collection.updateMany({ 'createdBy.id': identity.id }, { $set: { createdBy: { id: identity.id, name: identity.name } } })
      await collection.updateMany({ 'updatedBy.id': identity.id }, { $set: { updatedBy: { id: identity.id, name: identity.name } } })
    }
  }

  // settings and limits
  await mongo.db.collection('settings').updateOne({ type: identity.type, id: identity.id, department: { $exists: false } }, { $set: { name: identity.name } }, { upsert: true })
  await mongo.db.collection('limits').updateOne({ type: identity.type, id: identity.id }, { $set: { name: identity.name } })

  // dataset.masterData.shareOrgs
  if (identity.type === 'organization') {
    const cursor = mongo.datasets.find({ 'masterData.shareOrgs': { $elemMatch: { id: identity.id } } })
    for await (const dataset of cursor) {
      for (const shareOrg of dataset.masterData?.shareOrgs ?? []) {
        if (shareOrg.id === identity.id) {
          shareOrg.name = identity.name
        }
      }
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { masterData: dataset.masterData } })
    }
  }

  res.send()
})

// Remove resources owned, permissions and anonymize created and updated
router.delete('/:type/:id', async (req, res) => {
  const identity = req.params

  const datasetsCursor = mongo.db.collection('datasets').find({ 'owner.type': identity.type, 'owner.id': identity.id })
  for await (const dataset of datasetsCursor) {
    await datasetsService.deleteDataset(req.app, dataset)
  }

  for (const c of collectionNames) {
    const collection = mongo.db.collection(c)
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

  // settings and limits
  await mongo.db.collection('settings').deleteMany({ type: identity.type, id: identity.id })
  await mongo.db.collection('limits').deleteOne({ type: identity.type, id: identity.id })

  // whole data directory
  await filesStorage.removeDir(ownerDir(identity))

  res.send()
})

// Ask for a report of every piece of data in the service related to an identity
router.get('/:type/:id/report', async (req, res) => {
  const collections = [{ id: 'remote-services', title: 'Configurations de services' }, { id: 'applications', title: 'Configurations d\'applications' }, { id: 'datasets', title: 'Jeux de données' }]
  const report = {
    owns: [],
    hasPermissions: []
  }
  for (const c of collections) {
    const collection = mongo.db.collection(c.id)
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
})
