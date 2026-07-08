// Synchronize data with the users/organizations directory.
// Useful both for functionalities and to help respect GDPR rules.

import { type Application } from 'express'
import config from '#config'
import mongo from '#mongo'
import filesStorage from '#files-storage'
import * as datasetsService from '../datasets/service.ts'
import { ownerDir } from '../datasets/utils/files.ts'
import { stampHistorizeMany } from '../integrity/outbox.ts'

export type Identity = { type: string, id: string, name?: string }
type Department = { id: string, name: string }

const collectionNames = ['applications', 'datasets', 'catalogs', 'applications-keys', 'journals']

// notify a name change across all resources owned by, shared with or authored by an identity
export const renameIdentity = async (identity: Identity, departments?: Department[]) => {
  for (const c of collectionNames) {
    const collection = mongo.db.collection(c)
    const ownerFilter = { 'owner.type': identity.type, 'owner.id': identity.id }
    await collection.updateMany(ownerFilter, { $set: { 'owner.name': identity.name } })
    if (c === 'datasets') await stampHistorizeMany(ownerFilter)
    if (departments) {
      for (const department of departments) {
        const departmentFilter = { 'owner.type': identity.type, 'owner.id': identity.id, 'owner.department': department.id }
        await collection.updateMany(departmentFilter, { $set: { 'owner.departmentName': department.name } })
        if (c === 'datasets') await stampHistorizeMany(departmentFilter)
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
      if (c === 'datasets') await stampHistorizeMany({ id: doc.id })
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
      if (c === 'datasets') await stampHistorizeMany({ id: doc.id })
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
      await stampHistorizeMany({ id: dataset.id })
    }
  }
}

// remove resources owned, permissions, and anonymize created/updated events + the whole data directory
export const deleteIdentity = async (app: Application, identity: Identity) => {
  const datasetsCursor = mongo.db.collection('datasets').find({ 'owner.type': identity.type, 'owner.id': identity.id })
  for await (const dataset of datasetsCursor) {
    await datasetsService.deleteDataset(app, dataset)
  }

  for (const c of collectionNames) {
    const collection = mongo.db.collection(c)
    await collection.deleteMany({ 'owner.type': identity.type, 'owner.id': identity.id })

    // permissions
    const cursor = collection.find({ permissions: { $elemMatch: { type: identity.type, id: identity.id } } })
    for await (const doc of cursor) {
      const permissions = doc.permissions.filter((permission: any) => permission.type !== identity.type || permission.id !== identity.id)
      await collection.updateOne({ id: doc.id }, { $set: { permissions } })
      if (c === 'datasets') await stampHistorizeMany({ id: doc.id })
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
}

type ReportItem = { title: string, href: string }
type ReportSection = { collection: string, items: ReportItem[] }
type IdentityReport = {
  owns: ReportSection[],
  hasPermissions: ReportSection[],
  hasCreated?: ReportSection[],
  hasUpdated?: ReportSection[]
}

// produce a report of every piece of data in the service related to an identity
export const reportIdentity = async (query: Record<string, any>): Promise<IdentityReport> => {
  const collections = [
    { id: 'remote-services', title: 'Configurations de services' },
    { id: 'applications', title: 'Configurations d\'applications' },
    { id: 'datasets', title: 'Jeux de données' }
  ]
  const report: IdentityReport = {
    owns: [],
    hasPermissions: []
  }
  for (const c of collections) {
    const collection = mongo.db.collection(c.id)
    const results = (await collection.find({ 'owner.type': query.type, 'owner.id': query.id }).toArray())
    report.owns.push({ collection: c.title, items: results.map(item => ({ title: item.title || item.id, href: config.publicUrl + '/' + c.id.substring(0, c.id.length - 1) + '/' + item.id + '/description' })) })
    // permissions
    const cursor = collection.find({ permissions: { $elemMatch: { type: query.type, id: query.id } } })
    const permissions: ReportItem[] = []
    for await (const doc of cursor) {
      if (doc.permissions.filter((permission: any) => permission.type === query.type && permission.id === query.id).length) {
        permissions.push({ title: doc.title || doc.id, href: config.publicUrl + '/' + c.id.substring(0, c.id.length - 1) + '/' + doc.id + '/description' })
      }
    }
    report.hasPermissions.push({ collection: c.title, items: permissions })

    // created/updated events
    if (query.type === 'user') {
      report.hasCreated = report.hasCreated || []
      report.hasUpdated = report.hasUpdated || []
      const hasCreatedResults = (await collection.find({ 'createdBy.id': query.id }).toArray())
      report.hasCreated.push({ collection: c.title, items: hasCreatedResults.map(item => ({ title: item.title || item.id, href: config.publicUrl + '/' + c.id.substring(0, c.id.length - 1) + '/' + item.id + '/description' })) })
      const hasUpdatedResults = (await collection.find({ 'updatedBy.id': query.id }).toArray())
      report.hasUpdated.push({ collection: c.title, items: hasUpdatedResults.map(item => ({ title: item.title || item.id, href: config.publicUrl + '/' + c.id.substring(0, c.id.length - 1) + '/' + item.id + '/description' })) })
    }
  }
  return report
}
