import express from 'express'
import fs from 'fs-extra'
import mongo from '#mongo'
import es from '#es'
import config from '#config'
import { pendingTasks } from '../../workers/tasks.ts'
import { reset as resetPing } from '../../workers/ping.ts'
import { memoizedGetPublicationSiteSettings } from '../utils/settings.ts'
import { memoizedGetDataset } from '../../datasets/service.js'
import * as rateLimiting from '../utils/rate-limiting.ts'
import testEvents from '../utils/test-events.ts'
import filesStorage from '../../files-storage/index.ts'
import { dataDir, tmpDir } from '../../datasets/utils/files.ts'
import { capturedNotifications } from '../utils/test-notif-buffer.ts'

const router = express.Router()

// Full cleanup: delete all mongo collections data, clear ES indices, empty data dirs, clear caches
router.delete('/', async (req, res, next) => {
  try {
    await resetPing()

    await Promise.all([
      mongo.datasets.deleteMany({}),
      mongo.applications.deleteMany({}),
      mongo.applicationsKeys.deleteMany({}),
      mongo.limits.deleteMany({}),
      mongo.settings.deleteMany({}),
      mongo.db.collection('locks').deleteMany({}),
      mongo.db.collection('extensions-cache').deleteMany({}),
      mongo.remoteServices.deleteMany({}),
      mongo.baseApplications.deleteMany({}),
      mongo.db.collection('journals').deleteMany({}),
      mongo.db.collection('thumbnails-cache').deleteMany({}),
      filesStorage.removeDir(dataDir),
      es.client.indices.delete({ index: config.indicesPrefix + '-*', ignore_unavailable: true }).catch(() => {})
    ])
    await fs.ensureDir(dataDir)
    await fs.ensureDir(tmpDir)
    memoizedGetPublicationSiteSettings.clear()
    memoizedGetDataset.clear()
    rateLimiting.clear()
    testEvents.removeAllListeners()

    // re-initialize remote services and base apps from config after cleanup
    const { init: initRemoteServices } = await import('../../remote-services/utils.ts')
    await initRemoteServices()
    const { init: initBaseApps } = await import('../../base-applications/router.ts')
    await initBaseApps()

    res.status(200).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Return pending tasks
router.get('/pending-tasks', (req, res) => {
  res.json(pendingTasks)
})

// Return the raw MongoDB document for a dataset (including draft field)
router.get('/raw-dataset/:id', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.id })
    if (!dataset) return res.status(404).json({ error: 'dataset not found' })
    res.json(dataset)
  } catch (err) {
    next(err)
  }
})

// Return ES index mapping/settings for a dataset
router.get('/dataset-es-info/:id', async (req, res, next) => {
  try {
    const index = `dataset-${config.mongo.url.split('/').pop()}-${req.params.id}`
    const exists = await es.client.indices.exists({ index })
    if (!exists) return res.status(404).json({ error: 'index not found' })
    const mapping = await es.client.indices.getMapping({ index })
    const settings = await es.client.indices.getSettings({ index })
    res.json({ mapping, settings })
  } catch (err) {
    next(err)
  }
})

// Check if a file exists in storage (path is relative to dataDir)
router.get('/file-exists', async (req, res, next) => {
  try {
    const filePath = req.query.path as string
    if (!filePath) return res.status(400).json({ error: 'missing path query parameter' })
    const { resolve } = await import('node:path')
    const fullPath = resolve(dataDir, filePath)
    const exists = await fs.pathExists(fullPath)
    res.json({ exists })
  } catch (err) {
    next(err)
  }
})

// Call a function in a worker thread (e.g. setEnv for testing)
router.post('/worker-call', async (req, res, next) => {
  try {
    const { workers } = await import('../../workers/tasks.ts')
    const { worker, functionName, params } = req.body
    await workers[worker as keyof typeof workers].run(params || {}, { name: functionName })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Re-initialize base applications from config
router.post('/reload-base-apps', async (req, res, next) => {
  try {
    const { init } = await import('../../base-applications/router.ts')
    await init()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Re-initialize remote services from config
router.post('/reload-remote-services', async (req, res, next) => {
  try {
    const { init } = await import('../../remote-services/utils.ts')
    await init()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Clear rate limiting only (without full data cleanup)
router.delete('/rate-limiting', (req, res) => {
  rateLimiting.clear()
  res.json({ ok: true })
})

// Clear memoized publication site settings cache
router.delete('/publication-sites-cache', (req, res) => {
  memoizedGetPublicationSiteSettings.clear()
  res.json({ ok: true })
})

// Clear memoized dataset cache
router.delete('/dataset-cache', (req, res) => {
  memoizedGetDataset.clear()
  res.json({ ok: true })
})

// Count documents in a REST dataset MongoDB collection
router.get('/rest-collection-count/:datasetId', async (req, res, next) => {
  try {
    const filter = req.query.filter ? JSON.parse(req.query.filter as string) : {}
    const count = await mongo.db.collection('dataset-data-' + req.params.datasetId).countDocuments(filter)
    res.json({ count })
  } catch (err) {
    next(err)
  }
})

// Find one document in a REST dataset MongoDB collection
router.get('/rest-collection-find-one/:datasetId', async (req, res, next) => {
  try {
    const filter = req.query.filter ? JSON.parse(req.query.filter as string) : {}
    const projection = req.query.projection ? JSON.parse(req.query.projection as string) : undefined
    const doc = await mongo.db.collection('dataset-data-' + req.params.datasetId).findOne(filter, { projection })
    res.json(doc)
  } catch (err) {
    next(err)
  }
})

// Update one document in a REST dataset MongoDB collection
router.post('/rest-collection-update-one/:datasetId', async (req, res, next) => {
  try {
    const { filter, update } = req.body
    await mongo.db.collection('dataset-data-' + req.params.datasetId).updateOne(filter, update)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Count ES indices matching a dataset prefix
router.get('/dataset-es-indices-count/:datasetId', async (req, res, next) => {
  try {
    const { indexPrefix } = await import('../../datasets/es/manage-indices.js')
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).json({ error: 'dataset not found' })
    const indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*` })
    res.json({ count: Object.keys(indices).length })
  } catch (err) {
    next(err)
  }
})

// Get ES alias name for a dataset
router.get('/dataset-es-alias-name/:datasetId', async (req, res, next) => {
  try {
    const { aliasName } = await import('../../datasets/es/commons.js')
    const mergeDraft = (await import('../../datasets/utils/merge-draft.js')).default
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).json({ error: 'dataset not found' })
    if (dataset.draft) mergeDraft(dataset)
    res.json({ aliasName: aliasName(dataset) })
  } catch (err) {
    next(err)
  }
})

// List attachment files for a dataset
router.get('/ls-attachments/:datasetId', async (req, res, next) => {
  try {
    const { lsAttachments } = await import('../../datasets/utils/files.ts')
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).json({ error: 'dataset not found' })
    const files = await lsAttachments(dataset)
    res.json({ files })
  } catch (err) {
    next(err)
  }
})

// Emit a WebSocket event via wsEmitter
router.post('/ws-emit', async (req, res, next) => {
  try {
    const wsEmitter = await import('@data-fair/lib-node/ws-emitter.js')
    const { channel, data } = req.body
    await wsEmitter.emit(channel, data)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Validate DCAT JSON
router.post('/validate-dcat', async (req, res, next) => {
  try {
    const validateDcat = (await import('../utils/dcat/validate.js')).default
    const valid = validateDcat(req.body)
    res.json({ valid, errors: valid ? undefined : validateDcat.errors })
  } catch (err) {
    next(err)
  }
})

// Set an environment variable in the main process (for testing)
router.post('/set-env', (req, res, next) => {
  try {
    const { key, value } = req.body
    if (value === undefined || value === null) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Set a config value (for testing)
router.post('/set-config', (req, res, next) => {
  try {
    const { path, value } = req.body
    const parts = path.split('.')
    let obj: any = config
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]]
    }
    obj[parts[parts.length - 1]] = value
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Notification capture via shared buffer module
router.post('/events/start', (req, res) => {
  res.json({ offset: capturedNotifications.length })
})

router.get('/events/buffer', (req, res) => {
  const offset = parseInt(req.query.offset as string) || 0
  res.json(capturedNotifications.slice(offset))
})

// SSE stream of testEvents emissions
router.get('/events', (req, res) => {
  req.socket.setNoDelay(true)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.flushHeaders()

  const onEvent = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const onNotification = (data: any) => onEvent('notification', data)
  const onExtensionInputs = (data: any) => onEvent('extension-inputs', data)
  const onWebhook = (data: any) => onEvent('webhook', data)
  testEvents.on('notification', onNotification)
  testEvents.on('extension-inputs', onExtensionInputs)
  testEvents.on('webhook', onWebhook)

  req.on('close', () => {
    testEvents.off('notification', onNotification)
    testEvents.off('extension-inputs', onExtensionInputs)
    testEvents.off('webhook', onWebhook)
  })
})

export default router
