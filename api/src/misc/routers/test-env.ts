import express from 'express'
import fs from 'fs-extra'
import path from 'node:path'
import mongo from '#mongo'
import es from '#es'
import config from '#config'
import { pendingTasks } from '../../workers/tasks.ts'
import { reset as resetPing } from '../../workers/ping.ts'
import { memoizedGetPublicationSiteSettings } from '../utils/settings.ts'
import { memoizedGetDataset } from '../../datasets/service.ts'
import { clearApiKeysCache } from '../utils/api-key.ts'
import { clearApplicationKeysCaches } from '../utils/application-key.ts'
import * as rateLimiting from '../utils/rate-limiting.ts'
import testEvents from '../utils/test-events.ts'
import filesStorage from '../../files-storage/index.ts'
import { dataDir, tmpDir } from '../../datasets/utils/files.ts'
import { capturedNotifications } from '../utils/test-notif-buffer.ts'

const router = express.Router()

// Cleanup: delete test_* owned data from mongo/ES/filesystem, clear caches
router.delete('/', async (req, res, next) => {
  try {
    await resetPing()

    const testOwnerFilter = { 'owner.id': { $regex: /^test_/ } }
    const testIdFilter = { id: { $regex: /^test_/ } }

    // collect test-owned dataset IDs before deleting them (for ES index cleanup)
    const testDatasets = await mongo.datasets.find(testOwnerFilter, { projection: { id: 1 } }).toArray()

    // delete ES indices for test-owned datasets
    if (testDatasets.length > 0) {
      const indexPatterns = testDatasets.flatMap(d => [
        config.indicesPrefix + '-' + d.id + '*',
        config.indicesPrefix + '_draft-' + d.id + '*'
      ])
      await es.client.indices.delete({ index: indexPatterns.join(','), ignore_unavailable: true }).catch(() => {})
    }

    await Promise.all([
      // owner-filtered collections
      mongo.datasets.deleteMany(testOwnerFilter),
      mongo.applications.deleteMany(testOwnerFilter),
      mongo.db.collection('journals').deleteMany(testOwnerFilter),
      mongo.settings.deleteMany(testIdFilter),
      mongo.limits.deleteMany({}),
      // collections without owner (blanket delete)
      mongo.applicationsKeys.deleteMany({}),
      mongo.db.collection('locks').deleteMany({}),
      mongo.db.collection('integrity-purge').deleteMany({}),
      // the storage-accounting measure of still-locked test revisions would otherwise keep
      // counting into the freshly-reset limits and starve the next tests' storage quota
      mongo.db.collection('integrity-storage').deleteMany({}),
      mongo.db.collection('extensions-cache').deleteMany({}),
      mongo.db.collection('thumbnails-cache').deleteMany({}),
      mongo.remoteServices.deleteMany({}),
      mongo.baseApplications.deleteMany({})
    ])

    // selective directory deletion: only remove test_* owner dirs
    for (const ownerType of ['user', 'organization']) {
      const ownerTypeDir = path.join(dataDir, ownerType)
      if (await fs.pathExists(ownerTypeDir)) {
        const entries = await fs.readdir(ownerTypeDir)
        for (const entry of entries) {
          if (entry.startsWith('test_')) {
            await filesStorage.removeDir(path.join(ownerTypeDir, entry))
          }
        }
      }
    }
    // still clean tmpDir entirely
    if (await fs.pathExists(tmpDir)) {
      await fs.remove(tmpDir)
    }
    await fs.ensureDir(dataDir)
    await fs.ensureDir(tmpDir)

    memoizedGetPublicationSiteSettings.clear()
    memoizedGetDataset.clear()
    clearApiKeysCache()
    clearApplicationKeysCaches()
    rateLimiting.clear()
    testEvents.removeAllListeners()

    // re-initialize remote services and base apps from config after cleanup
    const { init: initRemoteServices } = await import('../../remote-services/service.ts')
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

// Patch a dataset document directly in MongoDB (test-only). The body is normally a flat object
// of fields to $set (backward-compatible shape), but a `$unset` key is also recognized so tests
// can simulate an out-of-band tamper that REMOVES a covered field (e.g. `file`/`originalFile`),
// not just overwrites one.
router.post('/patch-dataset/:datasetId', async (req, res, next) => {
  try {
    const { $unset, ...flatSet } = req.body ?? {}
    const update: any = {}
    if (Object.keys(flatSet).length) update.$set = flatSet
    if ($unset) update.$unset = $unset
    if (!update.$set && !update.$unset) update.$set = {}
    await mongo.datasets.updateOne({ id: req.params.datasetId }, update)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
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
    const { init } = await import('../../remote-services/service.ts')
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
    const { filter, update, upsert } = req.body
    await mongo.db.collection('dataset-data-' + req.params.datasetId).updateOne(filter, update, { upsert: !!upsert })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Delete one document in a REST dataset MongoDB collection (out-of-band tamper for integrity tests)
router.post('/rest-collection-delete-one/:datasetId', async (req, res, next) => {
  try {
    await mongo.db.collection('dataset-data-' + req.params.datasetId).deleteOne(req.body.filter)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Update one document in the settings collection (for injecting internal fields in tests)
router.post('/settings-update-one', async (req, res, next) => {
  try {
    const { filter, update } = req.body
    await mongo.settings.updateOne(filter, update)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Tamper a dataset's stored original file out-of-band (test-only, for integrity breach tests)
router.post('/tamper-dataset-file/:datasetId', async (req, res) => {
  const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
  if (!dataset) return res.status(404).send()
  const datasetUtils = await import('../../datasets/utils/index.ts')
  const { filesStorage } = await import('../../files-storage/index.ts')
  if (req.body?.delete) await filesStorage.removeFile(datasetUtils.originalFilePath(dataset))
  else await filesStorage.writeString(datasetUtils.originalFilePath(dataset), req.body?.content ?? 'tampered-out-of-band')
  res.status(204).send()
})

// Out-of-band ES tamper through the dataset's alias (integrity index-verdict tests). The alias
// resolves to exactly one index so writes through it are accepted by ES.
router.post('/es-tamper/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const esModule = await import('#es')
    const esDefault = esModule.default
    const { aliasName } = await import('../../datasets/es/commons.ts')
    const alias = aliasName(dataset)
    if (req.body?.delete) {
      await esDefault.client.deleteByQuery({ index: alias, body: { query: req.body.query }, refresh: true })
    } else if (req.body?.insert) {
      await esDefault.client.index({ index: alias, document: req.body.insert, refresh: true })
    } else {
      await esDefault.client.updateByQuery({
        index: alias,
        body: { query: req.body.query, script: { source: req.body.script, ...(req.body.params ? { params: req.body.params } : {}) } },
        refresh: true
      })
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Force a refresh of the dataset's alias so tests read a settled index before checking
router.post('/es-refresh/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const esModule = await import('#es')
    const esDefault = esModule.default
    const { aliasName } = await import('../../datasets/es/commons.ts')
    await esDefault.client.indices.refresh({ index: aliasName(dataset) })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Trigger the expired-revision purge on demand (test-only). `ignoreAge` skips the age pre-filter
// and `skewMarginMs` shrinks the clock-skew margin, so a test can exercise the real retain-until
// decision on a seconds-long lock instead of waiting out a full retention window.
router.post('/integrity-purge/run', async (req, res, next) => {
  try {
    const { purgeExpiredRevisions } = await import('../../integrity/purge.ts')
    const { integrityStore } = await import('../../integrity/store-factory.ts')
    res.json(await purgeExpiredRevisions(integrityStore(), {
      prefix: req.body?.prefix,
      ignoreAge: !!req.body?.ignoreAge,
      skewMarginMs: req.body?.skewMarginMs,
      ignoreWatermark: !!req.body?.ignoreWatermark
    }))
  } catch (err) {
    next(err)
  }
})

// Trigger the check-stale alert sweep on demand (test-only)
router.post('/integrity-stale/run', async (req, res, next) => {
  try {
    const { alertStaleChecks } = await import('../../integrity/checker.ts')
    res.json(await alertStaleChecks())
  } catch (err) {
    next(err)
  }
})

// Trigger the store-vs-Mongo integrity scope audit on demand (test-only)
router.post('/integrity-audit/run', async (req, res, next) => {
  try {
    const { auditScopes } = await import('../../integrity/audit.ts')
    const { integrityStore } = await import('../../integrity/store-factory.ts')
    res.json(await auditScopes(integrityStore(), { reclaimedMarkers: req.body?.reclaimedMarkers }))
  } catch (err) {
    next(err)
  }
})

// Trigger the integrity storage-accounting measure on demand (test-only)
router.post('/integrity-storage/run', async (req, res, next) => {
  try {
    const { measureIntegrityStorage } = await import('../../integrity/storage.ts')
    const { integrityStore } = await import('../../integrity/store-factory.ts')
    res.json(await measureIntegrityStorage(integrityStore()))
  } catch (err) {
    next(err)
  }
})

// Hold / release a lock from the locks collection (test-only): lets a test simulate a busy
// dataset (worker task in progress) and assert the integrity admin actions answer 409
router.post('/lock/:key', async (req, res, next) => {
  try {
    const locks = (await import('@data-fair/lib-node/locks.js')).default
    res.json({ ack: await locks.acquire(req.params.key, 'test-env') })
  } catch (err) {
    next(err)
  }
})
router.delete('/lock/:key', async (req, res, next) => {
  try {
    const locks = (await import('@data-fair/lib-node/locks.js')).default
    await locks.release(req.params.key)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// Trigger the api-keys expiration cron task on demand (test-only)
router.post('/api-keys-expiration/run', async (req, res, next) => {
  try {
    const { task } = await import('../../settings/api-keys-expiration-worker.ts')
    await task()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Count ES indices matching a dataset prefix
router.get('/dataset-es-indices-count/:datasetId', async (req, res, next) => {
  try {
    const { indexPrefix } = await import('../../datasets/es/manage-indices.ts')
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
    const { aliasName } = await import('../../datasets/es/commons.ts')
    const mergeDraft = (await import('../../datasets/utils/merge-draft.ts')).default
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
    const validateDcat = (await import('../utils/dcat/validate.ts')).default
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
