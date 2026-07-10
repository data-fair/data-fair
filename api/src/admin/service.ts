import config from '#config'
import mongo from '#mongo'
import moment from 'moment'
import axios from '../misc/utils/axios.ts'
import * as clamav from '../misc/utils/clamav.ts'
import filesStorage from '#files-storage'
import debugModule from 'debug'
import * as findUtils from '../misc/utils/find.ts'
import { clean as cleanBaseApp } from '../base-applications/operations.ts'

const debug = debugModule('status')

async function mongoStatus (req: any) {
  debug('mongoStatus ?')
  await mongo.db.command({ ping: 1 })
  debug('mongoStatus ok')
}

async function esStatus (req: any) {
  debug('esStatus ?')
  const es = req.app.get('es')
  const health = await es.cluster.health()
  const healthStatus = health?.status
  if (healthStatus === 'green') {
    // OK
  } else if (config.elasticsearch.acceptYellowStatus && healthStatus === 'yellow') {
    // OK
  } else {
    throw new Error('Health status is ' + healthStatus)
  }
  debug('esStatus ok')
  /* since v8 ingest-attachment is no longer a plugin, it is pre-packaged
  const ingestAttachment = (await es.cat.plugins({ format: 'json' })).find(p => p.component === 'ingest-attachment')
  if (!ingestAttachment) throw new Error('Ingest attachment plugin is not installed.')
  */
}

async function jwksStatus (req: any) {
  debug('jwksStatus ?')
  const jwksRes = (await axios.get((config.privateDirectoryUrl || config.directoryUrl) + '/.well-known/jwks.json')).data
  if (!jwksRes || !jwksRes.keys || !jwksRes.keys.length) throw new Error('Incomplete JWKS response')
  debug('jwksStatus ok')
}

async function dataDirStatus (req: any) {
  debug('dataDirStatus ?')
  await filesStorage.checkAccess()
  debug('dataDirStatus ok')
}

async function singleStatus (req: any, fn: (req: any) => Promise<void>, name: string) {
  const time = moment()
  try {
    await fn(req)
    return { status: 'ok', name, timeInMs: moment().diff(time) }
  } catch (err) {
    return { status: 'error', message: (err as Error).toString(), name, timeInMs: moment().diff(time) }
  }
}

export async function listDatasetsWithEsWarnings (size = 1000, skip = 0) {
  const datasets = mongo.db.collection('datasets')
  const query: any = { esWarning: { $exists: true, $ne: null } }
  const resultsPromise = datasets
    .find(query)
    .skip(skip)
    .limit(size)
    .project({ _id: 0, id: 1, title: 1, owner: 1, esWarning: 1, status: 1 })
    .toArray()
  const [count, results] = await Promise.all([datasets.countDocuments(query), resultsPromise])
  return { count, results }
}

export async function findDatasetsErrors (reqQuery: Record<string, any>) {
  const datasets = mongo.db.collection('datasets')
  const query = { status: 'error' }
  const [skip, size] = findUtils.pagination(reqQuery)

  const aggregatePromise = datasets.aggregate([
    { $match: query },
    { $project: { _id: 0, id: 1, title: 1, description: 1, updatedAt: 1, owner: 1 } },
    { $sort: { updatedAt: -1 } },
    { $skip: skip },
    { $limit: size },
    { $lookup: { from: 'journals', localField: 'id', foreignField: 'id', as: 'journal' } },
    { $unwind: '$journal' },
    { $match: { 'journal.type': 'dataset' } },
    { $addFields: { event: { $arrayElemAt: ['$journal.events', -1] } } },
    { $project: { id: 1, title: 1, description: 1, updatedAt: 1, owner: 1, event: 1 } }
  ]).toArray()

  const [count, results] = await Promise.all([datasets.countDocuments(query), aggregatePromise])
  return { count, results }
}

export async function findDatasetsEsWarnings (reqQuery: Record<string, any>) {
  const [skip, size] = findUtils.pagination(reqQuery)
  return listDatasetsWithEsWarnings(size, skip)
}

export async function findApplicationsErrors (reqQuery: Record<string, any>) {
  const applications = mongo.db.collection('applications')
  const query = { errorMessage: { $exists: true } }
  const [skip, size] = findUtils.pagination(reqQuery)
  const resultsPromise = applications
    .find(query)
    .skip(skip)
    .limit(size)
    .project({ _id: 0, id: 1, title: 1, description: 1, updatedAt: 1, owner: 1, errorMessage: 1, status: 1 })
    .toArray()
  const [count, results] = await Promise.all([applications.countDocuments(query), resultsPromise])
  return { count, results }
}

export async function findApplicationsDraftErrors (reqQuery: Record<string, any>) {
  const applications = mongo.db.collection('applications')
  const query = { errorMessageDraft: { $exists: true } }
  const [skip, size] = findUtils.pagination(reqQuery)
  const resultsPromise = applications
    .find(query)
    .skip(skip)
    .limit(size)
    .project({ _id: 0, id: 1, title: 1, description: 1, updatedAt: 1, owner: 1, errorMessageDraft: 1, status: 1 })
    .toArray()
  const [count, results] = await Promise.all([applications.countDocuments(query), resultsPromise])
  return { count, results }
}

export async function findOwners (reqQuery: Record<string, any>) {
  const limits = mongo.db.collection('limits')
  const [skip, size] = findUtils.pagination(reqQuery)
  const query: any = {}
  if (reqQuery.q) query.$text = { $search: reqQuery.q }

  const agg = [{
    $match: query
  }, {
    $sort: { name: 1 }
  }, {
    $skip: skip
  }, {
    $limit: size
  }, {
    // imperfect.. we should do a lookup on both owner.id and owner.type
    $lookup: {
      from: 'datasets',
      localField: 'id',
      foreignField: 'owner.id',
      as: 'datasets'
    }
  }, {
    // imperfect.. we should do a lookup on both owner.id and owner.type
    $lookup: {
      from: 'applications',
      localField: 'id',
      foreignField: 'owner.id',
      as: 'applications'
    }
  }, {
    $project: {
      id: 1,
      type: 1,
      name: 1,
      nbDatasets: { $size: '$datasets' },
      nbApplications: { $size: '$applications' },
      consumption: 1,
      storage: 1
    }
  }]

  const aggPromise = limits.aggregate(agg).toArray()
  const [count, results] = await Promise.all([limits.countDocuments(query), aggPromise])
  return { count, results }
}

export async function findBaseApplications (reqQuery: Record<string, any>, publicBaseUrl: string) {
  const baseApps = mongo.db.collection('base-applications')
  const [skip, size] = findUtils.pagination(reqQuery)
  const query: any = {}
  if (reqQuery.public) query.public = true
  if (reqQuery.q) query.$text = { $search: reqQuery.q }

  const agg = [{
    $match: query
  }, {
    $sort: { public: -1 }
  }, {
    $skip: skip
  }, {
    $limit: size
  }, {
    $lookup: {
      from: 'applications',
      localField: 'url',
      foreignField: 'url',
      as: 'applications'
    }
  }, {
    $project: {
      id: 1,
      title: 1,
      applicationName: 1,
      version: 1,
      description: 1,
      category: 1,
      meta: 1,
      url: 1,
      artefactId: 1,
      image: 1,
      deprecated: 1,
      public: 1,
      privateAccess: 1,
      nbApplications: { $size: '$applications' },
      servicesFilters: 1,
      datasetsFilters: 1
    }
  }]

  const aggPromise = baseApps.aggregate(agg).toArray()
  const [count, results] = await Promise.all([baseApps.countDocuments(query), aggPromise])
  for (const result of results) {
    cleanBaseApp(publicBaseUrl, result, reqQuery.thumbnail)
    result.privateAccess = result.privateAccess || []
  }
  return { count, results }
}

export async function getStatus (req: any) {
  const promises = [
    singleStatus(req, mongoStatus, 'mongodb'),
    singleStatus(req, esStatus, 'elasticsearch'),
    singleStatus(req, jwksStatus, 'auth-directory'),
    singleStatus(req, dataDirStatus, 'data-dir')
  ]
  if (config.clamav.active) {
    promises.push(singleStatus(req, clamav.ping, 'clamav'))
  }
  const results = await Promise.all(promises)

  const errors = results.filter(r => r.status === 'error')
  if (errors.length) console.error('status has errors', errors)
  return {
    status: errors.length ? 'error' : 'ok',
    message: errors.length ? ('Problem with : ' + errors.map(s => s.name).join(', ')) : 'Service is ok',
    details: results
  }
}
