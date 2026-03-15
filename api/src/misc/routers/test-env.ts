import express from 'express'
import fs from 'fs-extra'
import mongo from '#mongo'
import es from '#es'
import config from '#config'
import { pendingTasks } from '../../workers/tasks.ts'
import { reset as resetPing } from '../../workers/ping.ts'
import { memoizedGetPublicationSiteSettings } from '../utils/settings.ts'
import * as rateLimiting from '../utils/rate-limiting.ts'
import testEvents from '../utils/test-events.ts'
import filesStorage from '../../files-storage/index.ts'
import { dataDir, tmpDir } from '../../datasets/utils/files.ts'

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
      filesStorage.removeDir(dataDir),
      es.client.indices.delete({ index: config.indicesPrefix + '-*', ignore_unavailable: true }).catch(() => {})
    ])
    await fs.ensureDir(dataDir)
    await fs.ensureDir(tmpDir)
    memoizedGetPublicationSiteSettings.clear()
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

// SSE stream of testEvents emissions
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })

  const onEvent = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const onNotification = (data: any) => onEvent('notification', data)
  const onExtensionInputs = (data: any) => onEvent('extension-inputs', data)
  testEvents.on('notification', onNotification)
  testEvents.on('extension-inputs', onExtensionInputs)

  req.on('close', () => {
    testEvents.off('notification', onNotification)
    testEvents.off('extension-inputs', onExtensionInputs)
  })
})

export default router
